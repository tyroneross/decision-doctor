"use client";

import { useState } from "react";
import type { Decision } from "@/lib/db/schema";

type Recommendation = {
  option: string;
  confidence: number;
  rationale: string;
};
type Alternative = { option: string; eliminatedAtStage: 2 | 4; reason: string };
type Robust = {
  option: string;
  rationale: string;
};
type MethodTraceEntry = {
  stage: number;
  label: string;
  detail: string;
};
type WorkloadReducer = {
  title: string;
  description: string;
  estTimeSavingHrsPerWeek?: number;
};

function confidenceClass(c: number): string {
  if (c >= 75) return "status-ok";
  if (c >= 50) return "status-warn";
  return "status-error";
}
function confidenceLabel(c: number): string {
  if (c >= 75) return "high confidence";
  if (c >= 50) return "moderate confidence";
  return "low confidence";
}

export function RecommendationView({ row }: { row: Decision }) {
  const rec = (row.recommendation as Recommendation | null) ?? null;
  const alternatives = (row.alternatives as Alternative[] | null) ?? [];
  const robust = (row.robustAlternative as Robust | null) ?? null;
  const trace = (row.methodTrace as MethodTraceEntry[] | null) ?? [];
  const reducers = (row.workloadReducers as WorkloadReducer[] | null) ?? [];

  const [showAlternatives, setShowAlternatives] = useState(false);
  const [showTrace, setShowTrace] = useState(false);

  if (!rec) {
    return (
      <section className="space-y-2">
        <h1 className="text-xl font-semibold">Decision incomplete</h1>
        <p className="text-sm text-ink-500">
          The engine did not return a recommendation. Status: {row.status}.
        </p>
      </section>
    );
  }

  return (
    <article className="space-y-6">
      <header className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-wide text-ink-500">
            {row.templateId} · {row.createdAt.toLocaleDateString()}
          </p>
          <h1 className="mt-1 text-xl font-semibold">{row.title ?? rec.option}</h1>
        </div>
        <button
          type="button"
          className="no-print rounded border border-ink-300 px-3 py-1.5 text-xs text-ink-700 hover:bg-ink-100/40"
          onClick={() => window.print()}
        >
          Save as PDF
        </button>
      </header>

      {/* F-04 — recommendation card, above fold */}
      <section
        aria-label="Recommendation"
        className="rounded-lg border border-ink-100 p-5"
      >
        <h2 className="text-base font-medium text-ink-900">Recommendation</h2>
        <p className="mt-2 text-lg font-semibold text-ink-900">{rec.option}</p>
        <p className="mt-1 text-sm text-ink-700">{rec.rationale}</p>
        <p className={"mt-3 text-xs font-medium " + confidenceClass(rec.confidence)}>
          {confidenceLabel(rec.confidence)} · {rec.confidence}/100
        </p>
        <p className="mt-1 text-xs text-ink-500">
          Confidence is the TOPSIS top-1/top-2 margin scaled to 100. Tied
          options will fall into the moderate band.
        </p>
      </section>

      {/* Robust alternative */}
      {robust && (
        <section aria-label="Robust alternative" className="rounded-lg border border-ink-100 p-5">
          <h2 className="text-sm font-medium text-ink-700">If conditions change</h2>
          <p className="mt-1 text-base font-medium text-ink-900">{robust.option}</p>
          <p className="mt-1 text-sm text-ink-700">{robust.rationale}</p>
        </section>
      )}

      {/* Alternatives — disclosure */}
      <section aria-label="Alternatives considered">
        <button
          type="button"
          onClick={() => setShowAlternatives((v) => !v)}
          className="text-sm font-medium text-ink-900 hover:text-accent-600"
          aria-expanded={showAlternatives}
        >
          {showAlternatives ? "Hide" : "Show"} alternatives we considered
          ({alternatives.length})
        </button>
        {showAlternatives && (
          <ul className="mt-3 divide-y divide-ink-100 rounded border border-ink-100">
            {alternatives.map((a, i) => (
              <li key={i} className="px-4 py-3">
                <p className="text-sm font-medium text-ink-900">{a.option}</p>
                <p className="text-xs text-ink-500">
                  Eliminated at stage {a.eliminatedAtStage} — {a.reason}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Method trace — disclosure */}
      <section aria-label="Method trace">
        <button
          type="button"
          onClick={() => setShowTrace((v) => !v)}
          className="text-sm font-medium text-ink-900 hover:text-accent-600"
          aria-expanded={showTrace}
        >
          {showTrace ? "Hide" : "Show"} how the engine got here
        </button>
        {showTrace && (
          <ol className="mt-3 space-y-3 rounded border border-ink-100 p-4">
            {trace.map((s, i) => (
              <li key={i} className="border-l-2 border-ink-100 pl-3">
                <p className="text-sm font-medium text-ink-900">
                  Stage {s.stage} — {s.label}
                </p>
                <p className="text-xs text-ink-500">{s.detail}</p>
              </li>
            ))}
          </ol>
        )}
      </section>

      {/* Workload reducers — 3-card set; mobile stacks, sm breakpoint side-by-side */}
      {reducers.length > 0 && (
        <section aria-label="Workload reducers" className="space-y-3">
          <h2 className="text-base font-medium text-ink-900">
            Three things to do less of
          </h2>
          <div className="grid gap-3 sm:grid-cols-3">
            {reducers.slice(0, 3).map((r, i) => (
              <div
                key={i}
                className="rounded-lg border border-ink-100 p-4"
              >
                <p className="text-sm font-medium text-ink-900">{r.title}</p>
                <p className="mt-1 text-xs text-ink-500">{r.description}</p>
                {r.estTimeSavingHrsPerWeek !== undefined && (
                  <p className="mt-2 text-xs font-medium text-ink-700">
                    ~{r.estTimeSavingHrsPerWeek} hrs/week
                  </p>
                )}
              </div>
            ))}
          </div>
        </section>
      )}
    </article>
  );
}
