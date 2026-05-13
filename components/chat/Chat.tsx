"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  categoryFor,
  confidenceBand,
  formatHrs,
  totalHoursSaved,
} from "@/lib/decision-display";
import { Chip } from "@/components/ui/Chip";
import { PillSearchBar } from "@/components/ui/PillSearchBar";
import { NoPhiNotice } from "@/components/ui/NoPhiNotice";
import type {
  ClarifierWidget,
  ClarifierSubmission,
} from "@/components/chat/widgets/types";
import { InChatSlider } from "@/components/chat/widgets/InChatSlider";
import { InChatStepper } from "@/components/chat/widgets/InChatStepper";
import { InChatRangePicker } from "@/components/chat/widgets/InChatRangePicker";
import { InChatChips } from "@/components/chat/widgets/InChatChips";
import { FormFallbackLink } from "@/components/chat/widgets/FormFallbackLink";
import { SurveyCard } from "@/components/chat/widgets/SurveyCard";
import {
  formatSubmissionAsMessage,
  type Survey,
  type SurveySubmission,
} from "@/lib/engine/survey";
import { deriveFlowState, type MessageForFlow } from "@/lib/chat/flow-state";

// ─── Types (mirror /api/chat response shape) ────────────────────────────

interface OfferHelpAffordance {
  kind: "offer-decision-help";
  suggestedPath: "decision" | "recommendation";
  rationale: string;
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  /** C6b — optional clarifier widget attached to an assistant message.
   *  Persisted into localStorage; once submitted, the message remains in the
   *  log with `clarifierResolved: true` so we don't re-render the widget. */
  clarifier?: ClarifierWidget;
  /** Inferred template id at the time this clarifier was emitted — drives
   *  the FormFallbackLink inside the FIRST clarifier bubble. */
  inferredTemplateId?: "capacity" | "pricing" | "admin-hire" | null;
  /** Set to true once the user has submitted (or skipped) the clarifier so
   *  the widget UI is no longer interactive on this message. */
  clarifierResolved?: boolean;
  /** Phase-1 chat-as-decision-front-door — optional offer-help affordance
   *  emitted when the user's latest message scored as a decision-shaped
   *  question. Renders below the assistant text as a chip the user can
   *  accept or dismiss. */
  offerHelp?: OfferHelpAffordance;
  /** Set when the user has acted on (or dismissed) the offer so the chip
   *  doesn't re-render on revisit. */
  offerHelpResolved?: boolean;
  /** Phase-2 — survey rendered inline below the assistant message when
   *  the user accepted the offer-help affordance. */
  survey?: Survey;
  /** Marks the survey on this message as submitted so the card freezes. */
  surveyResolved?: boolean;
  /** Phase-4 — when the engine produced a result from a saved survey,
   *  this carries the survey + the original question so the user can
   *  promote the flow to a reusable skill. */
  savedFromSurvey?: { survey: Survey; originalQuestion: string };
  /** Set when the user has saved (or dismissed) the skill-save offer. */
  saveSkillResolved?: boolean;
}

interface DecisionPayload {
  decisionId: string;
  decidedAt: string;
  recommendation: { option: string; confidence: number; rationale: string };
  alternatives: Array<{ option: string; reason: string }>;
  robustAlternative: { option: string; why: string };
  workloadReducers: Array<{
    type: "prompt" | "playbook" | "skill";
    title: string;
    description: string;
    artifact: {
      promptText?: string;
      playbookSteps?: string[];
      skillName?: string;
    };
    permission_tier: string;
    estTimeSavingHrsPerWeek?: number;
  }>;
}

interface ChatThread {
  messages: ChatMessage[];
  decision?: DecisionPayload;
  painPoints?: string[];
  templateId?: string;
}

const STORAGE_KEY = "dd:chat:thread:v2";

const OPENING: ChatMessage = {
  role: "assistant",
  content:
    "Hi. Tell me where the hours go in a normal week. I'll rank what AI can take off your plate and ship you a starter skill so the time comes back this week.",
};

const QUICK_PROMPTS = [
  "Insurance pre-auth eats Mondays",
  "Patient intake forms take 20 min each",
  "I draft 6 letters/week to PCPs",
];

// ─── Component ──────────────────────────────────────────────────────────

