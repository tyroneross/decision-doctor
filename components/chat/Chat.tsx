"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

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
  }>;
}

interface ChatThread {
  messages: ChatMessage[];
  decision?: DecisionPayload;
  painPoints?: string[];
}

const STORAGE_KEY = "dd:chat:thread:v1";

const OPENING: ChatMessage = {
  role: "assistant",
  content:
    "Hi — I help solo healthcare practitioners think through capacity, pricing, and admin-hire decisions. What's on your mind right now? Describe the situation in your own words.",
};

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
      /* ignore — quota exceeded etc. */
    }
  }, [thread]);

  // Autoscroll on new message.
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [thread.messages.length, thread.decision]);

  const reset = () => {
    setThread({ messages: [OPENING] });
    setErr(null);
    if (typeof window !== "undefined")
      window.localStorage.removeItem(STORAGE_KEY);
  };

  const send = async () => {
    const text = input.trim();
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
          };

      setThread((t) => ({
        ...t,
        messages: [
          ...t.messages,
          { role: "assistant", content: data.reply },
        ],
        decision: data.status === "ready" ? data.decision : undefined,
        painPoints: data.status === "ready" ? data.painPoints : undefined,
      }));
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  // Show suggested-topic chips ONLY in the empty state (just the opening
  // greeting + no user reply yet). Calm Precision: invite, don't overwhelm.
  const isEmptyState = thread.messages.length === 1 && thread.messages[0]?.role === "assistant";

  const sendQuick = (text: string) => {
    setInput(text);
    // Defer until next tick so the input is set before submit.
    queueMicrotask(() => {
      // Programmatically trigger the same path as a manual send.
      const fakeEvent = new SubmitEvent("submit");
      Object.defineProperty(fakeEvent, "preventDefault", { value: () => {} });
      // Inline send with the override text — input state may not have flushed yet.
      void (async () => {
        const t = text.trim();
        if (!t || busy) return;
        setErr(null);
        setBusy(true);
        setInput("");
        const next: ChatMessage[] = [
          ...thread.messages,
          { role: "user", content: t },
        ];
        setThread((th) => ({ ...th, messages: next, decision: undefined }));
        try {
          const res = await fetch("/api/chat", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ messages: next }),
          });
          if (!res.ok) throw new Error(`Request failed (${res.status})`);
          const data = (await res.json()) as
            | { status: "asking"; reply: string }
            | {
                status: "ready";
                reply: string;
                decision: DecisionPayload;
                painPoints?: string[];
              };
          setThread((th) => ({
            ...th,
            messages: [
              ...th.messages,
              { role: "assistant", content: data.reply },
            ],
            decision: data.status === "ready" ? data.decision : undefined,
            painPoints: data.status === "ready" ? data.painPoints : undefined,
          }));
        } catch (e) {
          setErr(e instanceof Error ? e.message : String(e));
        } finally {
          setBusy(false);
        }
      })();
    });
  };

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-2xl flex-col px-4 py-6 sm:py-8">
      <header className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <span
            aria-hidden
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-700"
          >
            {/* Stylized DD mark — keeps the brand calm but the page isn't bare */}
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
          </span>
          <div>
            <h1 className="text-lg font-semibold text-ink-900 sm:text-xl">
              Decision Doctor
            </h1>
            <p className="text-sm text-ink-500">
              Think it through out loud. I'll run the math when we're ready.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={reset}
          className="min-h-11 rounded-md px-3 text-xs text-ink-500 transition-colors duration-150 hover:bg-ink-50 hover:text-ink-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-2"
        >
          New chat
        </button>
      </header>

      <ul
        className="mt-6 flex-1 space-y-4 overflow-y-auto pb-4"
        aria-live="polite"
      >
        {thread.messages.map((m, i) => (
          <li
            key={i}
            className={
              "dd-fade-up flex items-end gap-2 " +
              (m.role === "user" ? "justify-end" : "justify-start")
            }
          >
            {m.role === "assistant" && (
              <span
                aria-hidden
                className="hidden h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-50 text-[11px] font-medium text-brand-700 ring-1 ring-brand-100 sm:flex"
              >
                DD
              </span>
            )}
            <div
              className={
                "max-w-[85%] rounded-2xl px-4 py-3 text-[15px] leading-relaxed shadow-sm " +
                (m.role === "user"
                  ? "rounded-br-md bg-brand-700 text-white"
                  : "rounded-bl-md bg-brand-50 text-ink-900 ring-1 ring-brand-100/60")
              }
            >
              {m.content}
            </div>
          </li>
        ))}

        {isEmptyState && !busy && (
          <li className="ml-9 mt-2 flex flex-wrap gap-2">
            {[
              "I'm thinking about hiring admin help",
              "Considering raising my rates",
              "Wondering if I should add capacity",
            ].map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => sendQuick(t)}
                className="dd-fade-up group min-h-11 rounded-full border border-ink-300 bg-white px-4 text-sm text-ink-700 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-brand-600 hover:text-brand-700 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-2 active:translate-y-0 active:scale-[0.98]"
              >
                {t}
              </button>
            ))}
          </li>
        )}

        {busy && (
          <li className="flex items-end gap-2">
            <span
              aria-hidden
              className="hidden h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-50 text-[11px] font-medium text-brand-700 ring-1 ring-brand-100 sm:flex"
            >
              DD
            </span>
            <div className="rounded-2xl rounded-bl-md bg-brand-50 px-4 py-3 shadow-sm">
              <span className="flex gap-1" aria-label="Thinking">
                <span className="h-2 w-2 animate-pulse rounded-full bg-brand-600 [animation-delay:-0.3s]" />
                <span className="h-2 w-2 animate-pulse rounded-full bg-brand-600 [animation-delay:-0.15s]" />
                <span className="h-2 w-2 animate-pulse rounded-full bg-brand-600" />
              </span>
            </div>
          </li>
        )}

        {thread.decision && (
          <li className="mt-3">
            <DecisionCard
              decision={thread.decision}
              painPoints={thread.painPoints ?? []}
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

      <form
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
        className="sticky bottom-0 mt-4 flex gap-2 border-t border-ink-100 bg-white pt-3"
      >
        <label htmlFor="chat-input" className="sr-only">
          Type a message
        </label>
        <input
          id="chat-input"
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Tell me what's on your mind…"
          disabled={busy}
          autoComplete="off"
          className="block min-h-11 w-full rounded-full border-ink-300 px-4 transition-shadow duration-200 hover:border-ink-500 focus:border-brand-600 focus:ring-2 focus:ring-brand-600/30 focus:ring-offset-0"
        />
        <button
          type="submit"
          disabled={!input.trim() || busy}
          aria-label="Send message"
          className={
            "flex h-11 w-11 shrink-0 items-center justify-center rounded-full shadow-sm transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-2 " +
            (input.trim() && !busy
              ? "bg-brand-600 text-white hover:bg-brand-700 hover:shadow-md hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.96]"
              : "bg-ink-100 text-ink-500 cursor-not-allowed")
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
              className="h-4 w-4"
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
    </main>
  );
}

function DecisionCard({
  decision,
  painPoints,
}: {
  decision: DecisionPayload;
  painPoints: string[];
}) {
  const conf = decision.recommendation.confidence;
  const band =
    conf >= 75
      ? { label: "Strong call", tone: "text-emerald-700" }
      : conf >= 50
        ? { label: "Lean toward", tone: "text-amber-700" }
        : { label: "Coin flip — see robust alt", tone: "text-rose-700" };

  return (
    <article className="dd-fade-up rounded-2xl border border-brand-100 bg-white p-5 shadow-md ring-1 ring-brand-50">
      <p className={"text-xs font-medium uppercase tracking-wide " + band.tone}>
        {band.label}
      </p>
      <h2 className="mt-1 text-lg font-semibold text-ink-900">
        {decision.recommendation.option}
      </h2>
      <p className="mt-2 text-sm leading-relaxed text-ink-700">
        {decision.recommendation.rationale}
      </p>

      {painPoints.length > 0 && (
        <p className="mt-3 text-xs text-ink-500">
          Heard you on:{" "}
          <span className="text-ink-700">{painPoints.join(" · ")}</span>
        </p>
      )}

      <details className="group mt-4 text-sm">
        <summary className="inline-flex min-h-11 cursor-pointer items-center rounded-md px-2 -mx-2 text-ink-500 transition-colors hover:bg-brand-50 hover:text-brand-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-2 [&::-webkit-details-marker]:hidden">
          Show the work · alternatives, robust alternative
        </summary>
        <div className="mt-3 space-y-3 pl-1">
          <div>
            <p className="text-xs uppercase tracking-wide text-ink-500">
              Robust alternative
            </p>
            <p className="text-sm text-ink-900">
              {decision.robustAlternative.option}
            </p>
            <p className="text-xs text-ink-500">
              {decision.robustAlternative.why}
            </p>
          </div>
          {decision.alternatives.length > 0 && (
            <div>
              <p className="text-xs uppercase tracking-wide text-ink-500">
                Alternatives considered
              </p>
              <ul className="mt-1 space-y-2">
                {decision.alternatives.map((a, i) => (
                  <li key={i} className="text-sm">
                    <span className="text-ink-900">{a.option}</span>{" "}
                    <span className="text-ink-500">— {a.reason}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </details>

      {decision.workloadReducers.length > 0 && (
        <section className="mt-5">
          <h3 className="text-xs uppercase tracking-wide text-ink-500">
            What to do this week — paste-ready
          </h3>
          <ul className="mt-2 space-y-3">
            {decision.workloadReducers.map((r, i) => (
              <li
                key={i}
                className="rounded border border-ink-300 bg-ink-100/40 p-3"
              >
                <p className="text-sm font-medium text-ink-900">{r.title}</p>
                <p className="mt-0.5 text-xs text-ink-500">{r.description}</p>
                {r.artifact.promptText && (
                  <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap rounded border border-ink-300 bg-white p-2 text-xs leading-relaxed text-ink-900">
                    {r.artifact.promptText}
                  </pre>
                )}
                {r.artifact.playbookSteps && (
                  <ol className="mt-2 list-decimal space-y-0.5 pl-5 text-xs text-ink-700">
                    {r.artifact.playbookSteps.map((s, j) => (
                      <li key={j}>{s}</li>
                    ))}
                  </ol>
                )}
                {r.artifact.skillName && (
                  <p className="mt-2 text-xs text-ink-500">
                    Skill ref:{" "}
                    <code className="rounded bg-ink-100 px-1">
                      {r.artifact.skillName}
                    </code>
                  </p>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="mt-4 text-xs text-ink-500">
        Saved to{" "}
        <Link
          href={`/app/decisions/${decision.decisionId}`}
          className="underline hover:text-ink-900"
        >
          your decisions
        </Link>
        .
      </p>
    </article>
  );
}
