"use client";

import { useState } from "react";
import type { DecisionOutput } from "@/shared/schema";
import { cn } from "@/lib/cn";

interface Props {
  decision: DecisionOutput;
  shareToken?: string | null;
  publicView?: boolean;
}

export function RecommendationView({ decision, shareToken, publicView }: Props) {
  const [showWork, setShowWork] = useState(false);
  const [reducerIdx, setReducerIdx] = useState(0);
  const [copyState, setCopyState] = useState<{ id?: string; ok?: boolean }>({});

  const conf = decision.recommendation.confidence;
  const tier = conf >= 75 ? "high" : conf >= 50 ? "mid" : "low";
  const confLabel = tier === "high" ? "High confidence" : tier === "mid" ? "Moderate confidence" : "Low confidence";
  const confColor =
    tier === "high"
      ? "text-confidence-high"
      : tier === "mid"
        ? "text-confidence-mid"
        : "text-confidence-low";
  const confDot =
    tier === "high"
      ? "bg-confidence-high"
      : tier === "mid"
        ? "bg-confidence-mid"
        : "bg-confidence-low";

  const reducer = decision.workloadReducers[reducerIdx];

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
    <div className="space-y-6">
      {/* Hero recommendation */}
      <section className="rounded-2xl border border-slate-200 bg-canvas-raised p-5 sm:p-6">
        <div className="text-xs uppercase tracking-wide text-ink-muted">Recommendation</div>
        <h2 className="mt-1 text-2xl font-semibold leading-tight">
          {decision.recommendation.option}
        </h2>
        <div className={cn("mt-3 flex items-center gap-2 text-sm font-medium", confColor)}>
          <span className={cn("h-2 w-2 rounded-full", confDot)} aria-hidden="true" />
          {confLabel} · {conf}%
        </div>
        <p className="mt-3 text-ink-subtle leading-relaxed">{decision.recommendation.rationale}</p>
      </section>

      {/* Robust alternative */}
      <section className="rounded-2xl border border-slate-200 bg-canvas-raised p-5">
        <div className="text-xs uppercase tracking-wide text-ink-muted">Robust alternative</div>
        <div className="mt-1 text-base font-semibold">{decision.robustAlternative.option}</div>
        <p className="mt-2 text-sm text-ink-subtle">{decision.robustAlternative.why}</p>
      </section>

      {/* Next steps (was: workload reducers — chips removed; verb-only context) */}
      {decision.workloadReducers.length > 0 && reducer && (
        <section className="rounded-2xl border border-slate-200 bg-canvas-raised p-5">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-semibold">Next step</h3>
            {decision.workloadReducers.length > 1 && (
              <div className="text-xs text-ink-muted">
                {reducerIdx + 1} of {decision.workloadReducers.length}
              </div>
            )}
          </div>
          <div className="mt-2 text-base font-medium">{reducer.title}</div>
          <p className="mt-1 text-sm text-ink-subtle">{reducer.description}</p>
          <ReducerArtifact
            reducer={reducer}
            copy={copy}
            copyId={`r-${reducerIdx}`}
            copied={copyState.id === `r-${reducerIdx}` && copyState.ok === true}
          />
          {decision.workloadReducers.length > 1 && (
            <div className="mt-4 flex justify-between text-sm">
              <button
                type="button"
                onClick={() => setReducerIdx((i) => Math.max(0, i - 1))}
                disabled={reducerIdx === 0}
                className="px-3 py-2 rounded-lg border border-slate-300 disabled:opacity-40 min-h-[44px]"
                aria-label="Previous next step"
              >
                ← Previous
              </button>
              <button
                type="button"
                onClick={() => setReducerIdx((i) => Math.min(decision.workloadReducers.length - 1, i + 1))}
                disabled={reducerIdx === decision.workloadReducers.length - 1}
                className="px-3 py-2 rounded-lg border border-slate-300 disabled:opacity-40 min-h-[44px]"
                aria-label="Next step"
              >
                Next →
              </button>
            </div>
          )}
        </section>
      )}

      {/* Alternatives — collapsible by default; shown only on demand */}
      <details className="rounded-2xl border border-slate-200 bg-canvas-raised p-5 group">
        <summary className="cursor-pointer list-none flex items-center justify-between">
          <h3 className="text-base font-semibold">What about the other options?</h3>
          <span className="text-xs text-ink-muted group-open:hidden">Show {decision.alternatives.length}</span>
          <span className="text-xs text-ink-muted hidden group-open:inline">Hide</span>
        </summary>
        <ul className="mt-3 divide-y divide-slate-200">
          {decision.alternatives.map((a, i) => (
            <li key={i} className="py-3">
              <div className="text-sm font-medium">{a.option}</div>
              <div className="mt-1 text-sm text-ink-subtle">
                <span className="text-ink-muted">Why this didn't win: </span>
                {a.reason}
              </div>
            </li>
          ))}
        </ul>
      </details>

      {/* Show the work — human summary first; raw trace behind a second toggle */}
      <section className="no-print">
        <button
          type="button"
          onClick={() => setShowWork((s) => !s)}
          className="text-sm text-ink underline min-h-[24px]"
          aria-expanded={showWork}
        >
          {showWork ? "Hide reasoning" : "How was this decided?"}
        </button>
        {showWork && (
          <div className="mt-3 space-y-3">
            <MethodTraceSummary trace={decision.methodTrace} />
            <details className="rounded-xl border border-slate-200 bg-canvas-raised p-4">
              <summary className="cursor-pointer text-sm text-ink-subtle">
                Show raw reasoning data (for advanced users)
              </summary>
              <div className="mt-3 space-y-3">
                {decision.methodTrace.map((entry, i) => (
                  <details key={i} className="rounded-lg border border-slate-200 p-3">
                    <summary className="cursor-pointer text-xs font-medium text-ink-subtle">
                      {entry.name}
                    </summary>
                    <pre className="mt-2 overflow-auto text-xs leading-relaxed text-ink-muted whitespace-pre-wrap">
                      {JSON.stringify(entry.output, null, 2)}
                    </pre>
                  </details>
                ))}
              </div>
            </details>
          </div>
        )}
      </section>

      {/* Sticky actions */}
      {!publicView && (
        <div className="sticky bottom-0 left-0 right-0 -mx-4 sm:-mx-6 px-4 sm:px-6 py-3 bg-canvas-raised/95 backdrop-blur border-t border-slate-200 flex flex-wrap items-center gap-2 no-print">
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center justify-center px-4 py-3 rounded-xl bg-ink text-white font-medium min-h-[48px]"
          >
            Print / Save as PDF
          </button>
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

function ReducerArtifact({
  reducer,
  copy,
  copyId,
  copied,
}: {
  reducer: DecisionOutput["workloadReducers"][number];
  copy: (text: string, id: string) => void;
  copyId: string;
  copied: boolean;
}) {
  const a = reducer.artifact;
  if (a.promptText) {
    return (
      <div className="mt-3">
        <div className="text-xs text-ink-muted mb-1">Paste this into ChatGPT, Claude, or your AI assistant:</div>
        <pre className="rounded-lg bg-slate-50 border border-slate-200 p-3 text-xs leading-relaxed whitespace-pre-wrap text-ink">
          {a.promptText}
        </pre>
        <button
          type="button"
          onClick={() => copy(a.promptText!, copyId)}
          className="mt-2 inline-flex items-center px-3 py-2 rounded-lg border border-slate-300 text-sm text-ink min-h-[40px]"
        >
          {copied ? "Copied ✓" : "Copy this text"}
        </button>
      </div>
    );
  }
  if (a.playbookSteps && a.playbookSteps.length > 0) {
    return (
      <ol className="mt-3 space-y-1.5 text-sm text-ink-subtle list-decimal list-inside">
        {a.playbookSteps.map((s, i) => (
          <li key={i}>{s}</li>
        ))}
      </ol>
    );
  }
  if (a.pluginUrl) {
    return (
      <div className="mt-3 text-sm">
        <a href={a.pluginUrl} target="_blank" rel="noopener noreferrer" className="text-ink underline">
          Open: {a.pluginUrl}
        </a>
      </div>
    );
  }
  // Internal-only artifact types (skillName, mcpServer) hidden from end users — these
  // are taxonomy holdovers from the engine schema and don't show actionable UI.
  return null;
}

function MethodTraceSummary({
  trace,
}: {
  trace: DecisionOutput["methodTrace"];
}) {
  // Translate each engine stage to a one-line plain-English summary.
  const labels: Record<string, string> = {
    values: "Listed what matters most based on your answers.",
    constraints: "Removed options that broke a hard limit you set.",
    weights: "Weighed each remaining option against your priorities.",
    outranking: "Ranked the contenders head-to-head on the criteria that mattered.",
    ranking: "Picked the top option and the safest fallback if assumptions shift.",
  };
  return (
    <ol className="rounded-xl border border-slate-200 bg-canvas-raised p-4 space-y-2 text-sm text-ink-subtle">
      {trace.map((entry) => (
        <li key={entry.stage} className="flex gap-3">
          <span className="text-ink-muted text-xs mt-0.5">{entry.stage}.</span>
          <span>{labels[entry.name] ?? entry.name}</span>
        </li>
      ))}
    </ol>
  );
}
