// PRD §6.2 Stage 7 (F-09) — Scaffold generation.
//
// Deterministic, no LLM call. Fires only when at least one reducer is
// classified "skill" or "plugin" by Stage 6. Attaches each generated
// scaffold to the reducer it was generated from (additive — original
// reducer fields preserved).

import "server-only";
import type { WorkloadReducer } from "@/shared/schema";
import { generateScaffold } from "@/lib/scaffold-generator";

export interface Stage7Output {
  reducers: WorkloadReducer[];
  /** Number of reducers that got a non-null scaffold. */
  generatedCount: number;
}

export function runStage7Scaffold(reducers: WorkloadReducer[]): Stage7Output {
  let generatedCount = 0;
  const out: WorkloadReducer[] = reducers.map((r) => {
    const scaffold = generateScaffold(r);
    if (scaffold === null) return r;
    generatedCount += 1;
    return { ...r, scaffold };
  });
  return { reducers: out, generatedCount };
}
