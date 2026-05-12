"use client";

// app/app/library/use-case/[id]/UseCaseDetailClient.tsx
//
// Client child of UseCaseDetailPage. Two responsibilities:
//   1. On mount (authed only), POST /api/library/use-cases/[id]/example and
//      stream the result into the Example pane. If `cachedExample` was
//      provided by the server (column already populated), render immediately
//      and skip the network call.
//   2. Render the chat refine pane: composer + history, POST each user
//      message to /api/library/use-cases/[id]/refine and stream the
//      assistant reply.
//
// SSE shape (shared with /api/assets/explain):
//   data: {"type":"token","text":"..."}\n\n
//   data: {"type":"done"}\n\n
//   data: {"type":"error","message":"..."}\n\n
//
// Calm Precision: single border per card, muted-until-actionable buttons,
// status as text colour only.

import * as React from "react";

type SSEEvent =
  | { type: "token"; text: string }
  | { type: "done" }
  | { type: "error"; message: string };

interface Props {
  useCaseId: string;
  cachedExample: string | null;
  isAuthed: boolean;
}

type ChatTurn = { role: "user" | "assistant"; content: string };

export function UseCaseDetailClient({
  useCaseId,
  cachedExample,
  isAuthed,
}: Props) {
  // ---- Example output state ------------------------------------------------
  const [exampleText, setExampleText] = React.useState<string>(
    cachedExample ?? "",
  );
  const [exampleStreaming, setExampleStreaming] = React.useState(false);
  const [exampleError, setExampleError] = React.useState<string | null>(null);
  const exampleRequested = React.useRef(false);

  const streamExample = React.useCallback(async () => {
    if (exampleRequested.current) return;
    exampleRequested.current = true;
    setExampleStreaming(true);
    setExampleError(null);
    setExampleText("");
    try {
      const r = await fetch(
        `/api/library/use-cases/${encodeURIComponent(useCaseId)}/example`,
        { method: "POST" },
      );
      if (!r.ok || !r.body) {
        throw new Error(`Stream failed (${r.status})`);
      }
      await consumeSSE(r.body, (evt) => {
        if (evt.type === "token") {
          setExampleText((p) => p + evt.text);
        } else if (evt.type === "error") {
          setExampleError(evt.message);
        }
      });
    } catch (e) {
      setExampleError(e instanceof Error ? e.message : String(e));
    } finally {
      setExampleStreaming(false);
    }
  }, [useCaseId]);

  // Auto-stream on mount only if authed and no cached value yet. Guests must
  // sign in to generate — show prompt below.
  React.useEffect(() => {
    if (!cachedExample && isAuthed) {
      void streamExample();
    }
  }, [cachedExample, isAuthed, streamExample]);

  // ---- Chat refine state ---------------------------------------------------
  const [history, setHistory] = React.useState<ChatTurn[]>([]);
  const [draft, setDraft] = React.useState("");
  const [chatStreaming, setChatStreaming] = React.useState(false);
  const [chatError, setChatError] = React.useState<string | null>(null);
  const [phiBlocked, setPhiBlocked] = React.useState<string[] | null>(null);
  const chatScrollRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    chatScrollRef.current?.scrollTo({
      top: chatScrollRef.current.scrollHeight,
    });
  }, [history, chatStreaming]);

  async function sendRefine() {
    const message = draft.trim();
    if (!message || chatStreaming) return;
    setChatStreaming(true);
    setChatError(null);
    setPhiBlocked(null);

    const newHistory: ChatTurn[] = [
      ...history,
      { role: "user", content: message },
    ];
    setHistory(newHistory);
    setDraft("");

    // Optimistically open an assistant slot for streaming tokens to append into.
    const assistantIdx = newHistory.length;
    setHistory((prev) => [...prev, { role: "assistant", content: "" }]);

    try {
      const r = await fetch(
        `/api/library/use-cases/${encodeURIComponent(useCaseId)}/refine`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message, history: newHistory.slice(0, -1) }),
        },
      );
      if (!r.ok) {
        if (r.status === 400) {
          // Possibly PHI block — parse JSON body if present.
          try {
            const body = (await r.json()) as {
              phiBlocked?: boolean;
              reasons?: string[];
              message?: string;
            };
            if (body.phiBlocked) {
              setPhiBlocked(body.reasons ?? []);
              // Roll back the optimistic assistant slot and user msg from
              // history so the user can edit and retry.
              setHistory(history);
              return;
            }
          } catch {
            /* fall through to generic error */
          }
        }
        throw new Error(`Refine failed (${r.status})`);
      }
      if (!r.body) throw new Error("No response body");
      await consumeSSE(r.body, (evt) => {
        if (evt.type === "token") {
          setHistory((prev) => {
            const next = prev.slice();
            const cur = next[assistantIdx];
            if (cur && cur.role === "assistant") {
              next[assistantIdx] = {
                role: "assistant",
                content: cur.content + evt.text,
              };
            }
            return next;
          });
        } else if (evt.type === "error") {
          setChatError(evt.message);
        }
      });
    } catch (e) {
      setChatError(e instanceof Error ? e.message : String(e));
    } finally {
      setChatStreaming(false);
    }
  }

  return (
    <div className="space-y-8">
      {/* Example output pane */}
      <section
        aria-labelledby="example-heading"
        className="rounded-xl border border-line bg-paper p-5"
      >
        <h2
          id="example-heading"
          className="text-[16px] font-semibold mb-3"
          style={{ color: "var(--ink)" }}
        >
          Example output
        </h2>
        {!isAuthed && !cachedExample && (
          <p className="text-[13px]" style={{ color: "var(--mute)" }}>
            Sign in to generate a tailored example.
          </p>
        )}
        {exampleStreaming && !exampleText && (
          <p className="text-[13px]" style={{ color: "var(--mute)" }}>
            Generating an example…
          </p>
        )}
        {exampleError && (
          <p className="text-[13px]" style={{ color: "var(--text)" }}>
            Couldn&apos;t generate an example: {exampleError}
          </p>
        )}
        {exampleText && (
          <div
            className="text-[14px] leading-relaxed whitespace-pre-wrap"
            style={{ color: "var(--text)" }}
          >
            {exampleText}
          </div>
        )}
      </section>

      {/* Chat refine pane */}
      <section
        aria-labelledby="refine-heading"
        className="rounded-xl border border-line bg-paper p-5"
      >
        <h2
          id="refine-heading"
          className="text-[16px] font-semibold mb-1"
          style={{ color: "var(--ink)" }}
        >
          Refine for your situation
        </h2>
        <p className="text-[12px] mb-4" style={{ color: "var(--mute)" }}>
          Chat to tailor the example. Don&apos;t paste patient identifiers.
          we&apos;ll block messages that look like PHI.
        </p>

        {history.length > 0 && (
          <div
            ref={chatScrollRef}
            className="mb-4 max-h-[400px] overflow-y-auto space-y-3"
          >
            {history.map((turn, i) => (
              <div
                key={i}
                className={
                  turn.role === "user"
                    ? "text-[14px] text-right"
                    : "text-[14px]"
                }
              >
                <div
                  className="text-[11px] mb-1"
                  style={{ color: "var(--mute)" }}
                >
                  {turn.role === "user" ? "You" : "Assistant"}
                </div>
                <div
                  className="whitespace-pre-wrap"
                  style={{ color: "var(--text)" }}
                >
                  {turn.content ||
                    (chatStreaming && i === history.length - 1
                      ? "…"
                      : "")}
                </div>
              </div>
            ))}
          </div>
        )}

        {phiBlocked && (
          <div
            className="mb-3 rounded-md border border-line p-3 text-[13px]"
            style={{ color: "var(--text)" }}
          >
            <p className="font-medium mb-1">
              That message looked like it contained PHI.
            </p>
            <p style={{ color: "var(--mute)" }}>
              Reasons: {phiBlocked.join(", ")}. Edit and try again.
            </p>
          </div>
        )}

        {chatError && (
          <p className="mb-3 text-[13px]" style={{ color: "var(--text)" }}>
            Error: {chatError}
          </p>
        )}

        {isAuthed ? (
          <div className="flex gap-2">
            <textarea
              rows={2}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (
                  e.key === "Enter" &&
                  (e.metaKey || e.ctrlKey) &&
                  !chatStreaming
                ) {
                  e.preventDefault();
                  void sendRefine();
                }
              }}
              placeholder="e.g. I see ~15 patients/week and most of my admin time goes into…"
              className="flex-1 rounded-md border border-line bg-paper px-3 py-2 text-[14px] focus:outline-none focus:ring-1 focus:ring-ink"
              style={{ color: "var(--text)" }}
              disabled={chatStreaming}
            />
            <button
              type="button"
              onClick={() => void sendRefine()}
              disabled={chatStreaming || draft.trim().length === 0}
              className={
                chatStreaming || draft.trim().length === 0
                  ? "rounded-md border border-line bg-paper px-3 py-1.5 text-[13px] font-medium cursor-not-allowed"
                  : "rounded-md border border-ink bg-ink text-paper px-3 py-1.5 text-[13px] font-medium hover:opacity-90"
              }
              style={
                chatStreaming || draft.trim().length === 0
                  ? { color: "var(--mute)", minHeight: 36 }
                  : { minHeight: 36 }
              }
            >
              {chatStreaming ? "Thinking…" : "Send"}
            </button>
          </div>
        ) : (
          <p className="text-[13px]" style={{ color: "var(--mute)" }}>
            Sign in to chat about this use case.
          </p>
        )}
      </section>
    </div>
  );
}

// ---- SSE consumer --------------------------------------------------------
//
// Reads "data: <json>\n\n" frames from a ReadableStream and invokes the
// handler for each parsed event. Mirrors components/plugin-lib/AssetDetailDrawer.tsx
// (ExplainView) so both surfaces use the same shape.
async function consumeSSE(
  body: ReadableStream<Uint8Array>,
  onEvent: (evt: SSEEvent) => void,
): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let idx: number;
    while ((idx = buf.indexOf("\n\n")) >= 0) {
      const frame = buf.slice(0, idx).trim();
      buf = buf.slice(idx + 2);
      if (!frame.startsWith("data: ")) continue;
      try {
        const evt = JSON.parse(frame.slice(6)) as SSEEvent;
        onEvent(evt);
      } catch {
        /* ignore malformed frame */
      }
    }
  }
}
