"use client";

// C7 — Recommendation D6: 3-tier pyramid, ink-only.
//
// Tier 1 (HERO): eyebrow with confidence band, big recommendation, 1-line
//   method label, optional green hours-saved pill.
// Tier 2 (3 MECE cards, equal width on desktop, stacked on mobile):
//   🛠️ The skill we built · 🎯 What this changes · 🛡️ If this stops working
// Tier 3 (THIS WEEK · 3 actions): numbered list, each row tagged with
//   implementation type (🛠️ Skill / 🧩 Plugin / 👤 Human).
// Footer: <details> "▾ show the math" → existing method-trace, IBM Plex
//   Mono on bg-paper.
//
// Confidence: text-only label. No background pill.
// Color: ink/mute on bone. The ONLY accent color used is `text-ok` for the
//   green hours-saved pill (var(--ok)).

import { useState } from "react";
import Link from "next/link";
import type { Decision } from "@/lib/db/schema";
import { ScaffoldViewer } from "@/components/scaffold/ScaffoldViewer";
import type { Scaffold, AiFeasibility } from "@/shared/schema";
import {
  confidenceBand,
  formatHrs,
  totalHoursSaved,
} from "@/lib/decision-display";
import { describeRobustness } from "@/lib/engine/robustness";
import { Button } from "@/components/ui/Button";

// ─── JSON-column shapes (defensive — DB types are unknown at boundary) ──

type Recommendation = {
  option: string;
  // F-11: confidence is OMITTED for VDD (values-dominant) outputs.
  confidence?: number;
  rationale: string;
};
type Alternative = {
  option: string;
  eliminatedAtStage?: 2 | 4;
  reason: string;
};
type Robust = { option: string; rationale?: string; why?: string };
type MethodTraceEntry = { stage: number; label?: string; detail?: string; name?: string; output?: unknown };
type WorkloadReducer = {
  type?: "prompt" | "playbook" | "skill" | "plugin" | "mcp_tool";
  title: string;
  description: string;
  estTimeSavingHrsPerWeek?: number;
  aiFeasibility?: AiFeasibility;
  feasibilityRationale?: string;
  combinedScore?: number;
  scaffold?: Scaffold;
  artifact?: {
    promptText?: string;
    playbookSteps?: string[];
    skillName?: string;
  };
};

// Plain-language confidence labels per spec (text-only — no chip).
function confidenceLabel(conf: number | null | undefined): string {
  if (typeof conf !== "number") return "values-dominant";
  if (conf >= 75) return "strong call";
  if (conf >= 55) return "leans this way";
  return "could flip";
}

// Method label for the tier-1 hero — short phrase, not jargon.
function methodLabel(templateId: string | null | undefined): string {
  switch (templateId) {
    case "capacity":
      return "MCDA over your capacity inputs";
    case "pricing":
      return "MCDA over your pricing constraints";
    case "admin-hire":
      return "MCDA over your hiring runway";
    default:
      return "Multi-criteria decision analysis";
  }
}

// Tier-3 implementation-type tag.
function implementationTag(r: WorkloadReducer): { icon: string; label: string } {
  const tier = r.aiFeasibility ?? r.type;
  if (tier === "skill") return { icon: "🛠️", label: "Skill" };
  if (tier === "plugin") return { icon: "🧩", label: "Plugin" };
  if (tier === "agent") return { icon: "🤖", label: "Agent" };
  if (tier === "playbook") return { icon: "📋", label: "Playbook" };
  return { icon: "👤", label: "Human" };
}

// ─── Component ──────────────────────────────────────────────────────────

