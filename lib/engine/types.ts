import type { z } from "zod";
import type {
  DecisionInput,
  DecisionOutput,
  FieldValue,
  TemplateId,
} from "../../shared/schema";

export type TemplateFields = Record<string, FieldValue>;

export type DecisionCriterion = {
  id: string;
  label: string;
  description: string;
  direction: "maximize" | "minimize";
  baseWeight: number;
  weightAdjustment?: (fields: TemplateFields) => number;
};

export type CandidateScore =
  | number
  | ((fields: TemplateFields) => number);

export type CandidateConstraint = {
  id: string;
  description: string;
  failsWhen: (fields: TemplateFields) => boolean;
  reason: (fields: TemplateFields) => string;
};

export type CandidateOption = {
  id: string;
  option: string;
  summary: string;
  scores: Record<string, CandidateScore>;
  constraints?: CandidateConstraint[];
};

export type RankedCandidate = CandidateOption & {
  criterionScores: Record<string, number>;
  weightedScore: number;
  closeness: number;
};

export type EliminatedCandidate = {
  id: string;
  option: string;
  eliminatedAtStage: 2 | 4;
  reason: string;
  weightedScore?: number;
};

export type DecisionTemplate = {
  id: TemplateId;
  title: string;
  fieldSchema: z.ZodType<TemplateFields>;
  fieldCount: number;
  criteria: DecisionCriterion[];
  candidateSet: CandidateOption[];
  workloadReducers: (
    recommendation: RankedCandidate,
    robustAlternative: RankedCandidate,
    input: DecisionInput,
  ) => DecisionOutput["workloadReducers"];
};

export type Stage1Values = {
  input: DecisionInput;
  template: DecisionTemplate;
  fields: TemplateFields;
  objectives: Array<{
    criterionId: string;
    label: string;
    prioritySignal: "low" | "medium" | "high";
  }>;
  fieldSummary: TemplateFields;
};

export type Stage2Constraints = {
  values: Stage1Values;
  filtered: CandidateOption[];
  eliminated: EliminatedCandidate[];
  constraintChecks: Array<{
    option: string;
    passed: boolean;
    failedReasons: string[];
  }>;
};

export type Stage3Weights = {
  constraints: Stage2Constraints;
  weights: Record<string, number>;
  adjustments: Array<{
    criterionId: string;
    baseWeight: number;
    adjustment: number;
    normalizedWeight: number;
  }>;
};

export type Stage4Outranking = {
  weights: Stage3Weights;
  finalists: RankedCandidate[];
  eliminated: EliminatedCandidate[];
  rankedCandidates: RankedCandidate[];
};

export type Stage5Ranking = {
  outranking: Stage4Outranking;
  ranked: RankedCandidate[];
  recommendation: RankedCandidate;
  robustAlternative: RankedCandidate;
  confidence: number;
  alternatives: EliminatedCandidate[];
};
