// Stack-specific recommendation renderer (v2 AI-leverage finder).
//
// The generic RecommendationView treats `recommendation.option` as a single
// string + the rest as supporting cards. For the AI-leverage flow, the
// recommendation IS a stack of 2-4 tools — each with its own hr/wk saved,
// cost, setup days, and playbook. This view surfaces that structure directly:
//
//   Hero        — total hr/wk saved + total monthly cost + max setup days
//   Per-tool    — one expandable card per tool in the stack with playbook
//   Math        — visible "you said X, this tool typically Y, capped at Z"
//   Considered  — the ranked alternatives that didn't make the stack
//   Start small — robust alternative (single tool to deploy first)
//
// Renders only when `decision.recommendation.option` starts with
// "Deploy this stack:" — the page handler routes accordingly.

"use client";

import { useState } from "react";
import type { DecisionOutput } from "@/shared/schema";
import { cn } from "@/lib/cn";

interface Props {
  decision: DecisionOutput;
  shareToken?: string | null;
  publicView?: boolean;
}

interface ToolCard {
  title: string;          // tool name
  savedHrs: number;       // estimated hr/wk freed
  monthlyCost: number;    // average $/mo
  setupDays: number;      // typical days to deploy
  description: string;    // short summary + warnings
  playbookSteps: string[];
  pluginUrl?: string;
  promptText?: string;
  needsBaa: boolean;      // surfaced as a calm chip on the card
}