export function Chat({ seed }: { seed?: string } = {}) {
  const [thread, setThread] = useState<ChatThread>({ messages: [OPENING] });
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  // F-11: decline-and-reframe chips returned by the API when the user's
  // question is out of scope (Type 2/3/5/etc). Two short canned reframes
  // the user can tap to redirect the conversation to a Type-4 decision.
  const [reframeChips, setReframeChips] = useState<string[] | null>(null);
  // E5: remember the user's original question so the "Stay with original"
  // chip can re-submit it with userOverrode=true and bypass the classifier
  // decline path. Cleared whenever the chips are dismissed.
  const [originalQuestion, setOriginalQuestion] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const seedFiredRef = useRef(false);

  // Restore prior thread on mount.
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as ChatThread;
      if (Array.isArray(parsed.messages) && parsed.messages.length > 0) {
        setThread(parsed);
      }
    } catch {
      /* ignore */
    }
  }, []);

  // Persist whenever the thread changes.
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(thread));
    } catch {
      /* quota exceeded etc. */
    }
  }, [thread]);

  // Autoscroll on new message / decision.
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [thread.messages.length, thread.decision]);

  const reset = () => {
    setThread({ messages: [OPENING] });
    setErr(null);
    setInput("");
    setReframeChips(null);
    setOriginalQuestion(null);
    if (typeof window !== "undefined") window.localStorage.removeItem(STORAGE_KEY);
  };

  // SINGLE submit path — replaces the previous duplicate `send` + `sendQuick`
  // (audit item #9 in the goal). Accepts an optional override text so the
  // suggested-prompt chips can submit before React state has flushed.
  //
  // E5: `userOverrode` short-circuits the Stage-0 classifier on the server,
  // letting the user's original out-of-scope question run through the
  // closest-fit pipeline anyway. The methodTrace records this so evals can
  // tell user-overridden from policy-aligned runs.
  const runQuery = useCallback(
    async (
      overrideText?: string,
      options?: {
        userOverrode?: boolean;
        engageSurvey?: {
          question: string;
          suggestedPath: "decision" | "recommendation";
          rationale?: string;
        };
        submitSurvey?: {
          userQuestion: string;
          survey: Survey;
          submission: SurveySubmission;
        };
      },
    ) => {
      const text = (overrideText ?? input).trim();
      if (!text || busy) return;
      setErr(null);
      setBusy(true);
      setInput("");

      const next: ChatMessage[] = [
        ...thread.messages,
        { role: "user", content: text },
      ];
      setThread((t) => ({ ...t, messages: next, decision: undefined }));

      try {
        // Compute the chat-flow FSM state from the thread BEFORE the new
        // user message landed — that's the state the server should reason
        // about when deciding whether to re-detect intent. Walking the
        // existing thread.messages (not `next`) gives the correct gate.
        const clientFlowState = deriveFlowState(
          thread.messages as readonly MessageForFlow[],
        ).state;
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            messages: next,
            clientFlowState,
            ...(options?.userOverrode ? { userOverrode: true } : {}),
            ...(options?.engageSurvey
              ? { engageSurvey: options.engageSurvey }
              : {}),
            ...(options?.submitSurvey
              ? { submitSurvey: options.submitSurvey }
              : {}),
          }),
        });

        if (res.status === 401) {
          throw new Error("Please sign in to start a conversation.");
        }
        if (res.status === 429) {
          const j = await res.json().catch(() => ({}));
          throw new Error(
            j?.message ?? "Daily limit reached (20). Try again tomorrow.",
          );
        }
        if (!res.ok) {
          throw new Error(`Request failed (${res.status})`);
        }

        const data = (await res.json()) as
          | {
              status: "asking";
              reply: string;
              // F-11: present when classifier redirects an out-of-scope question.
              reframeChips?: string[];
              // Phase 1: decision-detector affordance, optional.
              offerHelp?: OfferHelpAffordance;
            }
          | {
              status: "clarifier";
              reply: string;
              widget: ClarifierWidget;
              inferredTemplateId?: "capacity" | "pricing" | "admin-hire" | null;
              // Phase-1 fix: clarifier responses can also carry the
              // decision-detector affordance.
              offerHelp?: OfferHelpAffordance;
            }
          | {
              status: "survey";
              reply: string;
              survey: Survey;
            }
          | {
              status: "ready";
              reply: string;
              decision: DecisionPayload;
              painPoints?: string[];
              templateId?: string;
            }
          | {
              status: "recommendation";
              reply: string;
              recommendation: {
                recommendedTask: string;
                whyThisTask: string;
                confidence: number;
                successMetric?: string;
                tryThisWeek?: string[];
                guardrails?: string[];
              };
            };

        setThread((t) => {
          // For recommendation responses, the LLM-side "reply" is a short
          // ack; render the full structured recommendation below it.
          let content = data.reply;
          if (data.status === "recommendation") {
            const r = data.recommendation;
            const parts = [
              `**${r.recommendedTask}**`,
              `_${r.whyThisTask}_`,
              `Confidence: ${r.confidence}%`,
            ];
            if (r.tryThisWeek && r.tryThisWeek.length > 0) {
              parts.push(
                "\nTry this week:\n" +
                  r.tryThisWeek.map((t) => `- ${t}`).join("\n"),
              );
            }
            if (r.successMetric) {
              parts.push(`\nSuccess metric: ${r.successMetric}`);
            }
            content = parts.join("\n\n");
          }
          const newMessage: ChatMessage = {
            role: "assistant",
            content,
            ...(data.status === "clarifier"
              ? {
                  clarifier: data.widget,
                  inferredTemplateId: data.inferredTemplateId ?? null,
                }
              : {}),
            ...((data.status === "asking" || data.status === "clarifier") &&
            data.offerHelp
              ? { offerHelp: data.offerHelp }
              : {}),
            ...(data.status === "survey" ? { survey: data.survey } : {}),
            // Phase-4 — when the engine result came from a submitted
            // survey, surface the "Save as skill" affordance on the
            // resulting assistant bubble.
            ...((data.status === "ready" || data.status === "recommendation") &&
            options?.submitSurvey
              ? {
                  savedFromSurvey: {
                    survey: options.submitSurvey.survey,
                    originalQuestion: options.submitSurvey.userQuestion,
                  },
                }
              : {}),
          };
          return {
            ...t,
            messages: [...t.messages, newMessage],
            decision: data.status === "ready" ? data.decision : undefined,
            painPoints: data.status === "ready" ? data.painPoints : undefined,
            templateId: data.status === "ready" ? data.templateId : undefined,
          };
        });
        // F-11: surface reframe chips when present (else clear stale ones).
        const showingChips =
          data.status === "asking" &&
          Array.isArray(data.reframeChips) &&
          data.reframeChips.length > 0;
        setReframeChips(showingChips ? data.reframeChips! : null);
        // E5: when chips appear, remember the user's original message so
        // the "Stay with original question" chip can re-send it with the
        // server-side classifier override. Clear once we move past the
        // decline path (chips dismissed OR decision rendered).
        if (showingChips) {
          setOriginalQuestion(text);
        } else {
          setOriginalQuestion(null);
        }
      } catch (e) {
        setErr(e instanceof Error ? e.message : String(e));
      } finally {
        setBusy(false);
      }
    },
    [busy, input, thread.messages],
  );

  const isEmptyState =
    thread.messages.length === 1 && thread.messages[0]?.role === "assistant";

  // C6b — clarifier widget submission. Marks the source message as resolved
  // (so the widget UI freezes), then posts the value as a normal user
  // message. Display string is what the user sees in their bubble; raw value
  // is unused here since /api/chat operates on the message log alone.
  const submitClarifier = useCallback(
    (sourceMessageIndex: number, sub: ClarifierSubmission) => {
      setThread((t) => {
        const next = [...t.messages];
        const src = next[sourceMessageIndex];
        if (src) {
          next[sourceMessageIndex] = { ...src, clarifierResolved: true };
        }
        return { ...t, messages: next };
      });
      runQuery(`${sub.fieldId}: ${sub.display}`);
    },
    [runQuery],
  );

  const skipClarifier = useCallback(
    (sourceMessageIndex: number) => {
      setThread((t) => {
        const next = [...t.messages];
        const src = next[sourceMessageIndex];
        if (src) {
          next[sourceMessageIndex] = { ...src, clarifierResolved: true };
        }
        return { ...t, messages: next };
      });
      // Hand the conversation back to free-text — the LLM will re-ask in a
      // sentence. Posting "I'm not sure on that one" gives it a clean signal.
      runQuery("I'm not sure on that one. Can you ask differently?");
    },
    [runQuery],
  );

  // First clarifier in the thread = the earliest assistant message that has
  // a clarifier attached. Used to hide the form-fallback link on subsequent
  // clarifiers.
  const firstClarifierIndex = thread.messages.findIndex(
    (m) => m.role === "assistant" && m.clarifier,
  );

  // Phase-1 chat-as-decision-front-door — accept the offer-help chip:
  // mark the affordance resolved + send a user message that primes the
  // existing intake flow. The actual survey generation ships in Phase 2.
  const acceptOfferHelp = useCallback(
    (sourceMessageIndex: number) => {
      // Read the suggested path + the user's most recent question BEFORE
      // setState (closure trap avoidance).
      const src = thread.messages[sourceMessageIndex];
      const offer =
        src && src.role === "assistant" ? src.offerHelp : undefined;
      const suggested: "decision" | "recommendation" =
        offer?.suggestedPath ?? "decision";
      // The user's decision question is the most recent user message
      // BEFORE this assistant message.
      const question =
        [...thread.messages.slice(0, sourceMessageIndex)]
          .reverse()
          .find((m) => m.role === "user")?.content ?? "";

      setThread((t) => {
        const next = [...t.messages];
        const at = next[sourceMessageIndex];
        if (at && at.role === "assistant") {
          next[sourceMessageIndex] = { ...at, offerHelpResolved: true };
        }
        return { ...t, messages: next };
      });
      const followUp =
        suggested === "recommendation"
          ? "Yes — walk me through getting a recommendation."
          : "Yes — walk me through deciding this.";
      runQuery(followUp, {
        engageSurvey: question
          ? {
              question,
              suggestedPath: suggested,
              rationale: offer?.rationale,
            }
          : undefined,
      });
    },
    [runQuery, thread.messages],
  );

  const dismissOfferHelp = useCallback((sourceMessageIndex: number) => {
    setThread((t) => {
      const next = [...t.messages];
      const src = next[sourceMessageIndex];
      if (src && src.role === "assistant") {
        next[sourceMessageIndex] = { ...src, offerHelpResolved: true };
      }
      return { ...t, messages: next };
    });
  }, []);

  // Phase-4 — save the chat-generated survey as a reusable skill. The
  // user can re-run the same decision flow next time from /app/skills.
  // Inline button by default; expand option for name + custom
  // instructions before saving. State per-message so multiple saves in
  // the same thread don't collide.
  const saveSurveyAsSkill = useCallback(
    async (
      sourceMessageIndex: number,
      payload: { name?: string; customInstructions?: string },
    ): Promise<{ ok: true } | { ok: false; error: string }> => {
      const src = thread.messages[sourceMessageIndex];
      const data = src && src.role === "assistant" ? src.savedFromSurvey : undefined;
      if (!data) return { ok: false, error: "Nothing to save on this message." };
      try {
        const res = await fetch("/api/chat/save-skill", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            name: payload.name,
            customInstructions: payload.customInstructions,
            survey: data.survey,
            originalQuestion: data.originalQuestion,
          }),
        });
        const json = (await res.json().catch(() => ({}))) as {
          error?: string;
          message?: string;
        };
        if (!res.ok) {
          return {
            ok: false,
            error: json.message || json.error || `Save failed (${res.status})`,
          };
        }
        setThread((t) => {
          const nextMsgs = [...t.messages];
          const at = nextMsgs[sourceMessageIndex];
          if (at && at.role === "assistant") {
            nextMsgs[sourceMessageIndex] = { ...at, saveSkillResolved: true };
          }
          return { ...t, messages: nextMsgs };
        });
        return { ok: true };
      } catch (err) {
        return {
          ok: false,
          error: err instanceof Error ? err.message : "Save failed",
        };
      }
    },
    [thread.messages],
  );

  const dismissSaveSkill = useCallback((sourceMessageIndex: number) => {
    setThread((t) => {
      const next = [...t.messages];
      const src = next[sourceMessageIndex];
      if (src && src.role === "assistant") {
        next[sourceMessageIndex] = { ...src, saveSkillResolved: true };
      }
      return { ...t, messages: next };
    });
  }, []);

  // Phase-2/3 — submit the survey: format the answers as a human-readable
  // user message (so the thread stays readable) AND attach the structured
  // submitSurvey payload (so the route can run the engine directly via
  // the survey-adapter, skipping the conversational re-intake). On
  // adapter failure, the route falls through and the formatted user
  // message still drives the existing intake.
  const submitSurvey = useCallback(
    (sourceMessageIndex: number, submission: SurveySubmission) => {
      const src = thread.messages[sourceMessageIndex];
      const survey =
        src && src.role === "assistant" ? src.survey : undefined;
      if (!survey) return;
      // Find the user's original decision question (most recent user
      // message before the survey card was emitted).
      const userQuestion =
        [...thread.messages.slice(0, sourceMessageIndex)]
          .reverse()
          .find((m) => m.role === "user")?.content ?? "";
      setThread((t) => {
        const next = [...t.messages];
        const at = next[sourceMessageIndex];
        if (at && at.role === "assistant") {
          next[sourceMessageIndex] = { ...at, surveyResolved: true };
        }
        return { ...t, messages: next };
      });
      runQuery(formatSubmissionAsMessage(survey, submission), {
        submitSurvey: userQuestion
          ? { userQuestion, survey, submission }
          : undefined,
      });
    },
    [runQuery, thread.messages],
  );

  // Seed handling: when arriving via /app/chat?seed=<text>, auto-submit once
  // on the opening assistant message. Ref guard prevents re-fire on remount
  // (e.g., HMR or strict-mode double-invoke).
  useEffect(() => {
    if (!seed || seedFiredRef.current) return;
    if (!isEmptyState) return;
    seedFiredRef.current = true;
    runQuery(seed);
  }, [seed, isEmptyState, runQuery]);

  return (
    <main className="mx-auto flex min-h-[calc(100vh-5rem)] w-full max-w-3xl flex-col">
      {/* HERO VALUE PROP — only on empty state, ink-only */}
      {isEmptyState && (
        <article className="dd-fade-up mb-6 rounded-2xl border border-line bg-paper p-6 sm:p-8">
          <p className="text-[12px] font-medium uppercase tracking-[0.12em] text-mute">
            Tell me what's eating your time
          </p>
          <h1 className="mt-2 text-display sm:text-display-lg tracking-tight text-text">
            I'll rank what AI can take off your plate, and build the skill to do it.
          </h1>
          <p className="mt-3 max-w-xl text-[15px] leading-snug text-mute sm:text-[16px]">
            Five-minute conversation. You get a ranked list of capacity drains, an
            AI-feasibility score for each, and a paste-ready skill or playbook for
            the top one, so the time comes back this week, not "someday."
          </p>
          <p className="mt-3 text-[12.5px] text-mute">
            Already know the shape of it?{" "}
            <Link
              href="/app/history/new"
              className="text-text underline decoration-line underline-offset-2 hover:text-ink"
            >
              Pick a template instead →
            </Link>
          </p>
        </article>
      )}

      {/* "Start over" — only when there's a real thread, never on empty state */}
      {!isEmptyState && (
        <div className="-mt-2 mb-2 flex justify-end">
          <button
            type="button"
            onClick={reset}
            className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-[12px] text-mute transition-colors duration-150 hover:text-text focus:outline-none focus-visible:ring-[3px] focus-visible:ring-ink/20"
          >
            <svg
              viewBox="0 0 24 24"
              className="h-3.5 w-3.5"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              aria-hidden
            >
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6l-2 14H7L5 6" />
            </svg>
            Start over
          </button>
        </div>
      )}

      {/* MESSAGE LIST */}
      <ul
        className="flex-1 space-y-4 overflow-y-auto pb-44"
        aria-live="polite"
      >
        {thread.messages.map((m, i) => (
          <li
            key={i}
            className={
              "dd-fade-up flex flex-col gap-0 " +
              (m.role === "user" ? "items-end" : "items-start")
            }
          >
            <div
              className={
                "max-w-[85%] rounded-2xl border border-line bg-paper px-4 py-2.5 text-[15px] leading-relaxed text-text " +
                "whitespace-pre-wrap break-words " +
                (m.role === "user" ? "rounded-tr-sm" : "rounded-tl-sm")
              }
            >
              {m.content}
            </div>

            {/* C6b — render the clarifier widget below the assistant text.
                Hidden once resolved; freezes after submission so users can
                see what they answered without being able to re-edit. */}
            {m.role === "assistant" && m.clarifier && !m.clarifierResolved && (
              <div className="w-full max-w-[85%]">
                <ClarifierRenderer
                  widget={m.clarifier}
                  disabled={busy}
                  onSubmit={(sub) => submitClarifier(i, sub)}
                  onUnsure={() => skipClarifier(i)}
                />
                <FormFallbackLink
                  inferredTemplateId={m.inferredTemplateId}
                  isFirstClarifier={i === firstClarifierIndex}
                />
              </div>
            )}

            {/* Phase-1 chat-as-decision-front-door — inline affordance chip
                offering to engage the decision flow when the user's latest
                message classified as a decision-shaped question. Click
                accepts the offer (engages future-phase intake); × dismisses
                so the chip doesn't return after refresh. */}
            {m.role === "assistant" &&
              m.offerHelp &&
              !m.offerHelpResolved && (
                <div className="mt-1.5 max-w-[85%]">
                  <OfferHelpChip
                    affordance={m.offerHelp}
                    disabled={busy}
                    onAccept={() => acceptOfferHelp(i)}
                    onDismiss={() => dismissOfferHelp(i)}
                  />
                </div>
              )}

            {/* Phase-2 — adaptive survey card. Renders below the assistant
                message when the route emits status:"survey". Freezes once
                submitted (mirrors the clarifier pattern). */}
            {m.role === "assistant" &&
              m.survey &&
              !m.surveyResolved && (
                <div className="mt-2 w-full max-w-[85%]">
                  <SurveyCard
                    survey={m.survey}
                    disabled={busy}
                    onSubmit={(sub) => submitSurvey(i, sub)}
                  />
                </div>
              )}

            {/* Phase-4 — save the decision flow as a reusable skill.
                Inline by default with an expand for name + custom
                instructions before saving. Hidden once saved or
                dismissed. */}
            {m.role === "assistant" &&
              m.savedFromSurvey &&
              !m.saveSkillResolved && (
                <div className="mt-2 max-w-[85%]">
                  <SaveAsSkillAffordance
                    defaultName={m.savedFromSurvey.survey.title}
                    onSave={(payload) => saveSurveyAsSkill(i, payload)}
                    onDismiss={() => dismissSaveSkill(i)}
                  />
                </div>
              )}
          </li>
        ))}

        {/* Suggested-prompt chips — empty state only */}
        {isEmptyState && !busy && (
          <li className="flex flex-wrap gap-2">
            {QUICK_PROMPTS.map((t) => (
              <Chip key={t} tone="default" onClick={() => runQuery(t)}>
                {t}
              </Chip>
            ))}
          </li>
        )}

        {/* Inline assistant action chips — visible after a real exchange,
            three Miller-friendly options. Hidden during empty state, busy,
            reframe-chip flow, and after a decision lands (the DecisionCard
            carries its own actions). */}
        {!isEmptyState &&
          !busy &&
          !reframeChips &&
          !thread.decision && (
            <li className="flex flex-wrap gap-2" aria-label="Quick actions">
              <Link href="/app/history/new" tabIndex={-1}>
                <Chip tone="default">Run the survey</Chip>
              </Link>
              <Chip
                tone="default"
                onClick={() => {
                  setInput("");
                  // Focus the composer by querying its input.
                  document
                    .querySelector<HTMLInputElement>('input[aria-label="search"]')
                    ?.focus();
                }}
              >
                Reframe
              </Chip>
              <Chip
                tone="default"
                onClick={() =>
                  runQuery("Show me other angles on the same problem")
                }
              >
                Show alternatives
              </Chip>
            </li>
          )}

        {/* F-11 decline-and-reframe chips — surfaced when the classifier
            redirected an out-of-scope question (diagnostic / predictive /
            optimization / descriptive / sequential). Tapping one re-runs
            the conversation with the reframed prompt as the next user msg.

            E5 — Stay-with-original-question fallback: a third chip is
            always present alongside the reframe options so the user
            isn't trapped. Tapping it re-sends their ORIGINAL question
            with userOverrode=true, which short-circuits the classifier
            decline server-side and runs the closest-fit pipeline. The
            override is recorded in methodTrace. */}
        {reframeChips && reframeChips.length > 0 && !busy && (
          <li
            className="flex flex-wrap gap-2"
            aria-label="Reframe suggestions"
          >
            {reframeChips.map((t) => (
              <Chip
                key={t}
                tone="selected"
                onClick={() => {
                  setReframeChips(null);
                  runQuery(t);
                }}
              >
                {t}
              </Chip>
            ))}
            {originalQuestion && (
              <Chip
                key="__user-override"
                tone="default"
                aria-label="Run my original question anyway"
                onClick={() => {
                  const q = originalQuestion;
                  setReframeChips(null);
                  setOriginalQuestion(null);
                  runQuery(q, { userOverrode: true });
                }}
              >
                Stay with my original question
              </Chip>
            )}
          </li>
        )}

        {/* Skeleton thinking state */}
        {busy && (
          <li className="flex justify-start">
            <div
              className="max-w-[85%] space-y-2 rounded-2xl rounded-tl-sm border border-line bg-paper px-4 py-3"
              aria-label="Thinking"
            >
              <span className="block h-3 w-48 rounded-full bg-line animate-pulse" />
              <span className="block h-3 w-64 rounded-full bg-line animate-pulse" />
              <span className="block h-3 w-32 rounded-full bg-line animate-pulse" />
            </div>
          </li>
        )}

        {thread.decision && (
          <li className="mt-4">
            <DecisionCard
              decision={thread.decision}
              painPoints={thread.painPoints ?? []}
              templateId={thread.templateId}
            />
          </li>
        )}

        <div ref={endRef} />
      </ul>

      {err && (
        <p className="mb-2 text-sm text-mute" role="alert">
          {err}
        </p>
      )}

      {/* COMPOSER — PillSearchBar primitive (28px radius, 1.5px ink border) */}
      <div className="sticky bottom-0 mt-3">
        <NoPhiNotice />
        <PillSearchBar
          value={input}
          onChange={setInput}
          onSubmit={(v) => runQuery(v)}
          placeholder="Tell me where the hours go…"
          disabled={busy}
          ariaLabel="message"
          multiline
          maxRows={8}
        />
        <p className="mt-2 text-center text-[12px] text-mute">
          no PHI · responses use the math under "show the work"
        </p>
      </div>
    </main>
  );
}

