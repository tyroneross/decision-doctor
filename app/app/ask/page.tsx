"use client";

// app/app/ask/page.tsx — Q1: AI-adoption conversational Q&A surface.
//
// SSR shell is the default Next.js 16 layout; the client component handles
// SSE streaming. Conversation history is persisted to sessionStorage
// (per-tab — no cross-session persistence, no PHI risk).
//
// Layout:
//   Header — "Ask Decision Doctor" + tagline
//   Conversation history (scrollable, above composer)
//   AskComposer (PillSearchBar multiline maxRows=8)
//   AnswerStream + CitationList for active answer
//   EmptyGrounding when wasGrounded=false
//   PHI-blocked warning when phiBlocked=true

import * as React from "react";
import { AskComposer } from "@/components/qa/AskComposer";
import { AnswerStream } from "@/components/qa/AnswerStream";
import { CitationList, type QACitation } from "@/components/qa/CitationList";
import { EmptyGrounding } from "@/components/qa/EmptyGrounding";
import type { Citation } from "@/components/chat/CitationChip";

interface QAEntry {
  id: string;
  question: string;
  answer: string;
  citations: QACitation[];
  wasGrounded: boolean;
  wasPersonalized: boolean;
  phiBlocked?: boolean;
  phiReasons?: string[];
}

interface StreamState {
  question: string;
  tokens: string;
  citations: Citation[];
  citationsMeta: QACitation[];
  isStreaming: boolean;
  wasGrounded: boolean;
  wasPersonalized: boolean;
  phiBlocked?: boolean;
  phiReasons?: string[];
  emptyGrounding?: boolean;
  error?: string;
}

const STORAGE_KEY = "dd:qa:history";

function loadHistory(): QAEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as QAEntry[]) : [];
  } catch {
    return [];
  }
}

function saveHistory(entries: QAEntry[]) {
  try {
    // Keep last 20 entries to avoid storage bloat.
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(entries.slice(-20)));
  } catch {
    // Non-fatal.
  }
}