export function RecommendationView({ row }: { row: Decision }) {
  const rec = (row.recommendation as Recommendation | null) ?? null;
  const alternatives = (row.alternatives as Alternative[] | null) ?? [];
  const robust = (row.robustAlternative as Robust | null) ?? null;
  const trace = (row.methodTrace as MethodTraceEntry[] | null) ?? [];
  const reducers = (row.workloadReducers as WorkloadReducer[] | null) ?? [];
  const [scaffoldOpenIndex, setScaffoldOpenIndex] = useState<number | null>(null);

  if (!rec) {
    return (
      <section className="space-y-2">
        <h1 className="text-xl font-semibold text-text">Decision incomplete</h1>
        <p className="text-sm text-mute">
          The engine did not return a recommendation. Status: {row.status}.
        </p>
      </section>
    );
  }

  const conf = rec.confidence ?? null;
  const band = confidenceBand(conf);
  const hasConfidence = typeof conf === "number";
  const hoursBack = totalHoursSaved(reducers);
  const topReducer = reducers[0];
  const thisWeek = reducers.slice(0, 3);
  const robustness = describeRobustness({
    robustOption: robust?.option,
    robustWhy: robust?.why ?? robust?.rationale,
    templateId: row.templateId,
  });

  return (
    <article className="space-y-8">
      {/* TOP NAV — minimal: history link + print, no chip pills */}
      <div className="no-print flex flex-wrap items-center justify-between gap-3">
        <nav
          aria-label="breadcrumb"
          className="flex items-center gap-1.5 text-[13px] text-mute"
        >
          <Link href="/app/decisions" className="hover:text-text">
            History
          </Link>
          <span aria-hidden>·</span>
          <span>{row.templateId ?? "decision"}</span>
        </nav>
        <PrintButton />
      </div>

      {/* TIER 1 — HERO. Eyebrow + big rec + method label + optional green pill. */}
      <section aria-label="Recommendation">
        <p className="text-[12px] font-medium uppercase tracking-[0.12em] text-text">
          RECOMMENDED
          {hasConfidence ? <> · {conf}%</> : null}{" "}
          · {confidenceLabel(conf)}
          <span className="text-mute"> ({band.icon} {band.label})</span>
        </p>
        <h1 className="mt-2 text-[28px] font-semibold leading-tight tracking-tight text-text sm:text-[32px]">
          {rec.option}
        </h1>
        <p className="mt-2 text-[15px] text-mute">{methodLabel(row.templateId)}</p>
        {hoursBack > 0 && (
          <p className="mt-3 inline-flex items-baseline gap-1 text-[15px] font-semibold text-ok">
            +{formatHrs(hoursBack)} hrs/wk back
          </p>
        )}
      </section>

      {/* TIER 2 — 3 MECE supporting cards, equal width on desktop. */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3 md:gap-5">
        {/* MECE 1 — The skill we built */}
        <article className="rounded-2xl border border-line bg-paper p-6">
          <p className="text-[12px] font-medium uppercase tracking-[0.12em] text-mute">
            🛠️ The skill we built
          </p>
          {topReducer ? (
            <>
              <h3 className="mt-3 text-[17px] font-semibold leading-snug text-text">
                {topReducer.title}
              </h3>
              <p className="mt-1.5 text-[14px] leading-relaxed text-mute">
                {topReducer.description}
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                {topReducer.artifact?.promptText && (
                  <CopyPromptButton text={topReducer.artifact.promptText} />
                )}
                {topReducer.scaffold &&
                  topReducer.scaffold.files.length > 0 && (
                    <Button
                      variant="secondary"
                      onClick={() => setScaffoldOpenIndex(0)}
                      aria-label={`Open scaffold for ${topReducer.title}`}
                    >
                      Open scaffold →
                    </Button>
                  )}
              </div>
            </>
          ) : (
            <p className="mt-3 text-[14px] text-mute">
              No starter skill was generated for this decision.
            </p>
          )}
        </article>

        {/* MECE 2 — What this changes */}
        <article className="rounded-2xl border border-line bg-paper p-6">
          <p className="text-[12px] font-medium uppercase tracking-[0.12em] text-mute">
            🎯 What this changes
          </p>
          <p className="mt-3 text-[14px] leading-relaxed text-text">
            {rec.rationale}
          </p>
          <ul className="mt-4 space-y-1.5 text-[13.5px] text-mute">
            <li>
              {reducers.length} {reducers.length === 1 ? "skill" : "skills"} to
              ship this week
            </li>
            {hoursBack > 0 && (
              <li>
                ~{formatHrs(hoursBack)}/wk recovered if you ship them all
              </li>
            )}
            <li>
              {alternatives.length} alternative
              {alternatives.length === 1 ? "" : "s"} compared
            </li>
          </ul>
        </article>

        {/* MECE 3 — If this stops working */}
        <article className="rounded-2xl border border-line bg-paper p-6">
          <p className="text-[12px] font-medium uppercase tracking-[0.12em] text-mute">
            🛡️ If this stops working
          </p>
          <h3 className="mt-3 text-[17px] font-semibold leading-snug text-text">
            {robustness.option}
          </h3>
          <p className="mt-1.5 text-[14px] leading-relaxed text-mute">
            {robustness.threshold}
          </p>
          {!robustness.hasReal && (
            <p className="mt-3 text-[12px] text-mute">
              (the engine couldn't surface a strong fallback — re-run with
              revised priorities if conditions change)
            </p>
          )}
        </article>
      </div>

      {/* TIER 3 — THIS WEEK · 3 ACTIONS. Numbered, implementation-type tagged. */}
      {thisWeek.length > 0 && (
        <section className="rounded-2xl border border-line bg-paper p-6 sm:p-7">
          <p className="text-[12px] font-medium uppercase tracking-[0.12em] text-mute">
            THIS WEEK · {thisWeek.length} ACTION
            {thisWeek.length === 1 ? "" : "S"}
          </p>
          <ol className="mt-4 divide-y divide-line">
            {thisWeek.map((r, i) => {
              const tag = implementationTag(r);
              return (
                <li
                  key={i}
                  className="flex items-start gap-3 py-3 first:pt-0 last:pb-0"
                >
                  <span
                    aria-hidden
                    className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-line text-[12px] font-semibold text-text"
                  >
                    {i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                      <p className="text-[15px] font-semibold leading-snug text-text">
                        {r.title}
                      </p>
                      <span className="text-[12px] text-mute">
                        {tag.icon} {tag.label}
                      </span>
                    </div>
                    <p className="mt-0.5 text-[13.5px] leading-relaxed text-mute">
                      {r.description}
                    </p>
                    {r.estTimeSavingHrsPerWeek ? (
                      <p className="mt-1 text-[12px] font-semibold text-ok">
                        +{formatHrs(r.estTimeSavingHrsPerWeek)}/wk
                      </p>
                    ) : null}
                  </div>
                  {r.scaffold && r.scaffold.files.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setScaffoldOpenIndex(i)}
                      className="shrink-0 self-center text-[13px] font-medium text-text underline decoration-line underline-offset-2 hover:text-ink focus:outline-none focus-visible:ring-[3px] focus-visible:ring-ink/20"
                      aria-label={`Open scaffold for ${r.title}`}
                    >
                      Open →
                    </button>
                  )}
                </li>
              );
            })}
          </ol>
        </section>
      )}

      {/* SHOW THE MATH — disclosure. IBM Plex Mono on bg-paper, no
          background tint pillows. */}
      <ShowTheMath
        confidence={conf}
        alternatives={alternatives}
        trace={trace}
      />

      {/* SCAFFOLD DRAWER */}
      {scaffoldOpenIndex !== null && reducers[scaffoldOpenIndex]?.scaffold && (
        <ScaffoldViewer
          scaffold={reducers[scaffoldOpenIndex]!.scaffold!}
          title={reducers[scaffoldOpenIndex]!.title}
          open
          onClose={() => setScaffoldOpenIndex(null)}
          empty={reducers[scaffoldOpenIndex]!.scaffold!.files.length === 0}
          category={row.templateId ?? undefined}
        />
      )}
    </article>
  );
}

