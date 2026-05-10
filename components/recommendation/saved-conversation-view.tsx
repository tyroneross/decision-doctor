// Renderer for chat decisions that didn't run the full MCDA engine
// (modes generic_structured / generative_design / values_dominant).
// Shows the conversation transcript + the prompt-to-paste artifact.
//
// Per persona panel 2026-05-10: the previous placeholder card leaked
// internal taxonomy ("v1.1", "the 3 templates") into user copy. This view
// uses only plain English and treats the saved conversation as the artifact.

"use client";

import { useState } from "react";
import type { DecisionOutput } from "@/shared/schema";

interface ChatTurn {
  role: "user" | "assistant" | "system";
  content: string;
  timestamp?: string | Date;
}

interface Props {
  decision: DecisionOutput;
  transcript: { messages: ChatTurn[] } | null;
  shareToken?: string | null;
  publicView?: boolean;
}

export function SavedConversationView({ decision, transcript, shareToken, publicView }: Props) {
  const [copyState, setCopyState] = useState<{ id?: string; ok?: boolean }>({});
  const [showTranscript, setShowTranscript] = useState(true);

  // The saved-conversation prompt artifact (the practical "do this next" item)
  const promptReducer = decision.workloadReducers.find(
    (r) => r.type === "prompt" && r.artifact?.promptText,
  );

  async function copy(text: string, id: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopyState({ id, ok: true });
      setTimeout(() => setCopyState({}), 1500);
    } catch {
      setCopyState({ id, ok: false });
    }
  }

  return (
    <div className="space-y-5">
      {/* Hero — friendly headline + acknowledgement */}
      <section className="rounded-2xl border border-slate-200 bg-canvas-raised p-5 sm:p-6">
        <h1 className="text-2xl font-semibold leading-tight">Conversation saved</h1>
        <p className="mt-3 text-ink-subtle leading-relaxed">{decision.recommendation.rationale}</p>
      </section>

      {/* Transcript */}
      {transcript && transcript.messages.length > 0 && (
        <section className="rounded-2xl border border-slate-200 bg-canvas-raised p-5">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-semibold">What we talked about</h3>
            <button
              type="button"
              onClick={() => setShowTranscript((s) => !s)}
              className="text-sm text-ink-subtle underline min-h-[44px]"
            >
              {showTranscript ? "Hide" : "Show"}
            </button>
          </div>
          {showTranscript && (
            <ol className="mt-3 space-y-3">
              {transcript.messages
                .filter((m) => m.role !== "system")
                .map((m, i) => (
                  <li key={i} className={m.role === "user" ? "flex justify-end" : "flex justify-start"}>
                    <div
                      className={
                        m.role === "user"
                          ? "px-4 py-2 rounded-2xl bg-ink text-white max-w-[85%] text-sm whitespace-pre-wrap"
                          : "px-4 py-2 rounded-2xl bg-slate-50 border border-slate-200 max-w-[85%] text-sm whitespace-pre-wrap text-ink"
                      }
                    >
                      {m.content}
                    </div>
                  </li>
                ))}
            </ol>
          )}
        </section>
      )}

      {/* Prompt artifact — the practical "do this next" */}
      {promptReducer?.artifact?.promptText && (
        <section className="rounded-2xl border border-slate-200 bg-canvas-raised p-5">
          <h3 className="text-base font-semibold">{promptReducer.title}</h3>
          <p className="mt-1 text-sm text-ink-subtle">{promptReducer.description}</p>
          <pre className="mt-3 rounded-lg bg-slate-50 border border-slate-200 p-3 text-xs leading-relaxed whitespace-pre-wrap text-ink max-h-64 overflow-auto">
            {promptReducer.artifact.promptText}
          </pre>
          <button
            type="button"
            onClick={() => copy(promptReducer.artifact!.promptText!, "prompt")}
            className="mt-2 inline-flex items-center px-3 py-2 rounded-lg border border-slate-300 text-sm text-ink min-h-[44px]"
          >
            {copyState.id === "prompt" && copyState.ok ? "Copied ✓" : "Copy this text"}
          </button>
        </section>
      )}

      {/* Other suggestions */}
      <section className="rounded-2xl border border-slate-200 bg-canvas-raised p-5">
        <h3 className="text-base font-semibold">What you can do from here</h3>
        <ul className="mt-3 space-y-3 text-sm">
          {decision.workloadReducers
            .filter((r) => r !== promptReducer)
            .map((r, i) => (
              <li key={i}>
                <div className="font-medium text-ink">{r.title}</div>
                <div className="text-ink-subtle mt-0.5">{r.description}</div>
                {r.artifact?.playbookSteps && r.artifact.playbookSteps.length > 0 && (
                  <ol className="mt-2 ml-4 space-y-1 text-ink-subtle list-decimal text-sm">
                    {r.artifact.playbookSteps.map((s, j) => (
                      <li key={j}>{s}</li>
                    ))}
                  </ol>
                )}
              </li>
            ))}
        </ul>
      </section>

      {/* Sticky actions */}
      {!publicView && (
        <div className="sticky bottom-0 left-0 right-0 -mx-4 sm:-mx-6 px-4 sm:px-6 py-3 bg-canvas-raised/95 backdrop-blur border-t border-slate-200 flex flex-wrap items-center gap-2 no-print">
          <a
            href="/app/chat"
            className="inline-flex items-center justify-center px-4 py-3 rounded-xl bg-ink text-white font-medium min-h-[48px]"
          >
            Start a new decision
          </a>
          {shareToken && (
            <button
              type="button"
              onClick={() => copy(`${window.location.origin}/share/${shareToken}`, "share")}
              className="inline-flex items-center justify-center px-4 py-3 rounded-xl border border-slate-300 text-ink min-h-[48px]"
            >
              {copyState.id === "share" && copyState.ok ? "Link copied" : "Copy share link"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
