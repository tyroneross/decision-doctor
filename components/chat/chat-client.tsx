"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

interface ChipChoice {
  value: string;
  label: string;
}

interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
  chips?: ChipChoice[];
  timestamp?: string | Date;
}

interface ChatResponse {
  decisionId: string;
  status: "chatting" | "needs_confirm_mode" | "ready" | "rate_limited";
  assistant: ChatMessage;
  transcript?: { messages: ChatMessage[] };
  shareToken?: string;
  mode?: string;
  note?: string;
}

// v2: chips seed the AI-leverage finder. Each chip's value is a one-liner
// the router pattern-matches into the AI-leverage template, so the chat goes
// straight into the week-audit.
const TEMPLATE_CHIPS: ChipChoice[] = [
  { value: "I want to find AI tools to free up my time — let's audit my week.", label: "Audit my week" },
  { value: "I spend too much time on clinical notes — what AI helps?", label: "Clinical notes" },
  { value: "Patient messaging and scheduling eats my evenings — what can automate it?", label: "Patient comms" },
];

export function ChatClient() {
  const router = useRouter();
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: "assistant",
      content:
        "Where does your time go each week? I'll find AI tools you can deploy to free up the biggest hours — no patient names, just the situation.",
    },
  ]);
  const [decisionId, setDecisionId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [pendingChips, setPendingChips] = useState<ChipChoice[] | null>(null);
  const [status, setStatus] = useState<"idle" | "sending" | "running" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll the message list as new turns arrive.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  async function send(messageText: string) {
    const trimmed = messageText.trim();
    if (trimmed.length === 0 || status === "sending" || status === "running") return;
    setError(null);
    const userTurn: ChatMessage = { role: "user", content: trimmed, timestamp: new Date() };
    setMessages((prev) => [...prev, userTurn]);
    setInput("");
    setPendingChips(null);
    setStatus("sending");
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decisionId, message: trimmed }),
      });
      if (res.status === 429) {
        const body = await res.json().catch(() => ({}));
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: body.assistant?.content ?? "Daily limit reached. Try again tomorrow.",
          },
        ]);
        setStatus("idle");
        return;
      }
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Request failed (${res.status})`);
      }
      const body = (await res.json()) as ChatResponse;
      if (!decisionId) setDecisionId(body.decisionId);
      setMessages((prev) => [...prev, body.assistant]);
      if (body.assistant.chips) setPendingChips(body.assistant.chips);

      if (body.status === "ready") {
        // Engine ran (or placeholder for non-mode-1). Redirect to the rec page.
        setStatus("running");
        // Brief pause so the user sees the "building your recommendation" message.
        setTimeout(() => router.push(`/app/decisions/${body.decisionId}`), 800);
        return;
      }
      setStatus("idle");
    } catch (err) {
      setError((err as Error).message);
      setStatus("error");
    }
  }

  function clickChip(chip: ChipChoice) {
    void send(chip.value);
  }

  function startWithTemplate(chip: ChipChoice) {
    void send(chip.label === "Capacity" || chip.label === "Pricing" || chip.label === "Hire" ? chip.value : chip.value);
  }

  function onKey(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void send(input);
    }
  }

  const isFirstUserTurn = !messages.some((m) => m.role === "user");

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Message stream */}
      <div
        ref={scrollRef}
        className="flex-1 min-h-0 overflow-y-auto py-4 space-y-3"
        aria-live="polite"
      >
        {messages.map((m, i) => (
          <MessageBubble key={i} message={m} />
        ))}
        {status === "sending" && (
          <div className="flex justify-start">
            <div className="px-4 py-3 rounded-2xl bg-canvas-raised border border-slate-200 max-w-[85%] text-sm text-ink-muted">
              Thinking…
            </div>
          </div>
        )}
        {status === "running" && (
          <div className="flex justify-start">
            <div className="px-4 py-3 rounded-2xl bg-canvas-raised border border-slate-200 max-w-[85%] text-sm text-ink-muted">
              Building your recommendation — usually 8–12 seconds.
            </div>
          </div>
        )}
        {status === "error" && error && (
          <div className="flex justify-start">
            <div className="px-4 py-3 rounded-2xl bg-confidence-low/10 border border-confidence-low/40 max-w-[85%] text-sm text-confidence-low">
              {error}
            </div>
          </div>
        )}
      </div>

      {/* Quick-start template chips — visible only before the first user turn */}
      {isFirstUserTurn && (
        <div className="border-t border-slate-200 pt-3 pb-2">
          <div className="text-xs text-ink-muted mb-2">
            Or jump straight to one of these common decisions:
          </div>
          <div className="flex flex-wrap gap-2">
            {TEMPLATE_CHIPS.map((c) => (
              <button
                key={c.label}
                type="button"
                onClick={() => startWithTemplate(c)}
                className="px-3 py-2 rounded-full border border-slate-300 text-sm text-ink hover:border-ink min-h-[40px]"
                disabled={status !== "idle"}
              >
                {c.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Pending assistant chips (e.g. clarifier mode picker) */}
      {pendingChips && pendingChips.length > 0 && (
        <div className="border-t border-slate-200 pt-3 pb-2">
          <div className="flex flex-wrap gap-2">
            {pendingChips.map((c) => (
              <button
                key={c.value}
                type="button"
                onClick={() => clickChip(c)}
                className="px-3 py-2 rounded-full border border-slate-300 text-sm text-ink hover:border-ink min-h-[40px]"
                disabled={status !== "idle"}
              >
                {c.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Sticky input */}
      <div className="sticky bottom-0 bg-canvas pt-2 pb-3 border-t border-slate-200 -mx-4 sm:-mx-6 px-4 sm:px-6">
        <div className="flex gap-2 items-end">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKey}
            placeholder={
              isFirstUserTurn
                ? "Describe your decision in your own words…"
                : "Type your answer or click a chip above…"
            }
            rows={2}
            maxLength={2000}
            disabled={status === "sending" || status === "running"}
            className="flex-1 rounded-xl border border-slate-300 px-3 py-2 text-base focus:border-ink focus:ring-ink min-h-[44px] resize-none"
            aria-label="Your message"
          />
          <button
            type="button"
            onClick={() => void send(input)}
            disabled={input.trim().length === 0 || status === "sending" || status === "running"}
            className="px-4 py-3 rounded-xl bg-ink text-white font-medium min-h-[48px] disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Send
          </button>
        </div>
        <div className="mt-1 text-xs text-ink-muted">
          No patient names, dates of birth, or identifying details — your messages
          stay on your account.
        </div>
      </div>
    </div>
  );
}

function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === "user";
  if (message.role === "system") return null;
  return (
    <div className={isUser ? "flex justify-end" : "flex justify-start"}>
      <div
        className={
          isUser
            ? "px-4 py-3 rounded-2xl bg-ink text-white max-w-[85%] text-sm whitespace-pre-wrap"
            : "px-4 py-3 rounded-2xl bg-canvas-raised border border-slate-200 max-w-[85%] text-sm whitespace-pre-wrap text-ink"
        }
      >
        {message.content}
      </div>
    </div>
  );
}