// ─── Sub-components ─────────────────────────────────────────────────────

function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="inline-flex h-9 items-center gap-1.5 rounded-full border border-line px-3 text-[13px] font-medium text-text transition-colors duration-150 hover:bg-line/40 focus:outline-none focus-visible:ring-[3px] focus-visible:ring-ink/20"
      aria-label="Print or save as PDF"
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
        <polyline points="6 9 6 2 18 2 18 9" />
        <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
        <rect x="6" y="14" width="12" height="8" />
      </svg>
      Print
    </button>
  );
}

// Width-stable copy button. No coral; uses primary Button from primitives.
function CopyPromptButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const onClick = () => {
    if (typeof navigator === "undefined") return;
    navigator.clipboard
      ?.writeText(text)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1800);
      })
      .catch(() => {
        /* user can long-press the prompt and copy manually */
      });
  };
  return (
    <Button
      variant="primary"
      type="button"
      onClick={onClick}
      aria-label={copied ? "Prompt copied to clipboard" : "Copy prompt"}
    >
      <span className="inline-flex w-[110px] items-center justify-center">
        {copied ? (
          <span className="dd-fade-up inline-flex items-center gap-1.5">
            <CheckIcon /> Copied
          </span>
        ) : (
          <span>📋 Copy prompt</span>
        )}
      </span>
    </Button>
  );
}

