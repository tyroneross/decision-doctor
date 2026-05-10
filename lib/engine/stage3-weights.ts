import type { Stage2Constraints, Stage3Weights } from "./types";

function roundWeight(value: number): number {
  return Math.round(value * 1000) / 1000;
}

export async function runStage3Weights(
  constraints: Stage2Constraints,
): Promise<Stage3Weights> {
  const rawWeights = constraints.values.template.criteria.map((criterion) => {
    const adjustment =
      criterion.weightAdjustment?.(constraints.values.fields) ?? 0;

    return {
      criterionId: criterion.id,
      baseWeight: criterion.baseWeight,
      adjustment,
      rawWeight: Math.max(0.01, criterion.baseWeight + adjustment),
    };
  });

  const total = rawWeights.reduce((sum, item) => sum + item.rawWeight, 0);
  const weights = Object.fromEntries(
    rawWeights.map((item) => [
      item.criterionId,
      roundWeight(item.rawWeight / total),
    ]),
  );

  return {
    constraints,
    weights,
    adjustments: rawWeights.map((item) => ({
      criterionId: item.criterionId,
      baseWeight: item.baseWeight,
      adjustment: item.adjustment,
      normalizedWeight: weights[item.criterionId] ?? 0,
    })),
  };
}
