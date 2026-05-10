import type {
  CandidateOption,
  EliminatedCandidate,
  Stage1Values,
  Stage2Constraints,
} from "./types";

function evaluateCandidate(values: Stage1Values, candidate: CandidateOption) {
  const failedReasons =
    candidate.constraints
      ?.filter((constraint) => constraint.failsWhen(values.fields))
      .map((constraint) => constraint.reason(values.fields)) ?? [];

  return {
    option: candidate.option,
    passed: failedReasons.length === 0,
    failedReasons,
  };
}

export async function runStage2Constraints(
  values: Stage1Values,
): Promise<Stage2Constraints> {
  const constraintChecks = values.template.candidateSet.map((candidate) =>
    evaluateCandidate(values, candidate),
  );

  const filtered: CandidateOption[] = [];
  const eliminated: EliminatedCandidate[] = [];

  values.template.candidateSet.forEach((candidate, index) => {
    const check = constraintChecks[index];
    if (!check) return;

    if (check.passed) {
      filtered.push(candidate);
      return;
    }

    eliminated.push({
      id: candidate.id,
      option: candidate.option,
      eliminatedAtStage: 2,
      reason: check.failedReasons.join(" "),
    });
  });

  return {
    values,
    filtered: filtered.length > 0 ? filtered : values.template.candidateSet,
    eliminated,
    constraintChecks,
  };
}
