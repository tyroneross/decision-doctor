import type {
  CandidateOption,
  DecisionCriterion,
  RankedCandidate,
  Stage3Weights,
  Stage4Outranking,
} from "./types";

function clampScore(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

function scoreCandidate(
  candidate: CandidateOption,
  criteria: DecisionCriterion[],
  fields: Stage3Weights["constraints"]["values"]["fields"],
): Record<string, number> {
  return Object.fromEntries(
    criteria.map((criterion) => {
      const score = candidate.scores[criterion.id] ?? 0;
      const value = typeof score === "function" ? score(fields) : score;
      return [criterion.id, clampScore(value)];
    }),
  );
}

function weightedScore(
  scores: Record<string, number>,
  weights: Record<string, number>,
): number {
  return Object.entries(scores).reduce(
    (sum, [criterionId, score]) => sum + score * (weights[criterionId] ?? 0),
    0,
  );
}

function addCloseness(
  candidates: Array<Omit<RankedCandidate, "closeness">>,
  criteria: DecisionCriterion[],
  weights: Record<string, number>,
): RankedCandidate[] {
  const ideals = Object.fromEntries(
    criteria.map((criterion) => {
      const scores = candidates.map(
        (candidate) => candidate.criterionScores[criterion.id] ?? 0,
      );
      const best =
        criterion.direction === "maximize"
          ? Math.max(...scores)
          : Math.min(...scores);
      const worst =
        criterion.direction === "maximize"
          ? Math.min(...scores)
          : Math.max(...scores);
      return [criterion.id, { best, worst }];
    }),
  );

  return candidates.map((candidate) => {
    let distanceToBest = 0;
    let distanceToWorst = 0;

    criteria.forEach((criterion) => {
      const weight = weights[criterion.id] ?? 0;
      const score = candidate.criterionScores[criterion.id] ?? 0;
      const ideal = ideals[criterion.id];
      if (!ideal) return;

      distanceToBest += weight * (score - ideal.best) ** 2;
      distanceToWorst += weight * (score - ideal.worst) ** 2;
    });

    const bestDistance = Math.sqrt(distanceToBest);
    const worstDistance = Math.sqrt(distanceToWorst);
    const denominator = bestDistance + worstDistance;

    return {
      ...candidate,
      closeness:
        denominator === 0
          ? 50
          : Math.round((worstDistance / denominator) * 1000) / 10,
    };
  });
}

function biggestGap(
  leader: RankedCandidate,
  candidate: RankedCandidate,
  criteria: DecisionCriterion[],
): string {
  const [criterion] = criteria
    .map((item) => ({
      label: item.label,
      gap:
        (leader.criterionScores[item.id] ?? 0) -
        (candidate.criterionScores[item.id] ?? 0),
    }))
    .sort((a, b) => b.gap - a.gap);

  return criterion?.label ?? "overall fit";
}

export async function runStage4Outranking(
  weights: Stage3Weights,
): Promise<Stage4Outranking> {
  const criteria = weights.constraints.values.template.criteria;
  const candidates = weights.constraints.filtered.map((candidate) => {
    const criterionScores = scoreCandidate(
      candidate,
      criteria,
      weights.constraints.values.fields,
    );

    return {
      ...candidate,
      criterionScores,
      weightedScore: Math.round(weightedScore(criterionScores, weights.weights) * 10) / 10,
    };
  });

  const rankedCandidates = addCloseness(candidates, criteria, weights.weights)
    .sort((a, b) => {
      if (b.closeness !== a.closeness) return b.closeness - a.closeness;
      return b.weightedScore - a.weightedScore;
    });

  const finalists = rankedCandidates.slice(0, Math.min(2, rankedCandidates.length));
  const leader = rankedCandidates[0];
  const eliminated = leader
    ? rankedCandidates.slice(finalists.length).map((candidate) => ({
        id: candidate.id,
        option: candidate.option,
        eliminatedAtStage: 4 as const,
        weightedScore: candidate.weightedScore,
        reason: `${leader.option} outranked this option on weighted fit, with the largest gap in ${biggestGap(
          leader,
          candidate,
          criteria,
        )}.`,
      }))
    : [];

  return {
    weights,
    finalists,
    eliminated,
    rankedCandidates,
  };
}