export function StackRecommendationView({ decision, shareToken, publicView }: Props) {
  const [openToolIdx, setOpenToolIdx] = useState<number | null>(0);
  const [showWork, setShowWork] = useState(false);
  const [copyState, setCopyState] = useState<{ id?: string; ok?: boolean }>({});

  // Build per-tool cards from the workloadReducers (each one is a stack tool
  // hydrated by the AI-leverage orchestrator).
  const tools: ToolCard[] = decision.workloadReducers.map((r) => {
    const desc = r.description ?? "";
    const savedHrsMatch = desc.match(/Saves\s+~([\d.]+)\s+hr\/wk/i);
    const monthlyMatch = desc.match(/~\$([\d,]+)\/mo/i);
    const setupMatch = desc.match(/(\d+)\s+days? to set up/i);
    return {
      title: r.title.replace(/^Deploy\s+/i, ""),
      savedHrs: savedHrsMatch ? Number(savedHrsMatch[1]) : 0,
      monthlyCost: monthlyMatch ? Number(monthlyMatch[1]!.replace(/,/g, "")) : 0,
      setupDays: setupMatch ? Number(setupMatch[1]) : 0,
      description: desc.split(".").slice(1).join(".").trim() || desc,
      playbookSteps: r.artifact?.playbookSteps ?? [],
      pluginUrl: r.artifact?.pluginUrl,
      promptText: r.artifact?.promptText,
      needsBaa: /BAA|baa/.test(desc),
    };
  });

  const totalSaved = tools.reduce((s, t) => s + t.savedHrs, 0);
  const totalCost = tools.reduce((s, t) => s + t.monthlyCost, 0);
  const maxSetupDays = tools.reduce((m, t) => Math.max(m, t.setupDays), 0);

  // The orchestrator caps confidence at 95; render the badge calmly.
  const conf = decision.recommendation.confidence;
  const tier: "high" | "mid" | "low" = conf >= 75 ? "high" : conf >= 50 ? "mid" : "low";
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
  const confLabel = tier === "high" ? "High match" : tier === "mid" ? "Moderate match" : "Partial match";

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
      {/* HERO — total hours + total cost + setup days */}
      <section className="rounded-2xl border border-slate-200 bg-canvas-raised p-5 sm:p-6">
        <h1 className="text-2xl font-semibold leading-tight">Deploy this stack</h1>
        <p className="mt-2 text-ink-subtle text-sm leading-relaxed">{decision.recommendation.rationale}</p>

        <div className="mt-5 grid grid-cols-3 gap-3">
          <Metric label="Hours / week" value={`${totalSaved.toFixed(0)}`} sub="freed" tone="positive" />
          <Metric label="Monthly cost" value={`$${totalCost.toFixed(0)}`} sub="all tools" tone="neutral" />
          <Metric label="Setup" value={`${maxSetupDays}`} sub="days max" tone="neutral" />
        </div>

        <div className={cn("mt-4 inline-flex items-center gap-2 text-sm font-medium", confColor)}>
          <span className={cn("h-2 w-2 rounded-full", confDot)} aria-hidden="true" />
          {confLabel} · covers ~{conf}% of your stated time
        </div>
      </section>

      {/* PER-TOOL CARDS */}
      {tools.map((t, i) => {
        const isOpen = openToolIdx === i;
        return (
          <section
            key={i}
            className="rounded-2xl border border-slate-200 bg-canvas-raised overflow-hidden"
          >
            <button
              type="button"
              onClick={() => setOpenToolIdx(isOpen ? null : i)}
              className="w-full text-left p-5 flex items-center justify-between gap-3 min-h-[60px] hover:bg-slate-50"
              aria-expanded={isOpen}
            >
              <div className="flex-1 min-w-0">
                <div className="text-base font-semibold text-ink truncate">{t.title}</div>
                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-muted">
                  {t.savedHrs > 0 && (
                    <span className="text-confidence-high font-medium">~{t.savedHrs.toFixed(0)} hr/wk freed</span>
                  )}
                  {t.monthlyCost > 0 && <span>~${t.monthlyCost.toFixed(0)}/mo</span>}
                  {t.setupDays > 0 && <span>{t.setupDays}d setup</span>}
                  {t.needsBaa && (
                    <span className="text-ink-subtle">Needs BAA</span>
                  )}
                </div>
              </div>
              <span aria-hidden="true" className="text-ink-muted">
                {isOpen ? "▲" : "▼"}
              </span>
            </button>

            {isOpen && (
              <div className="px-5 pb-5 border-t border-slate-200 pt-4">
                {t.description && (
                  <p className="text-sm text-ink-subtle leading-relaxed">{t.description}</p>
                )}

                {t.playbookSteps.length > 0 && (
                  <>
                    <h4 className="mt-4 text-xs uppercase tracking-wide text-ink-muted font-medium">
                      Setup steps
                    </h4>
                    <ol className="mt-2 space-y-2 text-sm text-ink list-decimal list-inside">
                      {t.playbookSteps.map((s, j) => (
                        <li key={j} className="leading-relaxed">{s}</li>
                      ))}
                    </ol>
                  </>
                )}

                {t.pluginUrl && (
                  <div className="mt-4">
                    <a
                      href={t.pluginUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center px-3 py-2 rounded-lg border border-slate-300 text-sm text-ink min-h-[40px]"
                    >
                      Open {new URL(t.pluginUrl).host} ↗
                    </a>
                  </div>
                )}

                {t.promptText && (
                  <div className="mt-4">
                    <h4 className="text-xs uppercase tracking-wide text-ink-muted font-medium">
                      Paste-ready prompt
                    </h4>
                    <pre className="mt-2 rounded-lg bg-slate-50 border border-slate-200 p-3 text-xs leading-relaxed whitespace-pre-wrap text-ink max-h-48 overflow-auto">
                      {t.promptText}
                    </pre>
                    <button
                      type="button"
                      onClick={() => copy(t.promptText!, `prompt-${i}`)}
                      className="mt-2 inline-flex items-center px-3 py-2 rounded-lg border border-slate-300 text-sm text-ink min-h-[40px]"
                    >
                      {copyState.id === `prompt-${i}` && copyState.ok ? "Copied ✓" : "Copy this text"}
                    </button>
                  </div>
                )}
              </div>
            )}
          </section>
        );
      })}

      {/* Robust alternative — start small */}
      {decision.robustAlternative.option !== "No clearly different fallback" && (
        <section className="rounded-2xl border border-slate-200 bg-canvas-raised p-5">
          <h3 className="text-base font-semibold">Start small? Try just one first.</h3>
          <div className="mt-2 text-sm font-medium text-ink">{decision.robustAlternative.option}</div>
          <p className="mt-2 text-sm text-ink-subtle leading-relaxed">{decision.robustAlternative.why}</p>
        </section>
      )}

      {/* Other tools considered */}
      <details className="rounded-2xl border border-slate-200 bg-canvas-raised p-5 group">
        <summary className="cursor-pointer list-none flex items-center justify-between min-h-[44px]">
          <h3 className="text-base font-semibold">Other tools we considered</h3>
          <span className="text-xs text-ink-muted group-open:hidden">
            Show {decision.alternatives.length}
          </span>
          <span className="text-xs text-ink-muted hidden group-open:inline">Hide</span>
        </summary>
        <ul className="mt-3 divide-y divide-slate-200">
          {decision.alternatives.map((a, i) => (
            <li key={i} className="py-3">
              <div className="text-sm font-medium text-ink">{a.option}</div>
              <div className="mt-1 text-sm text-ink-subtle">
                <span className="text-ink-muted">Why this didn't make the stack: </span>
                {a.reason}
              </div>
            </li>
          ))}
        </ul>
      </details>

      {/* How was this decided? */}
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
          <div className="mt-3 rounded-xl border border-slate-200 bg-canvas-raised p-4">
            <ol className="space-y-2 text-sm text-ink-subtle">
              <li className="flex gap-3"><span className="text-ink-muted text-xs mt-0.5">1.</span><span>Listed the tools we maintain (12 in the catalog).</span></li>
              <li className="flex gap-3"><span className="text-ink-muted text-xs mt-0.5">2.</span><span>Removed any that don't fit your specialty, your budget, or your willingness to sign Business Associate Agreements.</span></li>
              <li className="flex gap-3"><span className="text-ink-muted text-xs mt-0.5">3.</span><span>Scored each survivor by hours-saved-where-you-actually-spend-time, minus setup days and cost.</span></li>
              <li className="flex gap-3"><span className="text-ink-muted text-xs mt-0.5">4.</span><span>Picked the top 2–4 that together fit your budget and cover distinct workflow areas (no two clinical-notes tools, etc.).</span></li>
              <li className="flex gap-3"><span className="text-ink-muted text-xs mt-0.5">5.</span><span>Wrote the rationale and assembled this page.</span></li>
            </ol>
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
          <a
            href="/app/chat"
            className="inline-flex items-center justify-center px-4 py-3 rounded-xl border border-slate-300 text-ink min-h-[48px] ml-auto"
          >
            New audit
          </a>
        </div>
      )}
    </div>
  );
}

function Metric({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub: string;
  tone: "positive" | "neutral";
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-canvas-raised/50 p-3 text-center">
      <div className="text-xs text-ink-muted uppercase tracking-wide">{label}</div>
      <div
        className={cn(
          "mt-1 text-2xl font-semibold tabular-nums leading-none",
          tone === "positive" ? "text-confidence-high" : "text-ink",
        )}
      >
        {value}
      </div>
      <div className="text-xs text-ink-muted mt-1">{sub}</div>
    </div>
  );
}
