// 9-criteria candidate task scorer — E2 implementation.
//
// Scores each candidate task on 9 PRD criteria (§"Candidate Task Scoring") and
// returns ranked ScoredCandidates with a per-criterion rationale (method trace).
//
// All scoring is deterministic (no LLM call). Each criterion is scored 0-1.
// Combined score = weighted sum. Default weights are equal (1/9 each).
//
// Scoring philosophy (per PRD):
//   Recommendation favors high-impact, low-risk, low-friction tasks.
//   For "min-direction" criteria (risk, adoption_friction, setup_effort):
//     higher raw value = more problematic → inverted before weighting.

import type { CandidateTask } from "./candidates";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type Criterion =
  | "pain_severity"
  | "frequency"
  | "time_burden"
  | "business_impact"
  | "ai_fit"
  | "risk"
  | "data_readiness"
  | "adoption_friction"
  | "setup_effort";

export const ALL_CRITERIA: Criterion[] = [
  "pain_severity",
  "frequency",
  "time_burden",
  "business_impact",
  "ai_fit",
  "risk",
  "data_readiness",
  "adoption_friction",
  "setup_effort",
];

/** Directions: max = higher is better; min = lower is better (inverted before weighting). */
const CRITERION_DIRECTION: Record<Criterion, "max" | "min"> = {
  pain_severity: "max",
  frequency: "max",
  time_burden: "max",
  business_impact: "max",
  ai_fit: "max",
  risk: "min",
  data_readiness: "max",
  adoption_friction: "min",
  setup_effort: "min",
};

export interface CriterionScore {
  /** Raw score 0-1 (pre-direction adjustment). */
  raw: number;
  /** Adjusted score 0-1 (inverted for min-direction criteria before weighting). */
  adjusted: number;
  /** Brief rationale for this score. */
  rationale: string;
}

export interface ScoringInput {
  /** 0-1: how severe / frustrating is this pain for the user. */
  painSeverity: number;
  /** 0-1: how often does this pain occur. */
  frequency: number;
  /** 0-1: weekly time burden consumed by this pain. */
  timeBurden: number;
  /** 0-1: user's risk tolerance (0 = very risk-averse, 1 = comfortable with risk). */
  riskTolerance: number;
  /** 0-1: user's AI comfort (0 = beginner, 1 = experienced). */
  aiComfort: number;
  /** 0-1: how ready the user's data is (safe, available non-PHI context). */
  dataReadiness: number;
  /**
   * Optional per-criterion weight overrides. Values do not need to sum to 1;
   * the scorer normalizes them. Missing criteria get the default equal weight.
   */
  weights?: Partial<Record<Criterion, number>>;
}

export interface ScoredCandidate extends CandidateTask {
  scores: Record<Criterion, CriterionScore>;
  /** Weighted sum of adjusted scores, 0-1. */
  combinedScore: number;
  /** 1-based rank (1 = best). */
  rank: number;
}

// ---------------------------------------------------------------------------
// Default weights (equal)
// ---------------------------------------------------------------------------

const DEFAULT_WEIGHT = 1 / ALL_CRITERIA.length;

function buildWeights(overrides?: Partial<Record<Criterion, number>>): Record<Criterion, number> {
  const raw: Record<Criterion, number> = {} as Record<Criterion, number>;
  for (const c of ALL_CRITERIA) {
    raw[c] = overrides?.[c] ?? DEFAULT_WEIGHT;
  }
  // Normalize.
  const total = Object.values(raw).reduce((s, v) => s + v, 0);
  const normalized: Record<Criterion, number> = {} as Record<Criterion, number>;
  for (const c of ALL_CRITERIA) {
    normalized[c] = total > 0 ? raw[c]! / total : DEFAULT_WEIGHT;
  }
  return normalized;
}

// ---------------------------------------------------------------------------
// Per-criterion scoring logic
// ---------------------------------------------------------------------------

// AI capability keywords that indicate strong AI fit.
const HIGH_AI_FIT_CAPS = new Set([
  "drafting", "summarization", "extraction", "classification", "monitoring",
]);
const MEDIUM_AI_FIT_CAPS = new Set([
  "analysis", "planning", "structuring", "scheduling",
]);

// Starting-level friction mapping (lower level = less friction).
const FRICTION_BY_LEVEL: Record<CandidateTask["startingLevel"], number> = {
  prompt: 0.1,
  checklist: 0.25,
  skill: 0.5,
  plugin: 0.65,
  agent: 0.85,
};

