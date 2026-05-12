// lib/engine/workflow/horizons.ts
//
// Deterministic horizon builder.
//
// Always returns exactly 3 entries (this week / this quarter / this year)
// based on the AI rung assigned to each step.
//
// Assignment rules (from spec):
//   "this week"    — lynchpin steps with aiRung === "prompt"
//   "this quarter" — steps with aiRung ∈ { "skill", "plugin" }
//   "this year"    — steps with aiRung === "agent" OR origin === "new"

import type { ActivityStep, WorkflowRecommendation } from "@/lib/engine/types";

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Pure function. Derives the three-horizon strip from the scored+marked steps.
 * Always returns exactly 3 entries in order: this week, this quarter, this year.
 */
export function buildHorizons(
  steps: ActivityStep[],
): WorkflowRecommendation["horizon"] {
  // --- this week: lynchpin prompts ---
  const thisWeekSteps = steps.filter(
    (s) => s.isLynchpin && s.aiRung === "prompt",
  );
  // Fallback: if no lynchpin prompts, include any prompt-rung step.
  const thisWeekFallback = thisWeekSteps.length > 0
    ? thisWeekSteps
    : steps.filter((s) => s.aiRung === "prompt");

  const thisWeekUpliftedIds = thisWeekFallback.map((s) => s.id);
  const thisWeekNewIds = thisWeekFallback
    .filter((s) => s.origin === "new")
    .map((s) => s.id);

  // --- this quarter: skill + plugin rung steps ---
  const thisQuarterSteps = steps.filter(
    (s) => s.aiRung === "skill" || s.aiRung === "plugin",
  );
  const thisQuarterUpliftedIds = thisQuarterSteps.map((s) => s.id);
  const thisQuarterNewIds = thisQuarterSteps
    .filter((s) => s.origin === "new")
    .map((s) => s.id);

  // --- this year: agent rung OR new-origin steps ---
  const thisYearSteps = steps.filter(
    (s) => s.aiRung === "agent" || s.origin === "new",
  );
  // Deduplicate — a step can be "new" AND "agent".
  const thisYearIds = [...new Set(thisYearSteps.map((s) => s.id))];
  const thisYearUpliftedIds = thisYearSteps
    .filter((s) => s.aiRung === "agent")
    .map((s) => s.id);
  const thisYearNewIds = thisYearSteps
    .filter((s) => s.origin === "new")
    .map((s) => s.id);
  // Union for upliftedStepIds (agent rung wins the slot).
  const deduped = [...new Set([...thisYearUpliftedIds, ...thisYearIds])];

  return [
    {
      label: "this week",
      description:
        "Start with paste-ready prompts on the highest-pain tasks.",
      upliftedStepIds: thisWeekUpliftedIds,
      newStepIds: thisWeekNewIds,
    },
    {
      label: "this quarter",
      description:
        "Promote winning prompts into reusable skills; install matching plugins.",
      upliftedStepIds: thisQuarterUpliftedIds,
      newStepIds: thisQuarterNewIds,
    },
    {
      label: "this year",
      description:
        "Agentic automation takes over the high-volume / high-impact branches.",
      upliftedStepIds: deduped,
      newStepIds: thisYearNewIds,
    },
  ];
}
