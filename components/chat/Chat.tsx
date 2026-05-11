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

// ─── Types (mirror /api/chat response shape) ────────────────────────────

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
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
    "Hi — tell me where the hours go in a normal week. I'll rank what AI can take off your plate and ship you a starter skill so the time comes back this week.",
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
    async (overrideText?: string, options?: { userOverrode?: boolean }) => {
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
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            messages: next,
            ...(options?.userOverrode ? { userOverrode: true } : {}),
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
            }
          | {
              status: "ready";
              reply: string;
              decision: DecisionPayload;
              painPoints?: string[];
              templateId?: string;
            };

        setThread((t) => ({
          ...t,
          messages: [...t.messages, { role: "assistant", content: data.reply }],
          decision: data.status === "ready" ? data.decision : undefined,
          painPoints: data.status === "ready" ? data.painPoints : undefined,
          templateId: data.status === "ready" ? data.templateId : undefined,
        }));
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
          <h1 className="mt-2 text-[26px] font-semibold leading-[1.1] tracking-tight text-text sm:text-[32px]">
            I'll rank what AI can take off your plate, and build the skill to do it.
          </h1>
          <p className="mt-3 max-w-xl text-[15px] leading-snug text-mute sm:text-[16px]">
            Five-minute conversation. You get a ranked list of capacity drains, an
            AI-feasibility score for each, and a paste-ready skill or playbook for
            the top one — so the time comes back this week, not "someday."
          </p>
          <p className="mt-3 text-[12.5px] text-mute">
            Already know the shape of it?{" "}
            <Link
              href="/app/decisions/new"
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
        className="flex-1 space-y-4 overflow-y-auto pb-4"
        aria-live="polite"
      >
        {thread.messages.map((m, i) => (
          <li
            key={i}
            className={
              "dd-fade-up flex " +
              (m.role === "user" ? "justify-end" : "justify-start")
            }
          >
            <div
              className={
                "max-w-[85%] rounded-2xl border border-line bg-paper px-4 py-2.5 text-[15px] leading-relaxed text-text " +
                (m.role === "user" ? "rounded-tr-sm" : "rounded-tl-sm")
              }
            >
              {m.content}
            </div>
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
              <Link href="/app/decisions/new" tabIndex={-1}>
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
              <span className="skeleton block h-3 w-48 rounded-full" />
              <span className="skeleton block h-3 w-64 rounded-full" />
              <span className="skeleton block h-3 w-32 rounded-full" />
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
        <PillSearchBar
          value={input}
          onChange={setInput}
          onSubmit={(v) => runQuery(v)}
          placeholder="Tell me where the hours go…"
          disabled={busy}
          ariaLabel="search"
        />
        <p className="mt-2 text-center text-[12px] text-mute">
          no PHI · responses use the math under "show the work"
        </p>
      </div>
    </main>
  );
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
    <article className="dd-fade-up overflow-hidden rounded-3xl border border-rule bg-white shadow-soft">
      {/* HERO — time-back is the headline, confidence is a chip */}
      <div className="grad-coral relative overflow-hidden p-6 text-white sm:p-7">
        <div
          aria-hidden
          className="absolute -right-12 -top-12 h-40 w-40 rounded-full bg-white opacity-15 blur-2xl"
        />
        <p className="text-[11px] font-semibold uppercase tracking-[.14em] opacity-80">
          What we built · primary outcome
        </p>
        {hoursBack > 0 ? (
          <p className="mt-2 text-[40px] font-semibold leading-[.95] tracking-tight sm:text-[48px]">
            🕐 {formatHrs(hoursBack)}/wk back
          </p>
        ) : (
          <p className="mt-2 text-[28px] font-semibold leading-tight tracking-tight sm:text-[34px]">
            {decision.recommendation.option}
          </p>
        )}
        {hoursBack > 0 && (
          <p className="mt-2 max-w-xl text-[15px] leading-snug opacity-95 sm:text-[16px]">
            {decision.recommendation.option}
          </p>
        )}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="inline-flex h-7 items-center gap-1.5 rounded-full bg-white/20 px-2.5 text-[12px] font-semibold backdrop-blur">
            {band.icon} {band.label} · {conf}%
          </span>
          {painPoints.length > 0 && (
            <span className="inline-flex h-7 items-center gap-1.5 rounded-full bg-white/20 px-2.5 text-[12px] backdrop-blur">
              Heard you on: {painPoints.join(" · ")}
            </span>
          )}
        </div>
      </div>

      {/* SKILL CARD — top reducer leads (skills-first hierarchy) */}
      {topReducer && (
        <section className="border-b border-rule bg-cat-skill-bg/50 p-6 sm:p-7">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <span className="grad-skill inline-flex h-7 items-center rounded-full px-2.5 text-[11px] font-semibold uppercase tracking-[.12em] text-white">
              🛠️ Skill ready
            </span>
            <span className="text-[11px] font-semibold text-cat-skill-deep">
              ~1 min to ship
            </span>
          </div>
          <h2 className="mt-3 text-xl font-semibold leading-snug text-ink-900">
            {topReducer.title}
          </h2>
          <p className="mt-1.5 text-[14px] leading-relaxed text-ink-700">
            {topReducer.description}
          </p>

          {topReducer.artifact.promptText && (
            <pre className="mt-3 max-h-48 overflow-auto whitespace-pre-wrap rounded-xl bg-white p-3 text-[12px] leading-relaxed text-ink-900 shadow-sm">
              {topReducer.artifact.promptText}
            </pre>
          )}
          {topReducer.artifact.playbookSteps && (
            <ol className="mt-3 list-decimal space-y-1 rounded-xl bg-white p-3 pl-7 text-[13px] leading-relaxed text-ink-700 shadow-sm">
              {topReducer.artifact.playbookSteps.map((s, j) => (
                <li key={j}>{s}</li>
              ))}
            </ol>
          )}

          {topReducer.artifact.promptText && (
            <div className="mt-3 grid grid-cols-2 gap-2">
              <CopyButton text={topReducer.artifact.promptText} />
              <Link
                href={`/app/decisions/${decision.decisionId}`}
                className="ease-soft inline-flex h-10 items-center justify-center gap-1.5 rounded-xl border border-rule bg-white text-[13px] font-semibold text-ink-900 hover:border-cat-skill"
              >
                See full plan →
              </Link>
            </div>
          )}
        </section>
      )}

      {/* RATIONALE — plain-language framing, no jargon */}
      <section className="border-b border-rule p-6 sm:p-7">
        <p className="text-[11px] font-semibold uppercase tracking-[.12em] text-ink-500">
          What changes
        </p>
        <p className="mt-2 text-[14px] leading-relaxed text-ink-700 sm:text-[15px]">
          {decision.recommendation.rationale}
        </p>
      </section>

      {/* OTHER REDUCERS — outer border + dividers */}
      {restReducers.length > 0 && (
        <section className="border-b border-rule p-6 sm:p-7">
          <p className="text-[11px] font-semibold uppercase tracking-[.12em] text-ink-500">
            This week — {restReducers.length} more thing{restReducers.length === 1 ? "" : "s"} to ship
          </p>
          <ul className="mt-3 divide-y divide-rule overflow-hidden rounded-xl border border-rule bg-cream-2/40">
            {restReducers.map((r, i) => (
              <li key={i} className="p-3.5">
                <p className="text-[14px] font-medium text-ink-900">{r.title}</p>
                <p className="mt-0.5 text-[12.5px] leading-relaxed text-ink-500">
                  {r.description}
                </p>
                {r.artifact.skillName && (
                  <p className="mt-1.5 text-[11.5px] text-ink-500">
                    Skill ref:{" "}
                    <code className="rounded bg-white px-1.5 py-0.5 text-[11px] text-ink-700">
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
          className="ease-soft flex cursor-pointer items-center gap-2 text-[14px] font-medium text-ink-700 hover:text-ink-900 [&::-webkit-details-marker]:hidden"
          aria-label="Show the math behind this recommendation"
        >
          <svg
            viewBox="0 0 24 24"
            className="ease-soft h-4 w-4 group-open:rotate-90"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            aria-hidden
          >
            <polyline points="9 18 15 12 9 6" />
          </svg>
          <span className="text-[15px] font-semibold">Show the math</span>
          <span className="text-[12.5px] text-ink-500">
            — what we ruled out, why this won
          </span>
        </summary>
        <div className="mt-4 space-y-4 border-t border-rule pt-4">
          <div className="rounded-xl bg-cream-2 p-4 text-[13px] leading-relaxed text-ink-700">
            We compared {decision.alternatives.length + 1} paths against your
            stated priorities. The top option came in at{" "}
            <strong className="text-ink-900">{conf}/100</strong>. Below is the
            short list of what we ruled out and why, plus a robust alternative
            in case conditions change.
          </div>

          {/* If this stops working — robust */}
          {decision.robustAlternative && (
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[.12em] text-cat-admin">
                🛡️ If this stops working
              </p>
              <p className="mt-1 text-[14px] font-medium text-ink-900">
                {decision.robustAlternative.option}
              </p>
              <p className="mt-0.5 text-[12.5px] text-ink-500">
                {decision.robustAlternative.why}
              </p>
            </div>
          )}

          {/* What we ruled out */}
          {decision.alternatives.length > 0 && (
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[.12em] text-ink-500">
                What we ruled out
              </p>
              <ul className="mt-1.5 space-y-1.5 text-[13.5px]">
                {decision.alternatives.map((a, i) => (
                  <li key={i} className="text-ink-700">
                    <span className="font-medium text-ink-900">{a.option}</span>
                    <span> — {a.reason}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </details>

      {/* FOOTER ACTIONS — saved-to + print */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-rule bg-cream-2/40 px-6 py-4 sm:px-7">
        <div className="flex items-center gap-1.5 text-[12.5px] text-ink-500">
          <span
            aria-hidden
            className={`inline-block h-2 w-2 rounded-full ${cat.stripe}`}
          />
          Saved to{" "}
          <Link
            href={`/app/decisions/${decision.decisionId}`}
            className="font-medium text-ink-900 underline-offset-2 hover:underline"
          >
            your decisions
          </Link>
        </div>
        <button
          type="button"
          onClick={() => window.print()}
          className="ease-soft no-print inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-[12.5px] font-medium text-ink-700 hover:bg-white"
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
        "ease-soft inline-flex h-10 items-center justify-center gap-1.5 rounded-xl text-[13px] font-semibold text-white hover:-translate-y-0.5 " +
        (copied ? "bg-conf-strong" : "grad-skill")
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
