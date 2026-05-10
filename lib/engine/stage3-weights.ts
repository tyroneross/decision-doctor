// PRD §6.2 Stage 3 — Weights (criteria importance).
// Deterministic. Takes Stage 1's adjusted weights and produces the final
// weight vector used by Stage 4 (outranking) and Stage 5 (TOPSIS).
//
// Currently a thin pass-through that documents the contract. A future Railway
// sidecar could replace this with a PAPRIKA / TTM / BOED elicitation call.

import type { DecisionTemplate } from "@/lib/engine/types";

export interface Stage3Output {
  weights: Record<string, number>;
  notes: string;
}

export function runStage3Weights(
  template: DecisionTemplate,
  adjustedWeights: Record<string, number>,
): Stage3Output {
  // Sanity: ensure every template criterion has a weight; fill from defaults
  // if Stage 1 dropped one.
  const out: Record<string, number> = {};
  for (const c of template.criteria) {
    out[c.id] = adjustedWeights[c.id] ?? c.defaultWeight;
  }
  // Renormalize.
  const sum = Object.values(out).reduce((a, b) => a + b, 0) || 1;
  for (const id of Object.keys(out)) out[id] = out[id]! / sum;

  return {
    weights: out,
    notes: `Weights normalized across ${template.criteria.length} criteria.`,
  };
}
