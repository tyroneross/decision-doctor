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

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-2xl flex-col px-4 py-6">
      <header className="flex items-baseline justify-between">
        <div>
          <h1 className="text-xl font-semibold text-ink-900">
            Decision Doctor — chat
          </h1>
          <p className="text-sm text-ink-500">
            Think it through out loud. I'll do the math when we're ready.
          </p>
        </div>
        <button
          type="button"
          onClick={reset}
          className="text-xs text-ink-500 underline-offset-2 hover:text-ink-900 hover:underline"
        >
          New chat
        </button>
      </header>

      <ul
        className="mt-6 flex-1 space-y-3 overflow-y-auto pb-4"
        aria-live="polite"
      >
        {thread.messages.map((m, i) => (
          <li
            key={i}
            className={
              "flex " + (m.role === "user" ? "justify-end" : "justify-start")
            }
          >
            <div
              className={
                "max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed " +
                (m.role === "user"
                  ? "bg-ink-900 text-white"
                  : "bg-ink-100 text-ink-900")
              }
            >
              {m.content}
            </div>
          </li>
        ))}

        {busy && (
          <li className="flex justify-start">
            <div className="rounded-2xl bg-ink-100 px-4 py-2.5 text-sm text-ink-500">
              Thinking…
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
          placeholder="Type your message…"
          disabled={busy}
          autoComplete="off"
          className="block min-h-11 w-full rounded border-ink-300 px-3 focus:border-accent-600 focus:ring-accent-600"
        />
        <button
          type="submit"
          disabled={!input.trim() || busy}
          className={
            "min-h-11 rounded-md px-4 text-sm font-medium transition " +
            (input.trim() && !busy
              ? "bg-ink-900 text-white hover:bg-ink-700"
              : "bg-ink-100 text-ink-700 cursor-not-allowed")
          }
        >
          Send
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
    <article className="rounded-2xl border border-ink-300 bg-white p-4 shadow-sm">
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

      <details className="mt-4 text-sm">
        <summary className="cursor-pointer text-ink-500 hover:text-ink-900">
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
