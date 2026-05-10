// Stack-specific recommendation renderer (v2 AI-leverage finder).
//
// Pyramid order per UX research digest §3 (Minto):
//   1. HEADLINE — the literal answer ("Deploy this stack…")
//   2. WHY — 2-3 sentence rationale (NOT methodology)
//   3. METRICS — total hr/wk freed + cost + setup days
//   4. STACK — single outer container with internal dividers (Gestalt §1
//      "common region"); top item gets visual primacy (subtle accent border);
//      remaining items expand inline.
//   5. ROBUST ALTERNATIVE — "Start small? Try just one first."
//   6. SECONDARY (hiring panel) — only AFTER tools are shown, per user
//      direction (PRIMARY = AI saves time; SECONDARY = hire/cap/raise).
//   7. CONSIDERED — alternatives that didn't make the stack (collapsed)
//   8. METHOD — "How was this decided?" (deepest disclosure layer)
//
// Per UX research §1 (Gestalt) + §2 (Cowan 4±1): present 2-4 items, never
// 12. The orchestrator already caps the stack at 4. The "considered"
// alternatives are collapsed by default — visible cardinality drives
// perceived complexity.
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
  title: string;
  savedHrs: number;
  monthlyCost: number;
  setupDays: number;
  description: string;
  playbookSteps: string[];
  pluginUrl?: string;
  promptText?: string;
  needsBaa: boolean;
  isHumanHelp: boolean; // VA / hire — secondary tier per user direction
}

