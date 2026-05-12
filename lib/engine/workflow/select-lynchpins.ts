// lib/engine/workflow/select-lynchpins.ts
//
// Deterministic post-process: select the top 1–3 lynchpin steps.
//
// Sorts scored steps by lynchpinScore desc. Top 1–3 with
// lynchpinScore >= 0.3 get isLynchpin = true. Cap at 3.
// Returns a new array — does NOT mutate input.

import type { ActivityStep } from "@/lib/engine/types";

// ---------------------------------------------------------------------------
// Output contract
// ---------------------------------------------------------------------------

export interface SelectResult {
  steps: ActivityStep[];
  startHereStepIds: string[];
  rationale: string;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Pure function. Selects top 1–3 steps by lynchpinScore (threshold ≥ 0.3)
 * and sets isLynchpin = true on those steps.
 *
 * Returns a new array of steps (no mutation), the list of lynchpin step IDs,
 * and a one-sentence rationale per lynchpin joined together.
 */
export function selectLynchpins(steps: ActivityStep[]): SelectResult {
  if (steps.length === 0) {
    return { steps: [], startHereStepIds: [], rationale: "" };
  }

  // Sort by lynchpinScore descending (copy to avoid mutating input).
  const ranked = [...steps].sort((a, b) => b.lynchpinScore - a.lynchpinScore);

  // Candidate lynchpins: score >= 0.3, cap at 3.
  const candidates = ranked.filter((s) => s.lynchpinScore >= 0.3).slice(0, 3);
  const lynchpinIds = new Set(candidates.map((s) => s.id));

  // Build rationale sentences per lynchpin.
  const rationaleLines = candidates.map((s) => {
    const pain = s.userPain;
    const impact = s.systemImpact;
    const rung = s.aiRung === "none" ? "manual" : s.aiRung;
    return `"${s.title}" combines pain ${pain}/5 with downstream impact ${impact}/5 at the ${rung} rung.`;
  });

  const rationale =
    rationaleLines.length > 0
      ? rationaleLines.join(" ")
      : "No steps met the lynchpin threshold (score ≥ 0.3).";

  // Rebuild steps with isLynchpin flipped where appropriate.
  const markedSteps = steps.map((s) => ({
    ...s,
    isLynchpin: lynchpinIds.has(s.id),
  }));

  return {
    steps: markedSteps,
    startHereStepIds: candidates.map((s) => s.id),
    rationale,
  };
}
