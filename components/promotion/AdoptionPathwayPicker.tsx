"use client";

// components/promotion/AdoptionPathwayPicker.tsx
//
// Renders only rungs with state !== "not-recommended".
// Engine-gated per .build-loop/memory/decision_engine_gated_promotion.md.
// No /app/builders. No generic "Build anything" CTA.
//
// Theme tokens only: var(--ink), var(--paper), var(--mute), var(--line), var(--ok).
// Zero per-pain Tailwind colors.

import type { AdoptionPathway, AdoptionPathwayRung } from "@/lib/engine/types";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";

// ---------------------------------------------------------------------------
// Rung kind metadata
// ---------------------------------------------------------------------------

const KIND_META: Record<
  AdoptionPathwayRung["kind"],
  { icon: string; label: string; description: string }
> = {
  prompt: {
    icon: "📋",
    label: "Save as prompt",
    description: "A paste-ready prompt for ChatGPT or Claude",
  },
  checklist: {
    icon: "✅",
    label: "Save as checklist",
    description: "A step-by-step checklist for recurring workflows",
  },
  skill: {
    icon: "🛠️",
    label: "Generate a skill",
    description: "An installable Claude Code skill",
  },
  plugin: {
    icon: "🧩",
    label: "Build a plugin",
    description: "A deployable plugin with external integrations",
  },
  agent: {
    icon: "🤖",
    label: "Build an agent",
    description: "An autonomous Claude agent for complex workflows",
  },
};

// Plain-language confidence label (text-only; no colored chip).
function confidenceText(confidence: number): string {
  if (confidence >= 80) return "strong fit";
  if (confidence >= 60) return "good fit";
  if (confidence >= 40) return "moderate fit";
  return "possible fit";
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface AdoptionPathwayPickerProps {
  adoptionPathway: AdoptionPathway;
  recommendationId: string;
  onPromote: (rung: AdoptionPathwayRung) => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function AdoptionPathwayPicker({
  adoptionPathway,
  recommendationId: _recommendationId,
  onPromote,
}: AdoptionPathwayPickerProps) {
  // Filter: render only rungs with state !== "not-recommended".
  const visibleRungs = adoptionPathway.filter(
    (rung) => rung.state !== "not-recommended",
  );

  if (visibleRungs.length === 0) {
    return (
      <Card className="py-8 text-center">
        <p className="text-[14px] font-medium" style={{ color: "var(--ink)" }}>
          No adoption rungs available yet
        </p>
        <p
          className="mt-1 text-[13px] leading-relaxed"
          style={{ color: "var(--mute)" }}
        >
          The recommendation engine didn&apos;t surface a clear adoption path
          for this task. Re-run with more context or try a different task.
        </p>
      </Card>
    );
  }

  return (
    <section aria-label="Adoption pathway">
      <p
        className="mb-3 text-[11px] font-semibold uppercase tracking-[0.12em]"
        style={{ color: "var(--mute)" }}
      >
        YOUR NEXT STEP
      </p>
      <div className="flex flex-col gap-3">
        {visibleRungs.map((rung) => {
          const meta = KIND_META[rung.kind];
          const isRecommended = rung.state === "recommended";

          return (
            <article
              key={rung.kind}
              className="flex flex-col gap-3 rounded-xl border p-4 sm:flex-row sm:items-start sm:justify-between sm:gap-4"
              style={{
                borderColor: isRecommended ? "var(--ink)" : "var(--line)",
                backgroundColor: "var(--paper)",
              }}
            >
              {/* Left: icon + labels + rationale */}
              <div className="flex min-w-0 flex-1 gap-3">
                <span
                  aria-hidden
                  className="mt-0.5 shrink-0 text-[20px] leading-none"
                >
                  {meta.icon}
                </span>
                <div className="min-w-0">
                  {/* Rung label + state badge */}
                  <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                    <p
                      className="text-[15px] font-semibold leading-snug"
                      style={{ color: "var(--ink)" }}
                    >
                      {rung.label || meta.label}
                    </p>
                    {isRecommended && (
                      <span
                        className="text-[11px] font-medium uppercase tracking-[0.1em]"
                        style={{ color: "var(--ok)" }}
                      >
                        recommended
                      </span>
                    )}
                  </div>

                  {/* Rung type description */}
                  <p
                    className="mt-0.5 text-[12px]"
                    style={{ color: "var(--mute)" }}
                  >
                    {meta.description}
                  </p>

                  {/* Engine rationale */}
                  <p
                    className="mt-1.5 text-[13.5px] leading-relaxed"
                    style={{ color: "var(--ink)" }}
                  >
                    {rung.rationale}
                  </p>

                  {/* Confidence indicator — text only, no colored badge */}
                  <p
                    className="mt-1 text-[12px]"
                    style={{ color: "var(--mute)" }}
                  >
                    {confidenceText(rung.confidence)} · {rung.confidence}%
                    confidence
                  </p>
                </div>
              </div>

              {/* Right: CTA */}
              <div className="shrink-0 sm:self-start">
                <Button
                  variant={isRecommended ? "primary" : "secondary"}
                  onClick={() => onPromote(rung)}
                  aria-label={`${meta.label} for this task`}
                >
                  {meta.label} →
                </Button>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