export function StackRecommendationView({ decision, shareToken, publicView }: Props) {
  const [openToolIdx, setOpenToolIdx] = useState<number | null>(0);
  const [showWork, setShowWork] = useState(false);
  const [showHire, setShowHire] = useState(false);
  const [copyState, setCopyState] = useState<{ id?: string; ok?: boolean }>({});

  // Build per-tool cards from the workloadReducers (each one is a stack tool
  // hydrated by the AI-leverage orchestrator).
  const allTools: ToolCard[] = decision.workloadReducers.map((r) => {
    const desc = r.description ?? "";
    const savedHrsMatch = desc.match(/Saves\s+~([\d.]+)\s+hr\/wk/i);
    const monthlyMatch = desc.match(/~\$([\d,]+)\/mo/i);
    const setupMatch = desc.match(/(\d+)\s+days? to set up/i);
    const titleClean = r.title.replace(/^Deploy\s+/i, "");
    return {
      title: titleClean,
      savedHrs: savedHrsMatch ? Number(savedHrsMatch[1]) : 0,
      monthlyCost: monthlyMatch ? Number(monthlyMatch[1]!.replace(/,/g, "")) : 0,
      setupDays: setupMatch ? Number(setupMatch[1]) : 0,
      description: desc.split(".").slice(1).join(".").trim() || desc,
      playbookSteps: r.artifact?.playbookSteps ?? [],
      pluginUrl: r.artifact?.pluginUrl,
      promptText: r.artifact?.promptText,
      needsBaa: /BAA|baa/.test(desc),
      // Per user direction: human-help (VA / hiring) is SECONDARY — surface it
      // below the AI tools, behind a separate "Now consider hiring" panel.
      isHumanHelp:
        /VA service|virtual assistant|HelloRache|MEDVA|Hello Mira|in-house|hire/i.test(
          titleClean,
        ) ||
        r.automationLevel === "user_executes" && /hire|VA|virtual/i.test(titleClean),
    };
  });

  const aiTools = allTools.filter((t) => !t.isHumanHelp);
  const humanTools = allTools.filter((t) => t.isHumanHelp);

  const totalSaved = aiTools.reduce((s, t) => s + t.savedHrs, 0);
  const totalCost = aiTools.reduce((s, t) => s + t.monthlyCost, 0);
  const maxSetupDays = aiTools.reduce((m, t) => Math.max(m, t.setupDays), 0);

  // Confidence — calm, no shouting. Capped at 95 by the orchestrator.
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
  const confLabel =
    tier === "high" ? "Strong match" : tier === "mid" ? "Moderate match" : "Partial match";

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
      {/* 1. HEADLINE + 2. WHY (the answer, in the first sentence — Minto §3) */}
      <section>
        <h1 className="text-2xl sm:text-3xl font-semibold leading-tight tracking-tight text-ink">
          Deploy this stack to free ~{totalSaved.toFixed(0)} hours per week.
        </h1>
        <p className="mt-3 text-ink-subtle leading-relaxed text-base">
          {decision.recommendation.rationale}
        </p>
      </section>

      {/* 3. METRICS — three calm numbers, content > chrome */}
      <section className="rounded-2xl border border-border bg-canvas-raised p-5 sm:p-6">
        <div className="grid grid-cols-3 gap-3 sm:gap-6">
          <Metric label="Hours / week" value={`${totalSaved.toFixed(0)}`} sub="freed" tone="positive" />
          <Metric label="Monthly cost" value={`$${totalCost.toFixed(0)}`} sub="all tools" tone="neutral" />
          <Metric label="Setup" value={`${maxSetupDays}`} sub="days max" tone="neutral" />
        </div>
        <div className={cn("mt-4 inline-flex items-center gap-2 text-sm font-medium", confColor)}>
          <span className={cn("h-2 w-2 rounded-full", confDot)} aria-hidden="true" />
          {confLabel} · covers ~{conf}% of your stated time
        </div>
      </section>

      {/* 4. STACK — single outer container, internal dividers (Gestalt §1) */}
      {aiTools.length > 0 && (
        <section
          className="rounded-2xl border border-border bg-canvas-raised overflow-hidden divide-y divide-border"
          aria-label="Recommended AI tools"
        >
          {aiTools.map((t, i) => {
            const isOpen = openToolIdx === i;
            const isTop = i === 0;
            return (
              <div
                key={i}
                className={cn(
                  "transition-colors",
                  isTop && "bg-accent-soft/40", // subtle primacy for top pick (Gestalt §1)
                )}
              >
                <button
                  type="button"
                  onClick={() => setOpenToolIdx(isOpen ? null : i)}
                  className="w-full text-left px-5 sm:px-6 py-4 flex items-center justify-between gap-3 min-h-[64px] hover:bg-canvas-sunken focus:outline-none focus:bg-canvas-sunken"
                  aria-expanded={isOpen}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-2 flex-wrap">
                      {isTop && (
                        <span className="text-xs uppercase tracking-wide font-semibold text-accent">
                          Recommended
                        </span>
                      )}
                      <div className="text-base sm:text-lg font-semibold text-ink truncate">
                        {t.title}
                      </div>
                    </div>
                    <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-ink-muted">
                      {t.savedHrs > 0 && (
                        <span className="text-confidence-high font-medium">
                          ~{t.savedHrs.toFixed(0)} hr/wk freed
                        </span>
                      )}
                      {t.monthlyCost > 0 && <span>~${t.monthlyCost.toFixed(0)}/mo</span>}
                      {t.setupDays > 0 && <span>{t.setupDays}d setup</span>}
                      {t.needsBaa && <span className="text-ink-subtle">Needs BAA</span>}
                    </div>
                  </div>
                  <span aria-hidden="true" className="text-ink-muted text-sm">
                    {isOpen ? "▲" : "▼"}
                  </span>
                </button>

                {isOpen && (
                  <div className="px-5 sm:px-6 pb-5 sm:pb-6">
                    {t.description && (
                      <p className="text-sm text-ink-subtle leading-relaxed">{t.description}</p>
                    )}

                    {t.playbookSteps.length > 0 && (
                      <>
                        <h4 className="mt-5 text-xs uppercase tracking-wide text-ink-muted font-semibold">
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
                          className="inline-flex items-center px-3 py-2 rounded-lg border border-border-strong text-sm text-accent hover:bg-accent-soft min-h-[40px]"
                        >
                          Open {new URL(t.pluginUrl).host} ↗
                        </a>
                      </div>
                    )}

                    {t.promptText && (
                      <div className="mt-5">
                        <h4 className="text-xs uppercase tracking-wide text-ink-muted font-semibold">
                          Paste-ready prompt
                        </h4>
                        <pre className="mt-2 rounded-lg bg-canvas-sunken border border-border p-3 text-xs leading-relaxed whitespace-pre-wrap text-ink max-h-48 overflow-auto">
                          {t.promptText}
                        </pre>
                        <button
                          type="button"
                          onClick={() => copy(t.promptText!, `prompt-${i}`)}
                          className="mt-2 inline-flex items-center px-3 py-2 rounded-lg border border-border-strong text-sm text-ink hover:bg-canvas-sunken min-h-[40px]"
                        >
                          {copyState.id === `prompt-${i}` && copyState.ok ? "Copied ✓" : "Copy this text"}
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </section>
      )}

      {/* 5. ROBUST ALTERNATIVE — start small */}
      {decision.robustAlternative.option !== "No clearly different fallback" && (
        <section className="rounded-2xl border border-peach/30 bg-peach-soft p-5">
          <h3 className="text-base font-semibold text-peach">Start small? Try just one.</h3>
          <div className="mt-2 text-sm font-medium text-ink">{decision.robustAlternative.option}</div>
          <p className="mt-2 text-sm text-ink-subtle leading-relaxed">{decision.robustAlternative.why}</p>
        </section>
      )}

      {/* 6. SECONDARY — "Now consider hiring" panel (DOWNSTREAM of AI tools) */}
      {humanTools.length > 0 && (
        <section className="rounded-2xl border border-border bg-canvas-raised">
          <button
            type="button"
            onClick={() => setShowHire((s) => !s)}
            className="w-full text-left px-5 sm:px-6 py-4 flex items-center justify-between gap-3 min-h-[60px] hover:bg-canvas-sunken focus:outline-none"
            aria-expanded={showHire}
          >
            <div>
              <h3 className="text-base font-semibold text-ink">After AI, still need help?</h3>
              <p className="mt-1 text-sm text-ink-muted">
                If you've automated everything you can and STILL need 8+ more hours, here's the human-help option.
              </p>
            </div>
            <span aria-hidden="true" className="text-ink-muted">
              {showHire ? "▲" : "▼"}
            </span>
          </button>
          {showHire && (
            <div className="px-5 sm:px-6 pb-5 sm:pb-6 border-t border-border pt-4 space-y-4">
              {humanTools.map((t, i) => (
                <div key={i}>
                  <div className="text-base font-semibold text-ink">{t.title}</div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-ink-muted">
                    {t.savedHrs > 0 && <span className="text-confidence-high font-medium">~{t.savedHrs.toFixed(0)} hr/wk freed</span>}
                    {t.monthlyCost > 0 && <span>~${t.monthlyCost.toFixed(0)}/mo</span>}
                    {t.setupDays > 0 && <span>{t.setupDays}d setup</span>}
                    {t.needsBaa && <span>Needs BAA</span>}
                  </div>
                  {t.description && (
                    <p className="mt-2 text-sm text-ink-subtle leading-relaxed">{t.description}</p>
                  )}
                  {t.playbookSteps.length > 0 && (
                    <ol className="mt-2 space-y-1 text-sm text-ink-subtle list-decimal list-inside">
                      {t.playbookSteps.map((s, j) => (
                        <li key={j} className="leading-relaxed">{s}</li>
                      ))}
                    </ol>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* 7. CONSIDERED — collapsed by default */}
      <details className="rounded-2xl border border-border bg-canvas-raised group">
        <summary className="cursor-pointer list-none px-5 sm:px-6 py-4 flex items-center justify-between min-h-[60px] hover:bg-canvas-sunken">
          <h3 className="text-base font-semibold text-ink">Other tools we considered</h3>
          <span className="text-sm text-ink-muted group-open:hidden">
            Show {decision.alternatives.length}
          </span>
          <span className="text-sm text-ink-muted hidden group-open:inline">Hide</span>
        </summary>
        <ul className="px-5 sm:px-6 pb-5 sm:pb-6 divide-y divide-border border-t border-border">
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

      {/* 8. METHOD — deepest disclosure */}
      <section className="no-print">
        <button
          type="button"
          onClick={() => setShowWork((s) => !s)}
          className="text-sm text-accent underline underline-offset-2 min-h-[24px] hover:text-accent-ink"
          aria-expanded={showWork}
        >
          {showWork ? "Hide reasoning" : "How was this decided?"}
        </button>
        {showWork && (
          <div className="mt-3 rounded-xl border border-border bg-canvas-raised p-5">
            <ol className="space-y-2.5 text-sm text-ink-subtle">
              <li className="flex gap-3"><span className="text-ink-muted text-xs mt-0.5">1.</span><span>Listed the tools we maintain (12 in the catalog).</span></li>
              <li className="flex gap-3"><span className="text-ink-muted text-xs mt-0.5">2.</span><span>Removed any that don't fit your specialty, your budget, or your willingness to sign Business Associate Agreements.</span></li>
              <li className="flex gap-3"><span className="text-ink-muted text-xs mt-0.5">3.</span><span>Scored each survivor by hours-saved-where-you-actually-spend-time, minus setup days and cost.</span></li>
              <li className="flex gap-3"><span className="text-ink-muted text-xs mt-0.5">4.</span><span>Picked the top 2–4 that together fit your budget and cover distinct workflow areas (no two clinical-notes tools, etc.).</span></li>
              <li className="flex gap-3"><span className="text-ink-muted text-xs mt-0.5">5.</span><span>Wrote the rationale and assembled this page.</span></li>
            </ol>
          </div>
        )}
      </section>

      {/* Sticky actions — thumb zone on mobile, primary right of secondary on desktop */}
      {!publicView && (
        <div className="sticky bottom-0 left-0 right-0 -mx-4 sm:-mx-6 px-4 sm:px-6 py-3 bg-canvas-raised/95 backdrop-blur border-t border-border flex flex-wrap items-center gap-2 no-print">
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center justify-center px-4 py-3 rounded-xl bg-accent text-white font-medium min-h-[48px] hover:bg-accent-ink"
          >
            Print / Save as PDF
          </button>
          {shareToken && (
            <button
              type="button"
              onClick={() => copy(`${window.location.origin}/share/${shareToken}`, "share")}
              className="inline-flex items-center justify-center px-4 py-3 rounded-xl border border-border-strong text-ink min-h-[48px] hover:bg-canvas-sunken"
            >
              {copyState.id === "share" && copyState.ok ? "Link copied ✓" : "Copy share link"}
            </button>
          )}
          <a
            href="/app/chat"
            className="inline-flex items-center justify-center px-4 py-3 rounded-xl border border-border-strong text-ink min-h-[48px] hover:bg-canvas-sunken ml-auto"
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
    <div className="text-center">
      <div className="text-xs text-ink-muted uppercase tracking-wide font-medium">{label}</div>
      <div
        className={cn(
          "mt-1 text-3xl sm:text-4xl font-bold tabular-nums leading-none tracking-tight",
          tone === "positive" ? "text-confidence-high" : "text-ink",
        )}
      >
        {value}
      </div>
      <div className="text-xs text-ink-muted mt-1">{sub}</div>
    </div>
  );
}