// ─── C6b — Clarifier widget dispatcher ──────────────────────────────────
//
// Discriminates on widget.kind and renders the matching In-chat widget. Kept
// inline here so the message-map stays readable.

function ClarifierRenderer({
  widget,
  onSubmit,
  onUnsure,
  disabled,
}: {
  widget: ClarifierWidget;
  onSubmit: (s: ClarifierSubmission) => void;
  onUnsure: () => void;
  disabled?: boolean;
}) {
  switch (widget.kind) {
    case "slider":
      return (
        <InChatSlider
          widget={widget}
          onSubmit={onSubmit}
          onUnsure={onUnsure}
          disabled={disabled}
        />
      );
    case "stepper":
      return (
        <InChatStepper
          widget={widget}
          onSubmit={onSubmit}
          onUnsure={onUnsure}
          disabled={disabled}
        />
      );
    case "range":
      return (
        <InChatRangePicker
          widget={widget}
          onSubmit={onSubmit}
          onUnsure={onUnsure}
          disabled={disabled}
        />
      );
    case "chips":
      return (
        <InChatChips
          widget={widget}
          onSubmit={onSubmit}
          onUnsure={onUnsure}
          disabled={disabled}
        />
      );
  }
}

// ─── In-thread Decision card ────────────────────────────────────────────
//
// NOTE: This component is replaced wholesale in C7 (3-tier pyramid).
// C6a leaves it intact so the chat-to-decision flow keeps working
// end-to-end; the legacy classes here will be removed by C7 + C11 cleanup.

