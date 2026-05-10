// PRD §6 — Internal types for the per-stage MCDA engine.
//
// Templates declare:
//   - intake schema (zod) — F-02 form fields
//   - candidate set — discrete options the engine ranks
//   - criteria — what we score candidates against (with default weights)
//   - constraints — hard veto rules (Stage 2)
//
// Each stage transforms a typed input into a typed output. Orchestrator wires them.

import type { z } from "zod";

export type CriterionDirection = "max" | "min";

export interface Criterion {
  id: string; // short slug
  label: string; // human-readable
  description: string; // 1-2 sentence explanation for the UI
  direction: CriterionDirection; // max = higher is better, min = lower is better
  defaultWeight: number; // 0..1, will be normalized
}

export interface Candidate {
  id: string;
  label: string; // user-facing name e.g. "Hire a part-time virtual assistant"
  description: string; // 1-2 sentence explanation
  // Score per criterion in [0, 1]. Provided by the template author for v1
  // (deterministic, transparent). v2 may LLM-derive these from intake.
  scores: Record<string, number>;
}

export type ConstraintKind = "veto" | "soft";
export type ConstraintOperator = ">" | "<" | ">=" | "<=" | "==" | "!=";

export interface Constraint {
  id: string;
  label: string; // "Cannot exceed budget"
  description: string;
  kind: ConstraintKind;
  // The constraint targets either a candidate's `scores[criterion]` OR an
  // intake field. v1 supports intake-field constraints with operator + threshold.
  intakeField?: string; // e.g. "monthlyBudgetUSD"
  operator?: ConstraintOperator;
  // Threshold is either a literal number or an intake-derived expression.
  // For simplicity v1 uses literals.
  threshold?: number;
  // Eliminate any candidate whose scores[<criterionId>] is below threshold.
  criterionId?: string;
  vetoCandidates?: string[]; // candidates to veto when this constraint trips
}

export interface DecisionTemplate {
  id: "capacity" | "pricing" | "admin-hire";
  label: string; // human-readable
  description: string; // 1-2 sentences
  // Zod schema for the intake form. Used by F-02 (form validation) AND
  // by the engine (Stage 1 extracts values from these fields).
  intakeSchema: z.ZodTypeAny;
  // Form metadata for UI rendering. ≤7 fields per A-07.
  fields: Array<{
    name: string;
    label: string;
    helper?: string;
    kind: "number" | "text" | "select" | "boolean";
    options?: Array<{ value: string; label: string }>;
    required?: boolean;
    min?: number;
    max?: number;
  }>;
  candidates: Candidate[];
  criteria: Criterion[];
  constraints: Constraint[];
}
