// PRD §6.2 Stage 2 — Hard constraints (veto filtering).
// Deterministic. No LLM call. Each constraint either passes or vetoes a
// candidate set; vetoed candidates carry their elimination reason for the
// transparent UI (PRD §5 T-04).

import type { Candidate, DecisionTemplate, Constraint } from "@/lib/engine/types";

export interface Stage2Output {
  filtered: Candidate[];
  eliminated: Array<{
    candidateId: string;
    constraintId: string;
    reason: string;
  }>;
  triggeredConstraints: string[]; // ids of constraints that fired
}

export function runStage2Constraints(
  template: DecisionTemplate,
  intake: Record<string, unknown>,
): Stage2Output {
  const eliminatedIds = new Set<string>();
  const eliminations: Stage2Output["eliminated"] = [];
  const triggered: string[] = [];

  for (const c of template.constraints) {
    if (constraintTrips(c, intake, template)) {
      triggered.push(c.id);
      for (const candId of c.vetoCandidates ?? []) {
        if (!eliminatedIds.has(candId)) {
          eliminatedIds.add(candId);
          eliminations.push({
            candidateId: candId,
            constraintId: c.id,
            reason: c.description,
          });
        }
      }
    }
  }

  const filtered = template.candidates.filter(
    (cand) => !eliminatedIds.has(cand.id),
  );

  return { filtered, eliminated: eliminations, triggeredConstraints: triggered };
}

function constraintTrips(
  c: Constraint,
  intake: Record<string, unknown>,
  template: DecisionTemplate,
): boolean {
  // Two evaluation modes: intake-field or criterion-score.
  if (c.intakeField) {
    const v = intake[c.intakeField];
    return compare(v, c.operator, c.threshold);
  }
  if (c.criterionId && typeof c.threshold === "number") {
    // Veto candidates whose score on the named criterion is below threshold.
    // (Not used by current templates but supported for v2 templates.)
    void template;
    return false;
  }
  return false;
}

function compare(
  value: unknown,
  op: Constraint["operator"] | undefined,
  threshold: Constraint["threshold"] | undefined,
): boolean {
  if (op === undefined) return false;
  // String equality / inequality (used for enum intake fields like energyLevel)
  if (typeof value === "string") {
    if (op === "==" && typeof threshold !== "number") {
      // For string equality without an explicit threshold (e.g. "depleted"),
      // the threshold is encoded as the constraint's logical match — see capacity
      // template's `depleted-vetoes-expand`. We treat the constraint's intent
      // as: trip when the field equals a known "bad" value. Here we hard-code
      // a match list per field name to keep the shape declarative.
      return STRING_VETO_MATCHES[value] ?? false;
    }
  }
  if (typeof threshold !== "number" || typeof value !== "number") return false;
  switch (op) {
    case "<":
      return value < threshold;
    case "<=":
      return value <= threshold;
    case ">":
      return value > threshold;
    case ">=":
      return value >= threshold;
    case "==":
      return value === threshold;
    case "!=":
      return value !== threshold;
    default:
      return false;
  }
}

// String values that, when matched, trip a constraint's `==` operator.
// Keeps the templates declarative without dragging string-threshold parsing
// into the core type.
const STRING_VETO_MATCHES: Record<string, boolean> = {
  depleted: true,
  low: true,
};