function DecisionCard({
  decision,
  painPoints,
  templateId,
}: {
  decision: DecisionPayload;
  painPoints: string[];
  templateId: string | undefined;
}) {
  const conf = decision.recommendation.confidence;
  const band = confidenceBand(conf);
  const cat = categoryFor(templateId);
  const hoursBack = totalHoursSaved(decision.workloadReducers);
  const topReducer = decision.workloadReducers[0];
  const restReducers = decision.workloadReducers.slice(1);

  return (
    <article className="dd-fade-up overflow-hidden rounded-xl border border-line bg-paper shadow-card">
      {/* HERO — time-back is the headline, confidence is a chip.
          UI Guidelines v0.1: ink-on-paper, no gradient hero, no white-on-coral. */}
      <div className="relative overflow-hidden border-b border-line bg-paper p-6 sm:p-7">
        <p className="text-[11px] font-semibold uppercase tracking-[.14em] text-mute">
          What we built · primary outcome
        </p>
        {hoursBack > 0 ? (
          <p className="mt-2 text-display sm:text-display-lg tracking-tight text-ink">
            🕐 {formatHrs(hoursBack)}/wk back
          </p>
        ) : (
          <p className="mt-2 text-display sm:text-display-lg tracking-tight text-ink">
            {decision.recommendation.option}
          </p>
        )}
        {hoursBack > 0 && (
          <p className="mt-2 max-w-xl text-[15px] leading-snug text-mute sm:text-[16px]">
            {decision.recommendation.option}
          </p>
        )}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="inline-flex h-7 items-center gap-1.5 rounded-full border border-ink bg-paper px-2.5 text-[12px] font-semibold text-ink">
            {band.icon} {band.label} · {conf}%
          </span>
          {painPoints.length > 0 && (
            <span className="inline-flex h-7 items-center gap-1.5 rounded-full border border-line bg-paper px-2.5 text-[12px] text-mute">
              Heard you on: {painPoints.join(" · ")}
            </span>
          )}
        </div>
      </div>

      {/* SKILL CARD — top reducer leads (skills-first hierarchy).
          Ink-only: bg-paper with subtle line border, no gradient skill pill. */}
      {topReducer && (
        <section className="border-b border-line bg-paper p-6 sm:p-7">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <span className="inline-flex h-7 items-center rounded-full border border-ink bg-ink px-2.5 text-[11px] font-semibold uppercase tracking-[.12em] text-paper">
              🛠️ Skill ready
            </span>
            <span className="text-[11px] font-semibold text-mute">
              ~1 min to ship
            </span>
          </div>
          <h2 className="mt-3 text-h2 sm:text-h2-lg text-ink">
            {topReducer.title}
          </h2>
          <p className="mt-1.5 text-[14px] leading-relaxed text-ink">
            {topReducer.description}
          </p>

          {topReducer.artifact.promptText && (
            <pre className="mt-3 max-h-48 overflow-auto whitespace-pre-wrap rounded-[10px] border border-line bg-paper p-3 text-[12px] leading-relaxed text-ink">
              {topReducer.artifact.promptText}
            </pre>
          )}
          {topReducer.artifact.playbookSteps && (
            <ol className="mt-3 list-decimal space-y-1 rounded-[10px] border border-line bg-paper p-3 pl-7 text-[13px] leading-relaxed text-ink">
              {topReducer.artifact.playbookSteps.map((s, j) => (
                <li key={j}>{s}</li>
              ))}
            </ol>
          )}

          {topReducer.artifact.promptText && (
            <div className="mt-3 grid grid-cols-2 gap-2">
              <CopyButton text={topReducer.artifact.promptText} />
              <Link
                href={`/app/history/${decision.decisionId}`}
                className="inline-flex h-10 items-center justify-center gap-1.5 rounded-[10px] border border-ink bg-paper text-[13px] font-semibold text-ink transition-colors hover:bg-line/40 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ink/20"
              >
                See full plan →
              </Link>
            </div>
          )}
        </section>
      )}

      {/* RATIONALE — plain-language framing, no jargon */}
      <section className="border-b border-line p-6 sm:p-7">
        <p className="text-[11px] font-semibold uppercase tracking-[.12em] text-mute">
          What changes
        </p>
        <p className="mt-2 text-[14px] leading-relaxed text-ink sm:text-[15px]">
          {decision.recommendation.rationale}
        </p>
      </section>

      {/* OTHER REDUCERS — outer border + dividers */}
      {restReducers.length > 0 && (
        <section className="border-b border-line p-6 sm:p-7">
          <p className="text-[11px] font-semibold uppercase tracking-[.12em] text-mute">
            This week · {restReducers.length} more thing{restReducers.length === 1 ? "" : "s"} to ship
          </p>
          <ul className="mt-3 divide-y divide-line overflow-hidden rounded-[10px] border border-line bg-paper">
            {restReducers.map((r, i) => (
              <li key={i} className="p-3.5">
                <p className="text-[14px] font-medium text-ink">{r.title}</p>
                <p className="mt-0.5 text-[12.5px] leading-relaxed text-mute">
                  {r.description}
                </p>
                {r.artifact.skillName && (
                  <p className="mt-1.5 text-[11.5px] text-mute">
                    Skill ref:{" "}
                    <code className="rounded bg-line/40 px-1.5 py-0.5 text-[11px] text-ink">
                      {r.artifact.skillName}
                    </code>
                  </p>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* SHOW THE MATH — disclosure, no hover pill */}
      <details className="group p-6 sm:p-7">
        <summary
          className="flex cursor-pointer items-center gap-2 text-[14px] font-medium text-mute transition-colors hover:text-ink [&::-webkit-details-marker]:hidden"
          aria-label="Show the math behind this recommendation"
        >
          <svg
            viewBox="0 0 24 24"
            className="h-4 w-4 transition-transform group-open:rotate-90"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            aria-hidden
          >
            <polyline points="9 18 15 12 9 6" />
          </svg>
          <span className="text-[15px] font-semibold text-ink">Show the math</span>
          <span className="text-[12.5px] text-mute">
            what we ruled out, why this won
          </span>
        </summary>
        <div className="mt-4 space-y-4 border-t border-line pt-4">
          <div className="rounded-[10px] border border-line bg-paper p-4 text-[13px] leading-relaxed text-ink">
            We compared {decision.alternatives.length + 1} paths against your
            stated priorities. The top option came in at{" "}
            <strong className="text-ink">{conf}/100</strong>. Below is the
            short list of what we ruled out and why, plus a robust alternative
            in case conditions change.
          </div>

          {/* If this stops working — robust */}
          {decision.robustAlternative && (
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[.12em] text-mute">
                🛡️ If this stops working
              </p>
              <p className="mt-1 text-[14px] font-medium text-ink">
                {decision.robustAlternative.option}
              </p>
              <p className="mt-0.5 text-[12.5px] text-mute">
                {decision.robustAlternative.why}
              </p>
            </div>
          )}

          {/* What we ruled out */}
          {decision.alternatives.length > 0 && (
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[.12em] text-mute">
                What we ruled out
              </p>
              <ul className="mt-1.5 space-y-1.5 text-[13.5px]">
                {decision.alternatives.map((a, i) => (
                  <li key={i} className="text-ink">
                    <span className="font-medium text-ink">{a.option}</span>
                    <span>: {a.reason}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </details>

      {/* FOOTER ACTIONS — saved-to + print */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line bg-paper px-6 py-4 sm:px-7">
        <div className="flex items-center gap-1.5 text-[12.5px] text-mute">
          <span
            aria-hidden
            className="inline-block h-2 w-2 rounded-full bg-ink"
          />
          Saved to{" "}
          <Link
            href={`/app/history/${decision.decisionId}`}
            className="font-medium text-ink underline-offset-2 hover:underline"
          >
            your decisions
          </Link>
        </div>
        <button
          type="button"
          onClick={() => window.print()}
          className="no-print inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-[12.5px] font-medium text-mute transition-colors hover:bg-line/40 hover:text-ink"
        >
          <svg
            viewBox="0 0 24 24"
            className="h-3.5 w-3.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            aria-hidden
          >
            <polyline points="6 9 6 2 18 2 18 9" />
            <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
            <rect x="6" y="14" width="12" height="8" />
          </svg>
          Print
        </button>
      </div>
    </article>
  );
}

// Width-stable copy button with brief success choreography.
function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const onClick = () => {
    if (!text || typeof navigator === "undefined") return;
    navigator.clipboard
      ?.writeText(text)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1800);
      })
      .catch(() => {
        /* user can long-press the <pre> and copy manually */
      });
  };
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={copied ? "Prompt copied to clipboard" : "Copy prompt"}
      className={
        "inline-flex h-10 items-center justify-center gap-1.5 rounded-[10px] border text-[13px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ink/20 " +
        (copied
          ? "border-ink bg-paper text-ink"
          : "border-ink bg-ink text-paper shadow-card hover:bg-ink/90")
      }
    >
      <span className="inline-flex w-[110px] items-center justify-center">
        {copied ? (
          <span className="dd-fade-up inline-flex items-center gap-1.5">
            <svg
              viewBox="0 0 24 24"
              className="h-3.5 w-3.5"
              fill="none"
              stroke="currentColor"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <polyline points="20 6 9 17 4 12" />
            </svg>
            Copied
          </span>
        ) : (
          <span>📋 Copy prompt</span>
        )}
      </span>
    </button>
  );
}

// ─── OfferHelpChip ──────────────────────────────────────────────────────
//
// Phase-1 chat-as-decision-front-door affordance. Renders an inline,
// dismissable chip below an assistant message when the user's latest
// message classified as decision-shaped. Calm Precision: ink-only, no
// per-pain colors, no shadow stacking.
function OfferHelpChip({
  affordance,
  disabled,
  onAccept,
  onDismiss,
}: {
  affordance: OfferHelpAffordance;
  disabled: boolean;
  onAccept: () => void;
  onDismiss: () => void;
}) {
  const ctaText =
    affordance.suggestedPath === "recommendation"
      ? "Want a quick recommendation? →"
      : "Want help deciding this? →";
  return (
    <div
      role="group"
      aria-label="Offer to help with this decision"
      className="dd-fade-up inline-flex items-center gap-1 rounded-full border border-line bg-paper px-1 py-0.5"
    >
      <button
        type="button"
        onClick={onAccept}
        disabled={disabled}
        className={
          "inline-flex items-center rounded-full px-3 py-1 text-[12.5px] font-semibold transition-colors " +
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/30 " +
          (disabled
            ? "text-mute cursor-not-allowed"
            : "text-ink hover:bg-line/30")
        }
      >
        {ctaText}
      </button>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss offer"
        title="Dismiss"
        className="inline-flex h-6 w-6 items-center justify-center rounded-full text-mute hover:bg-line/40 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/30"
      >
        <svg
          viewBox="0 0 24 24"
          className="h-3 w-3"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          aria-hidden
        >
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
    </div>
  );
}

// ─── SaveAsSkillAffordance ─────────────────────────────────────────────
//
// Phase-4 chat-as-decision-front-door. Renders below an assistant message
// whose decision/recommendation came from a submitted Survey. Two visual
// states:
//
//   1. Compact chip — "Save as skill →" + × dismiss. Click → expand.
//   2. Expanded panel — name input + optional custom instructions +
//      Save / Cancel.
//
// On save success, the parent flips saveSkillResolved=true and the
// affordance unmounts. On failure, the panel shows the error inline so
// the user can retry without losing their input.
function SaveAsSkillAffordance({
  defaultName,
  onSave,
  onDismiss,
}: {
  defaultName: string;
  onSave: (payload: {
    name?: string;
    customInstructions?: string;
  }) => Promise<{ ok: true } | { ok: false; error: string }>;
  onDismiss: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [name, setName] = useState(defaultName);
  const [customInstructions, setCustomInstructions] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!expanded) {
    return (
      <div
        role="group"
        aria-label="Save this decision flow as a skill"
        className="dd-fade-up inline-flex items-center gap-1 rounded-full border border-line bg-paper px-1 py-0.5"
      >
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="inline-flex items-center rounded-full px-3 py-1 text-[12.5px] font-semibold text-ink transition-colors hover:bg-line/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/30"
        >
          Save as skill →
        </button>
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss save offer"
          title="Dismiss"
          className="inline-flex h-6 w-6 items-center justify-center rounded-full text-mute hover:bg-line/40 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/30"
        >
          <svg
            viewBox="0 0 24 24"
            className="h-3 w-3"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            aria-hidden
          >
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>
    );
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    const result = await onSave({
      name: name.trim() || undefined,
      customInstructions: customInstructions.trim() || undefined,
    });
    setSaving(false);
    if (!result.ok) {
      setError(result.error);
    }
    // On success the parent flips saveSkillResolved and we unmount.
  }

  return (
    <div className="dd-fade-up rounded-2xl border border-line bg-paper p-4">
      <p className="text-[13px] font-semibold text-ink">
        Save this decision flow
      </p>
      <p className="mt-0.5 text-[12px] text-mute">
        Run the same survey + engine next time without re-typing.
      </p>

      <div className="mt-3 space-y-3">
        <div>
          <label
            htmlFor="save-skill-name"
            className="block text-[12.5px] font-medium text-ink"
          >
            Name
          </label>
          <input
            id="save-skill-name"
            type="text"
            value={name}
            disabled={saving}
            maxLength={200}
            onChange={(e) => setName(e.target.value)}
            className="mt-1 w-full rounded-md border border-line bg-paper px-3 py-2 text-[14px] text-text focus:outline-none focus-visible:ring-2 focus-visible:ring-ink/30 disabled:opacity-50"
          />
        </div>
        <div>
          <label
            htmlFor="save-skill-instructions"
            className="block text-[12.5px] font-medium text-ink"
          >
            Custom instructions{" "}
            <span className="font-normal text-mute">(optional)</span>
          </label>
          <textarea
            id="save-skill-instructions"
            value={customInstructions}
            disabled={saving}
            maxLength={2000}
            rows={3}
            placeholder="Anything specific you want this skill to remember next time? (e.g., focus on retention over income)"
            onChange={(e) => setCustomInstructions(e.target.value)}
            className="mt-1 w-full rounded-md border border-line bg-paper px-3 py-2 text-[13px] text-text focus:outline-none focus-visible:ring-2 focus-visible:ring-ink/30 disabled:opacity-50"
          />
        </div>
      </div>

      {error && (
        <p
          role="alert"
          className="mt-3 text-[12.5px]"
          style={{ color: "var(--error, currentColor)" }}
        >
          {error}
        </p>
      )}

      <div className="mt-4 flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={onDismiss}
          disabled={saving}
          className="inline-flex h-9 items-center rounded-[10px] px-3 text-[13px] font-medium text-mute hover:text-ink disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving || name.trim().length === 0}
          className="inline-flex h-9 items-center rounded-[10px] border border-ink bg-ink px-3 text-[13px] font-semibold text-paper shadow-card transition-colors hover:bg-ink/90 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ink/20 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save skill"}
        </button>
      </div>
    </div>
  );
}
