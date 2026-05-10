"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  categoryFor,
  confidenceBand,
  formatHrs,
  totalHoursSaved,
} from "@/lib/decision-display";

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

export function Chat() {
  const [thread, setThread] = useState<ChatThread>({ messages: [OPENING] });
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

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
    if (typeof window !== "undefined") window.localStorage.removeItem(STORAGE_KEY);
  };

  // SINGLE submit path — replaces the previous duplicate `send` + `sendQuick`
  // (audit item #9 in the goal). Accepts an optional override text so the
  // suggested-prompt chips can submit before React state has flushed.
  const runQuery = useCallback(
    async (overrideText?: string) => {
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
          body: JSON.stringify({ messages: next }),
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
          | { status: "asking"; reply: string }
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
  const canSend = input.trim().length > 0 && !busy;

  return (
    <main className="mx-auto flex min-h-[calc(100vh-5rem)] w-full max-w-3xl flex-col">
      {/* HERO VALUE PROP — only on empty state, mockup v2-01 */}
      {isEmptyState && (
        <article className="dd-fade-up relative mb-6 overflow-hidden rounded-3xl border border-rule bg-white p-6 shadow-soft sm:p-8">
          <div
            aria-hidden
            className="grad-coral absolute -right-12 -top-12 h-48 w-48 rounded-full opacity-20 blur-2xl"
          />
          <p className="grad-coral-text text-[11px] font-semibold uppercase tracking-[.14em] sm:text-[12px]">
            Tell me what's eating your time
          </p>
          <h1 className="mt-2 text-[26px] font-semibold leading-[1.1] tracking-tight sm:text-[32px]">
            I'll rank what AI can take off your plate, and build the skill to do it.
          </h1>
          <p className="mt-3 max-w-xl text-[15px] leading-snug text-ink-700 sm:text-[16px]">
            Five-minute conversation. You get a ranked list of capacity drains, an
            AI-feasibility score for each, and a paste-ready skill or playbook for
            the top one — so the time comes back this week, not "someday."
          </p>
          <p className="mt-3 text-[12.5px] text-ink-500">
            Already know the shape of it?{" "}
            <Link
              href="/app/decisions/new"
              className="font-semibold text-ink-700 underline-offset-2 hover:text-coral hover:underline"
            >
              Pick a template instead →
            </Link>
          </p>
        </article>
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
              "dd-fade-up flex items-end gap-2.5 " +
              (m.role === "user" ? "justify-end" : "justify-start")
            }
          >
            {m.role === "assistant" && (
              <span
                aria-hidden
                className="grad-coral hidden h-8 w-8 shrink-0 items-center justify-center rounded-full text-[12px] font-semibold text-white sm:flex"
              >
                DD
              </span>
            )}
            <div
              className={
                "max-w-[85%] rounded-3xl px-5 py-3 text-[15px] leading-relaxed shadow-sm sm:text-[16px] " +
                (m.role === "user"
                  ? "grad-coral rounded-br-md text-white"
                  : "rounded-bl-md bg-cream-2 text-ink-700")
              }
            >
              {m.content}
            </div>
          </li>
        ))}

        {/* Suggested-prompt chips — empty state only, three Miller-friendly */}
        {isEmptyState && !busy && (
          <li className="ml-0 flex flex-wrap gap-2 sm:ml-11">
            {QUICK_PROMPTS.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => runQuery(t)}
                className="dd-fade-up ease-soft min-h-11 rounded-full border border-rule bg-white px-4 text-[14px] text-ink-700 shadow-sm hover:-translate-y-0.5 hover:border-coral hover:text-coral hover:shadow-lift focus:outline-none focus-visible:ring-2 focus-visible:ring-coral focus-visible:ring-offset-2 active:translate-y-0 active:scale-[0.98]"
              >
                {t}
              </button>
            ))}
          </li>
        )}

        {/* Skeleton thinking state (NN/g: -40% perceived load vs spinner) */}
        {busy && (
          <li className="flex items-end gap-2.5">
            <span
              aria-hidden
              className="grad-coral hidden h-8 w-8 shrink-0 items-center justify-center rounded-full text-[12px] font-semibold text-white sm:flex"
            >
              DD
            </span>
            <div
              className="max-w-[85%] space-y-2 rounded-3xl rounded-bl-md bg-cream-2 px-5 py-4 shadow-sm"
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
        <p className="status-error mb-2 text-sm" role="alert">
          {err}
        </p>
      )}

      {/* COMPOSER — sticky, rounded-pill, distinct enabled/disabled */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          runQuery();
        }}
        className="ease-soft sticky bottom-0 mt-3 flex items-center gap-2 rounded-full border border-rule bg-white pl-5 pr-2 py-1.5 shadow-sm focus-within:border-coral focus-within:ring-coral-glow"
      >
        <label htmlFor="chat-input" className="sr-only">
          Type a message
        </label>
        <input
          id="chat-input"
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Tell me where the hours go…"
          disabled={busy}
          autoComplete="off"
          className="block min-h-11 w-full bg-transparent text-[15px] text-ink-900 placeholder:text-ink-500 focus:outline-none focus:ring-0 border-0 sm:text-[16px]"
        />
        <button
          type="button"
          onClick={reset}
          aria-label="Start a new chat"
          title="New chat"
          className="ease-soft hidden h-9 items-center gap-1.5 rounded-full px-3 text-[13px] text-ink-500 hover:bg-cream-2 hover:text-ink-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-coral sm:inline-flex"
        >
          <svg
            viewBox="0 0 24 24"
            className="h-4 w-4"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            aria-hidden
          >
            <polyline points="9 18 15 12 9 6" />
          </svg>
          <span>New</span>
        </button>
        <button
          type="submit"
          disabled={!canSend}
          aria-label="Send message"
          className={
            "ease-soft flex h-11 w-11 shrink-0 items-center justify-center rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-coral focus-visible:ring-offset-2 " +
            (canSend
              ? "grad-coral text-white shadow-coral-press hover:-translate-y-0.5 hover:shadow-coral-hover active:translate-y-0 active:scale-[0.96]"
              : "cursor-not-allowed bg-cream-2 text-ink-300")
          }
        >
          {busy ? (
            <svg
              className="h-4 w-4 animate-spin"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              aria-hidden
            >
              <circle cx="12" cy="12" r="10" strokeOpacity=".25" />
              <path d="M12 2a10 10 0 0 1 10 10" strokeLinecap="round" />
            </svg>
          ) : (
            <svg
              viewBox="0 0 24 24"
              className="h-5 w-5"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <line x1="22" y1="2" x2="11" y2="13" />
              <polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
          )}
        </button>
      </form>
      <p className="mt-2 text-center text-[12px] text-ink-500">
        Five-minute conversation · Cmd+Enter to send · 20 messages a day
      </p>
    </main>
  );
}