function CheckIcon() {
  return (
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
  );
}

function ShowTheMath({
  confidence,
  alternatives,
  trace,
}: {
  confidence: number | null;
  alternatives: Alternative[];
  trace: MethodTraceEntry[];
}) {
  return (
    <details className="group rounded-2xl border border-line bg-paper">
      <summary className="flex cursor-pointer items-center justify-between gap-3 rounded-2xl px-6 py-4 text-[14.5px] font-medium text-text transition-colors duration-150 hover:bg-line/40 [&::-webkit-details-marker]:hidden">
        <div className="flex items-center gap-2">
          <svg
            viewBox="0 0 24 24"
            className="h-4 w-4 transition-transform duration-150 group-open:rotate-90"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            aria-hidden
          >
            <polyline points="9 18 15 12 9 6" />
          </svg>
          <span className="text-[15px] font-semibold">▾ show the math</span>
        </div>
        <span className="text-[12px] text-mute">For the curious</span>
      </summary>
      <div className="space-y-5 border-t border-line px-6 pb-6 pt-4 sm:px-7">
        {/* Plain-language explainer FIRST */}
        <p className="text-[13px] leading-relaxed text-mute">
          {typeof confidence === "number" ? (
            <>
              We compared {alternatives.length + 1} paths against your stated
              priorities. The top option scored{" "}
              <strong className="text-text">{confidence}/100</strong>.
            </>
          ) : (
            <>
              This is a values-dominant question — the math surfaces the
              tradeoffs without picking a single &ldquo;best&rdquo; option.
            </>
          )}
          {alternatives.filter((a) => a.eliminatedAtStage === 2).length > 0 && (
            <>
              {" "}
              {alternatives.filter((a) => a.eliminatedAtStage === 2).length}{" "}
              path{alternatives.filter((a) => a.eliminatedAtStage === 2).length ===
              1
                ? ""
                : "s"}{" "}
              failed your hard constraints (so they were dropped before
              ranking).
            </>
          )}
        </p>

        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          {alternatives.length > 0 && (
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-mute">
                What we ruled out
              </p>
              <ul className="mt-2 space-y-2 text-[13.5px]">
                {alternatives.map((a, i) => (
                  <li key={i} className="text-mute">
                    <span className="font-medium text-text">{a.option}</span> —{" "}
                    {a.reason}
                    {a.eliminatedAtStage && (
                      <span> (stage {a.eliminatedAtStage})</span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {trace.length > 0 && (
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-mute">
                How we ranked
              </p>
              <pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap rounded-xl border border-line bg-paper p-3 font-mono text-[12px] leading-relaxed text-text">
                {JSON.stringify(
                  trace.map((s) => ({
                    stage: s.stage,
                    name: s.name ?? s.label ?? null,
                    output: s.output ?? s.detail ?? null,
                  })),
                  null,
                  2,
                )}
              </pre>
            </div>
          )}
        </div>
      </div>
    </details>
  );
}
