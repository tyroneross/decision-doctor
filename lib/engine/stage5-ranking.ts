import type {
  EliminatedCandidate,
  RankedCandidate,
  Stage4Outranking,
  Stage5Ranking,
} from "./types";

function computeConfidence(ranked: RankedCandidate[]): number {
  const first = ranked[0];
  const second = ranked[1];
  if (!first || !second) return 60;

  const margin = Math.max(0, first.closeness - second.closeness);
  return Math.max(50, Math.min(96, Math.round(55 + margin * 1.8)));
}

function ensureTwoAlternatives(
  recommendation: RankedCandidate,
  alternatives: EliminatedCandidate[],
  rankedCandidates: RankedCandidate[],
): EliminatedCandidate[] {
  const expanded = [...alternatives];

  rankedCandidates
    .filter((candidate) => candidate.id !== recommendation.id)
    .forEach((candidate) => {
      if (expanded.length >= 2) return;
      if (expanded.some((item) => item.id === candidate.id)) return;

      expanded.push({
        id: candidate.id,
        option: candidate.option,
        eliminatedAtStage: 4,
        weightedScore: candidate.weightedScore,
        reason: `${recommendation.option} ranked higher on the final weighted score while this remains a fallback scenario.`,
      });
    });

  return expanded;
}

export async function runStage5Ranking(
  outranking: Stage4Outranking,
): Promise<Stage5Ranking> {
  const ranked =
    outranking.finalists.length > 0
      ? outranking.finalists
      : outranking.rankedCandidates;

  const recommendation = ranked[0];
  if (!recommendation) {
    throw new Error("Decision engine requires at least one candidate option.");
  }

  const robustAlternative =
    ranked.find((candidate) => candidate.id !== recommendation.id) ??
    outranking.rankedCandidates.find(
      (candidate) => candidate.id !== recommendation.id,
    ) ??
    recommendation;

  const alternatives = ensureTwoAlternatives(
    recommendation,
    [
      ...outranking.weights.constraints.eliminated,
      ...outranking.eliminated,
    ],
    outranking.rankedCandidates,
  );

  return {
    outranking,
    ranked,
    recommendation,
    robustAlternative,
    confidence: computeConfidence(ranked),
    alternatives,
  };
}