// Setup effort by starting level.
const EFFORT_BY_LEVEL: Record<CandidateTask["startingLevel"], number> = {
  prompt: 0.1,
  checklist: 0.2,
  skill: 0.55,
  plugin: 0.7,
  agent: 0.9,
};

/**
 * Score a single candidate on all 9 criteria given the user's scoring context.
 */
function scoreSingleCandidate(
  candidate: CandidateTask,
  input: ScoringInput,
): Record<Criterion, CriterionScore> {
  const aiCapLower = candidate.aiCapability.toLowerCase();
  const descLower = candidate.taskDescription.toLowerCase();
  const guardLower = candidate.guardrails.toLowerCase();

  // --- pain_severity: driven by user input ---
  const painSeverityRaw = input.painSeverity;
  const scores: Record<Criterion, CriterionScore> = {
    pain_severity: {
      raw: painSeverityRaw,
      adjusted: painSeverityRaw,
      rationale: painSeverityRaw >= 0.7
        ? "High-severity pain — strong motivation to solve."
        : painSeverityRaw >= 0.4
          ? "Moderate severity — worth addressing."
          : "Lower severity — consider prioritizing other tasks first.",
    },

    // --- frequency: driven by user input ---
    frequency: (() => {
      const raw = input.frequency;
      return {
        raw,
        adjusted: raw,
        rationale: raw >= 0.7
          ? "Frequent occurrence amplifies the value of automation."
          : raw >= 0.4
            ? "Moderate frequency — automation adds meaningful value."
            : "Infrequent — automation ROI is lower but still useful for consistency.",
      };
    })(),

    // --- time_burden: driven by user input ---
    time_burden: (() => {
      const raw = input.timeBurden;
      return {
        raw,
        adjusted: raw,
        rationale: raw >= 0.7
          ? "High time burden — AI assistance delivers immediate time savings."
          : raw >= 0.4
            ? "Moderate time cost — AI can meaningfully reduce it."
            : "Low time cost — AI helps but the savings per week will be modest.",
      };
    })(),

    // --- business_impact: composite of severity + frequency + task category ---
    business_impact: (() => {
      const patientFacing = /patient|referral|follow.?up|outreach|appointment/.test(descLower);
      const revenueRelevant = /revenue|billing|pricing|capacity|schedule|growth/.test(descLower);
      const operationalLeverage = /workflow|sop|template|process|documenta/.test(descLower);
      const impactFactors = [
        input.painSeverity * 0.4,
        input.frequency * 0.3,
        patientFacing ? 0.15 : 0,
        revenueRelevant ? 0.1 : 0,
        operationalLeverage ? 0.05 : 0,
      ];
      const raw = impactFactors.reduce((s, v) => s + v, 0);
      const clamped = Math.min(1, raw);
      return {
        raw: clamped,
        adjusted: clamped,
        rationale: clamped >= 0.7
          ? "High business impact — directly touches revenue, referrals, or patient experience."
          : clamped >= 0.45
            ? "Moderate business impact — operational leverage that compounds over time."
            : "Lower direct business impact — useful but not the highest-leverage task.",
      };
    })(),

    // --- ai_fit: based on AI capability type + task description ---
    ai_fit: (() => {
      const highFit = HIGH_AI_FIT_CAPS.has(aiCapLower);
      const medFit = MEDIUM_AI_FIT_CAPS.has(aiCapLower);
      const comfortBonus = input.aiComfort * 0.1;
      const baseScore = highFit ? 0.85 : medFit ? 0.65 : 0.45;
      const raw = Math.min(1, baseScore + comfortBonus);
      return {
        raw,
        adjusted: raw,
        rationale: highFit
          ? `AI excels at ${aiCapLower} — this task is a strong fit.`
          : medFit
            ? `AI can handle ${aiCapLower} well, though output will need review.`
            : `AI has partial fit for ${aiCapLower} — human-in-the-loop recommended.`,
      };
    })(),

    // --- risk: higher = more risk. Inverted before weighting (min-direction). ---
    risk: (() => {
      const phiMentioned = /phi|patient name|mrn|clinical detail|diagnosis|diagnos/.test(guardLower);
      const clinicalRisk = /clinical|evidence|treatment|medication|prescri|diagnos/.test(descLower);
      const patientFacing = /patient.facing|send.*patient|patient.*email|patient.*message/.test(descLower);
      // riskTolerance is user comfort with risk; higher tolerance → effective risk lower.
      const baseRisk =
        (phiMentioned ? 0.35 : 0) +
        (clinicalRisk ? 0.3 : 0) +
        (patientFacing ? 0.2 : 0) +
        0.1; // floor risk
      const adjustedForTolerance = baseRisk * (1 - input.riskTolerance * 0.3);
      const raw = Math.min(1, adjustedForTolerance);
      const adjusted = 1 - raw; // invert: lower risk → higher score
      return {
        raw,
        adjusted,
        rationale: raw >= 0.6
          ? "Higher risk: PHI, clinical content, or patient-facing output. Clinician review required."
          : raw >= 0.3
            ? "Moderate risk: review guardrails before deploying. No PHI in prompts."
            : "Lower risk task — standard guardrails apply.",
      };
    })(),

    // --- data_readiness: how available and safe is the needed data ---
    data_readiness: (() => {
      const requiresPhi = /phi|patient name|mrn|diagnosis|clinical record/.test(
        candidate.dataNeeded.toLowerCase(),
      );
      const requiresEhr = /ehr|electronic health|epic|athena|emr/.test(
        candidate.dataNeeded.toLowerCase(),
      );
      const simpleData = /description|category|list|text|note|aggregate/.test(
        candidate.dataNeeded.toLowerCase(),
      );
      const baseReadiness = requiresPhi
        ? 0.1
        : requiresEhr
          ? 0.35
          : simpleData
            ? 0.85
            : 0.6;
      const raw = Math.min(1, baseReadiness * (0.6 + input.dataReadiness * 0.4));
      return {
        raw,
        adjusted: raw,
        rationale: raw >= 0.7
          ? "Data is readily available — no special access needed."
          : raw >= 0.4
            ? "Data is available but may require some preparation."
            : "Data readiness is a barrier — EHR access or PHI de-identification needed.",
      };
    })(),

    // --- adoption_friction: starting level + user AI comfort (inverted) ---
    adoption_friction: (() => {
      const levelFriction = FRICTION_BY_LEVEL[candidate.startingLevel];
      // User comfort reduces friction.
      const raw = Math.max(0, levelFriction - input.aiComfort * 0.15);
      const adjusted = 1 - raw; // invert
      return {
        raw,
        adjusted,
        rationale: raw <= 0.2
          ? "Very low friction — starts with a simple prompt, no tooling required."
          : raw <= 0.45
            ? "Moderate friction — a checklist or skill requires some setup time."
            : "Higher friction — plugin or agent requires technical effort and integration work.",
      };
    })(),

    // --- setup_effort: starting level (inverted) ---
    setup_effort: (() => {
      const levelEffort = EFFORT_BY_LEVEL[candidate.startingLevel];
      const raw = Math.max(0, levelEffort - input.aiComfort * 0.1);
      const adjusted = 1 - raw; // invert
      return {
        raw,
        adjusted,
        rationale: raw <= 0.2
          ? "Minimal setup — paste a prompt and go."
          : raw <= 0.5
            ? "Moderate setup — a checklist or skill takes an hour to configure."
            : "Significant setup — plugin or agent requires development and integration.",
      };
    })(),
  };

  return scores;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Score and rank a list of candidate tasks on 9 PRD criteria.
 *
 * Returns candidates sorted by combinedScore descending (rank 1 = best).
 * Each ScoredCandidate carries per-criterion scores + rationales (method trace).
 */
export function scoreCandidates(
  candidates: CandidateTask[],
  input: ScoringInput,
): ScoredCandidate[] {
  const weights = buildWeights(input.weights);

  const scored: ScoredCandidate[] = candidates.map((candidate) => {
    const criterionScores = scoreSingleCandidate(candidate, input);

    // Combined score = weighted sum of adjusted scores.
    let combinedScore = 0;
    for (const c of ALL_CRITERIA) {
      combinedScore += criterionScores[c].adjusted * weights[c]!;
    }

    return {
      ...candidate,
      scores: criterionScores,
      combinedScore: Math.min(1, Math.max(0, combinedScore)),
      rank: 0, // set below
    };
  });

  // Sort descending by combinedScore.
  scored.sort((a, b) => b.combinedScore - a.combinedScore);

  // Assign ranks.
  for (let i = 0; i < scored.length; i++) {
    scored[i]!.rank = i + 1;
  }

  return scored;
}