// ─── In-thread Decision card ────────────────────────────────────────────
//
// Audit fixes applied:
//   #1 single border (was border + ring + shadow triple-stack)
//   #2 reducers: outer border + dividers, no per-item border
//   #3 strip the inner <pre> border
//   #4 h2 → text-xl
//   #5 disclosure: text + chevron only, no hover pill
//   #8 confidence chip carries an icon prefix
//  #10 print button on the card

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
        <p className="mt-2 text-[40px] font-semibold leading-[.95] tracking-tight sm:text-[48px]">
          🕐 {formatHrs(hoursBack)}/wk back
        </p>
        <p className="mt-2 max-w-xl text-[15px] leading-snug opacity-95 sm:text-[16px]">
          {decision.recommendation.option}
        </p>
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
            // Audit #3 — strip inner border; bg-white rests on cat-skill-bg
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
              <button
                type="button"
                onClick={() => copyToClipboard(topReducer.artifact.promptText ?? "")}
                className="ease-soft grad-skill inline-flex h-10 items-center justify-center gap-1.5 rounded-xl text-[13px] font-semibold text-white hover:-translate-y-0.5"
              >
                📋 Copy prompt
              </button>
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

      {/* OTHER REDUCERS — outer border + dividers (audit #2) */}
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

      {/* SHOW THE MATH — disclosure, no hover pill (audit #5) */}
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
          {/* Plain-language explainer first (audit principle: jargon under disclosure) */}
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

      {/* FOOTER ACTIONS — saved-to + print (audit #10) */}
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

// Best-effort clipboard write — silently no-ops in non-secure contexts.
function copyToClipboard(text: string) {
  if (!text || typeof navigator === "undefined") return;
  navigator.clipboard?.writeText(text).catch(() => {
    /* user can long-press the <pre> and copy manually */
  });
}