export default function AskPage() {
  const [history, setHistory] = React.useState<QAEntry[]>([]);
  const [stream, setStream] = React.useState<StreamState | null>(null);
  const bottomRef = React.useRef<HTMLDivElement>(null);
  const abortRef = React.useRef<AbortController | null>(null);
  const autoSubmittedRef = React.useRef<string | null>(null);

  const handleSubmit = React.useCallback(async (question: string) => {
    // Abort any in-flight stream.
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setStream({
      question,
      tokens: "",
      citations: [],
      citationsMeta: [],
      isStreaming: true,
      wasGrounded: false,
      wasPersonalized: false,
    });

    try {
      const resp = await fetch("/api/ai-adoption-qa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question }),
        signal: controller.signal,
      });

      // PHI-blocked or other non-SSE JSON error.
      if (!resp.ok || resp.headers.get("content-type")?.includes("application/json")) {
        const data = (await resp.json()) as {
          phiBlocked?: boolean;
          reasons?: string[];
          error?: string;
          message?: string;
        };

        if (data.phiBlocked) {
          setStream((prev) =>
            prev
              ? {
                  ...prev,
                  isStreaming: false,
                  phiBlocked: true,
                  phiReasons: data.reasons ?? [],
                }
              : prev,
          );
        } else {
          setStream((prev) =>
            prev
              ? {
                  ...prev,
                  isStreaming: false,
                  error: data.message ?? data.error ?? "Something went wrong.",
                }
              : prev,
          );
        }
        return;
      }

      // SSE stream.
      const reader = resp.body?.getReader();
      if (!reader) throw new Error("No response body");

      const decoder = new TextDecoder();
      let buf = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });

        const lines = buf.split("\n");
        buf = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const json = line.slice(6).trim();
          if (!json) continue;

          try {
            const event = JSON.parse(json) as {
              type: string;
              text?: string;
              uuid?: string;
              wasGrounded?: boolean;
              wasPersonalized?: boolean;
              emptyGrounding?: boolean;
              citations?: QACitation[];
            };

            if (event.type === "token" && event.text) {
              setStream((prev) =>
                prev ? { ...prev, tokens: prev.tokens + event.text! } : prev,
              );
            } else if (event.type === "citation" && event.uuid) {
              // Note: CitationList gets its data from the done event's citations array.
              // The inline CitationChip is driven by the token stream + Citations passed to AnswerStream.
              setStream((prev) => {
                if (!prev) return prev;
                // Only add to inline citation list if we have a match.
                const alreadyHave = prev.citations.some(
                  (c) => c.doc_id === event.uuid,
                );
                if (alreadyHave) return prev;
                return {
                  ...prev,
                  citations: [
                    ...prev.citations,
                    { doc_id: event.uuid!, source_url: "", title: "" },
                  ],
                };
              });
            } else if (event.type === "done") {
              setStream((prev) => {
                if (!prev) return prev;
                const updated: StreamState = {
                  ...prev,
                  isStreaming: false,
                  wasGrounded: event.wasGrounded ?? false,
                  wasPersonalized: event.wasPersonalized ?? false,
                  emptyGrounding: event.emptyGrounding ?? !event.wasGrounded,
                  citationsMeta: event.citations ?? [],
                };
                // Persist to history.
                const entry: QAEntry = {
                  id: crypto.randomUUID(),
                  question: prev.question,
                  answer: prev.tokens,
                  citations: event.citations ?? [],
                  wasGrounded: event.wasGrounded ?? false,
                  wasPersonalized: event.wasPersonalized ?? false,
                };
                setHistory((prevHistory) => {
                  const newHistory = [...prevHistory, entry];
                  saveHistory(newHistory);
                  return newHistory;
                });
                return updated;
              });
            } else if (event.type === "error") {
              setStream((prev) =>
                prev
                  ? {
                      ...prev,
                      isStreaming: false,
                      error: "The answer stream encountered an error.",
                    }
                  : prev,
              );
            }
          } catch {
            // Malformed SSE line — skip.
          }
        }
      }
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      setStream((prev) =>
        prev
          ? {
              ...prev,
              isStreaming: false,
              error: "Connection lost. Please try again.",
            }
          : prev,
      );
    }
  }, []);

  // Load history from sessionStorage on mount.
  React.useEffect(() => {
    setHistory(loadHistory());
  }, []);

  // Let /app/ask?q=... behave like an actual searchable entry point from home.
  React.useEffect(() => {
    if (typeof window === "undefined") return;
    const question = new URLSearchParams(window.location.search).get("q")?.trim();
    if (!question || autoSubmittedRef.current === question) return;
    autoSubmittedRef.current = question;
    void handleSubmit(question);
  }, [handleSubmit]);

  // Scroll to bottom as answers stream in.
  React.useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [stream?.tokens, history.length]);

  const isSubmitting = stream?.isStreaming === true;

  return (
    <div className="flex flex-col min-h-screen" style={{ background: "var(--paper)" }}>
      {/* Header */}
      <div
        className="sticky top-0 z-10 px-4 py-3 border-b"
        style={{
          background: "var(--paper)",
          borderColor: "var(--line)",
        }}
      >
        <div className="max-w-2xl mx-auto">
          <h1
            className="text-[16px] font-semibold leading-[22px]"
            style={{ color: "var(--ink)" }}
          >
            Ask Aida
          </h1>
          <p className="text-[13px] leading-[18px]" style={{ color: "var(--mute)" }}>
            AI tooling and adoption questions, grounded in your library and the corpus.
          </p>
        </div>
      </div>

      {/* Conversation history + active stream */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto px-4 py-6 flex flex-col gap-8">
          {/* Previous Q&As */}
          {history.map((entry) => (
            <HistoryEntry key={entry.id} entry={entry} />
          ))}

          {/* Active stream */}
          {stream && (
            <div className="flex flex-col gap-3">
              {/* Question */}
              <div
                className="self-end max-w-[80%] rounded-[12px] px-4 py-3"
                style={{ background: "var(--ink)", color: "var(--paper)" }}
              >
                <p className="text-[14px] leading-[20px] break-words whitespace-pre-wrap">
                  {stream.question}
                </p>
              </div>

              {/* PHI blocked */}
              {stream.phiBlocked && (
                <div
                  className="rounded-[12px] p-4 flex flex-col gap-2"
                  style={{
                    background: "var(--bg)",
                    border: "1px solid var(--line)",
                  }}
                >
                  <p
                    className="text-[14px] font-medium leading-[20px]"
                    style={{ color: "var(--ink)" }}
                  >
                    Your question appears to contain protected health information.
                  </p>
                  {stream.phiReasons && stream.phiReasons.length > 0 && (
                    <ul className="flex flex-col gap-0.5 list-none p-0 m-0">
                      {stream.phiReasons.map((r, i) => (
                        <li
                          key={i}
                          className="text-[13px] leading-[18px]"
                          style={{ color: "var(--mute)" }}
                        >
                          {r}
                        </li>
                      ))}
                    </ul>
                  )}
                  <p className="text-[13px] leading-[18px]" style={{ color: "var(--mute)" }}>
                    Please remove patient identifiers and rephrase your question.
                  </p>
                </div>
              )}

              {/* Error */}
              {stream.error && !stream.phiBlocked && (
                <p className="text-[13px] leading-[18px]" style={{ color: "var(--mute)" }}>
                  {stream.error}
                </p>
              )}

              {/* Empty grounding */}
              {!stream.isStreaming && stream.emptyGrounding && !stream.phiBlocked && !stream.error && (
                <EmptyGrounding question={stream.question} />
              )}

              {/* Streaming answer */}
              {!stream.phiBlocked && !stream.error && !stream.emptyGrounding && (
                <AnswerStream
                  tokens={stream.tokens}
                  citations={stream.citations}
                  isStreaming={stream.isStreaming}
                />
              )}

              {/* Citation list (after stream completes) */}
              {!stream.isStreaming && stream.citationsMeta.length > 0 && (
                <CitationList citations={stream.citationsMeta} />
              )}
            </div>
          )}

          <div ref={bottomRef} />
        </div>
      </div>

      {/* Composer — sticky at bottom */}
      <div
        className="sticky bottom-0 border-t px-4 py-4"
        style={{
          background: "var(--paper)",
          borderColor: "var(--line)",
        }}
      >
        <div className="max-w-2xl mx-auto">
          <AskComposer
            onSubmit={handleSubmit}
            disabled={isSubmitting}
            autoFocus
          />
        </div>
      </div>
    </div>
  );
}

// --- History entry ---

function HistoryEntry({ entry }: { entry: QAEntry }) {
  return (
    <div className="flex flex-col gap-3">
      {/* Question */}
      <div
        className="self-end max-w-[80%] rounded-[12px] px-4 py-3"
        style={{ background: "var(--ink)", color: "var(--paper)" }}
      >
        <p className="text-[14px] leading-[20px] break-words whitespace-pre-wrap">
          {entry.question}
        </p>
      </div>

      {/* Answer or empty grounding */}
      {entry.wasGrounded ? (
        <>
          <AnswerStream
            tokens={entry.answer}
            citations={entry.citations.map((c) => ({
              doc_id: c.uuid,
              source_url: "",
              title: c.title,
            }))}
            isStreaming={false}
          />
          {entry.citations.length > 0 && (
            <CitationList citations={entry.citations} />
          )}
        </>
      ) : (
        <EmptyGrounding question={entry.question} />
      )}
    </div>
  );
}
