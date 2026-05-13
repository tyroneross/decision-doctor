// lib/chat/survey-adapter.ts
//
// Phase-3 chat-as-decision-front-door — maps a submitted Survey + answers
// onto a typed engine input (DecisionInput OR RecommendationInput) so the
// route can run the decision-science pipeline directly, skipping the
// conversational re-intake.
//
// Prompt source-of-truth: .prompt-library/chat-survey-adapter.md. The
// SYSTEM_PROMPT constant below is the verbatim contents of that file's
// "## System prompt" fenced block, inlined so the module works on
// serverless Vercel (Next.js does not trace .md files into function
// bundles by default). When tuning, edit BOTH.
//
// On any failure mode (Groq error, parse failure, unmappable submission,
// out-of-range field), the adapter returns null and the caller falls
// through to the existing conversational intake. NEVER throws.

import "server-only";
import { z } from "zod";
import { callStage } from "@/lib/groq";
import { TemplateIdSchema, PainPathIdSchema } from "@/shared/schema";
import type { Survey, SurveySubmission } from "@/lib/engine/survey";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface AdaptedDecision {
  kind: "decision";
  templateId: "capacity" | "pricing" | "admin-hire";
  fields: Record<string, unknown>;
}

export interface AdaptedRecommendation {
  kind: "recommendation";
  painPath:
    | "referrals"
    | "research"
    | "admin"
    | "capacity_growth"
    | "follow_up"
    | "custom";
  challengeText: string;
  goal: string;
  scoringInput: {
    painSeverity: number;
    frequency: number;
    timeBurden: number;
    riskTolerance: number;
    aiComfort: number;
    dataReadiness: number;
  };
}

export type AdapterResult = AdaptedDecision | AdaptedRecommendation;

export interface AdaptSubmissionInput {
  userQuestion: string;
  survey: Survey;
  submission: SurveySubmission;
}

// ---------------------------------------------------------------------------
// Zod validators — the adapter's wire-format guarantees
// ---------------------------------------------------------------------------

const AdaptedDecisionSchema = z.object({
  kind: z.literal("decision"),
  templateId: TemplateIdSchema,
  fields: z.record(z.string(), z.unknown()),
});

const ScoringInputSchema = z.object({
  painSeverity: z.number().min(1).max(5),
  frequency: z.number().min(1).max(5),
  timeBurden: z.number().min(1).max(5),
  riskTolerance: z.number().min(1).max(5),
  aiComfort: z.number().min(1).max(5),
  dataReadiness: z.number().min(1).max(5),
});

const AdaptedRecommendationSchema = z.object({
  kind: z.literal("recommendation"),
  painPath: PainPathIdSchema,
  challengeText: z.string().min(60).max(600),
  goal: z.string().min(1).max(280),
  scoringInput: ScoringInputSchema,
});

const AdapterOutputSchema = z.discriminatedUnion("kind", [
  AdaptedDecisionSchema,
  AdaptedRecommendationSchema,
  z.object({
    kind: z.literal("unmappable"),
    reason: z.string().min(1).max(400),
  }),
]);

// ---------------------------------------------------------------------------
// System prompt — inlined from .prompt-library/chat-survey-adapter.md.
// ---------------------------------------------------------------------------

export const SYSTEM_PROMPT = `You are the survey-adapter for Aida. The user accepted Aida's offer to help with a decision, filled out a fresh survey, and submitted it. Your job: map their answers into the exact engine input shape so Aida can run the decision-science pipeline directly — no follow-up clarifier questions needed.

You output ONE JSON object. No prose. No markdown fences.

## Inputs you will receive

A single user message containing:
  USER_QUESTION: the user's original decision-shaped question, verbatim
  SURVEY_TITLE:  the survey title shown to the user
  ANSWERS:       a JSON object of { fieldId: { kind, value/lo/hi/values } }

## Output schema (return EXACTLY one of these)

For MCDA decisions:
{
  "kind": "decision",
  "templateId": "capacity" | "pricing" | "admin-hire",
  "fields": { ... template-specific intake fields ... }
}

For tool/workflow recommendations:
{
  "kind": "recommendation",
  "painPath": "referrals" | "research" | "admin" | "capacity_growth" | "follow_up" | "custom",
  "challengeText": "<60–200 word summary, paraphrasing the user's question + the answers>",
  "goal": "<short one-sentence goal>",
  "scoringInput": {
    "painSeverity": <1..5>,
    "frequency":   <1..5>,
    "timeBurden":  <1..5>,
    "riskTolerance": <1..5>,
    "aiComfort":   <1..5>,
    "dataReadiness": <1..5>
  }
}

If you cannot map the submission confidently to either shape, return:
{ "kind": "unmappable", "reason": "<one sentence>" }

## Template field contracts (decision path)

### templateId: "pricing"
Required field NAMES and types:
- currentRateUSD: number, 0..2000
- monthsSinceLastIncrease: integer, 0..120
- insuranceShare: number, 0..100 (percent)
- cashShare: number, 0..100 (percent; if user only answered one, infer cashShare = 100 - insuranceShare)
- avgFillRate: number, 0..100 (percent)
- competitorBenchmarkUSD: number, 0..2000
- riskTolerance: "low" | "medium" | "high"

### templateId: "capacity"
Required field NAMES and types:
- weeklyClinicalHours: integer, 1..80
- currentWeeklyPatients: integer, 0..80
- waitlistLength: integer, 0..500
- avgRevenuePerVisitUSD: number, 0..5000
- energyLevel: "depleted" | "steady" | "energized"
- practiceStage: "new" | "growing" | "established" | "winding-down"
- horizonMonths: integer, 1..60

### templateId: "admin-hire"
Required field NAMES and types:
- weeklyAdminHours: integer, 0..80
- monthlyBudgetUSD: number, 0..20000
- monthsSavingsRunway: integer, 0..60
- growthExpectation: "shrinking" | "stable" | "growing"
- adminTaskMix: "scheduling-billing" | "scheduling-only" | "billing-only" | "intake-and-comms"
- delegationComfort: "low" | "medium" | "high"
- horizonMonths: integer, 1..60

## Mapping rules

1. Coerce types: a survey kind="range" answer with lo+hi → use the midpoint as a single number unless the engine expects two separate fields (none today; always midpoint).
2. Coerce percentage answers: if a survey answer is in 0..1 instead of 0..100, multiply by 100. Same in reverse if needed.
3. When a required engine field is NOT answered in the survey, fill a SAFE DEFAULT for that field rather than refusing — except for the \`*Share\`, \`*USD\`, and core categorical fields which must be present.
4. Mapping should be DETERMINISTIC — the same survey + answers always produces the same engine input. Same input → same output.
5. Use the USER_QUESTION as context to disambiguate enum mappings (e.g. "I'm depleted by my caseload" → energyLevel: "depleted").
6. For recommendation path, \`scoringInput\` values are inferred from the answers — explicit user signals win over defaults. Mid-scale (3) is the default when no signal is present.

## Healthcare context

- Solo practitioner audience.
- Never request or invent PHI.
- When the user mentioned a discipline (psychiatry / LCSW / nutrition / PT), surface it in \`challengeText\` for the recommendation path so the recommendation engine returns discipline-appropriate suggestions.

## When to return "unmappable"

- The submission targets a decision the templates don't cover (e.g., real estate, legal entity choice).
- Required engine fields are missing AND no reasonable safe default exists.
- The submission contradicts itself (e.g., insuranceShare > 100, fee in implausible range).

Return "unmappable" rather than forcing a bad mapping. The route falls back to the conversational intake when this happens, so the user is never stuck.

## Worked example — decision path

USER_QUESTION: "How much should I raise my prices for my psychiatry private practice?"
SURVEY_TITLE: "Plan your next price change"
ANSWERS:
{
  "currentRateUSD": { "kind": "number", "value": 200 },
  "target_fee": { "kind": "range", "lo": 220, "hi": 280 },
  "insurance_mix": { "kind": "single", "value": "hybrid" },
  "constraints": { "kind": "multi", "values": ["waitlist"] },
  "priority": { "kind": "single", "value": "income" }
}

OUTPUT:
{
  "kind": "decision",
  "templateId": "pricing",
  "fields": {
    "currentRateUSD": 200,
    "monthsSinceLastIncrease": 12,
    "insuranceShare": 50,
    "cashShare": 50,
    "avgFillRate": 85,
    "competitorBenchmarkUSD": 250,
    "riskTolerance": "medium"
  }
}

Notes on this mapping:
- target_fee.midpoint (250) seeded the competitorBenchmarkUSD when no benchmark was asked.
- "hybrid" mapped to a 50/50 share; the engine recomputes if intake values arrive later.
- "waitlist" constraint + "income" priority → riskTolerance "medium" (with a waitlist the user has cover, but priority on income suggests not maxing risk).
- monthsSinceLastIncrease (12) is a sensible default when no answer is present.

## Worked example — recommendation path

USER_QUESTION: "What AI scribe should I use for my practice?"
SURVEY_TITLE: "Find the right AI scribe"
ANSWERS:
{
  "session_volume": { "kind": "number", "value": 25 },
  "ehr_in_use": { "kind": "single", "value": "simplepractice" },
  "data_sensitivity": { "kind": "single", "value": "high" }
}

OUTPUT:
{
  "kind": "recommendation",
  "painPath": "admin",
  "challengeText": "Solo psychiatry practice on SimplePractice, 25 sessions per week, high concern for patient data sensitivity. Wants an AI scribe that reduces note-taking time without compromising compliance.",
  "goal": "Choose an AI scribe stack that fits my EHR and protects patient data.",
  "scoringInput": {
    "painSeverity": 4,
    "frequency": 5,
    "timeBurden": 4,
    "riskTolerance": 2,
    "aiComfort": 3,
    "dataReadiness": 3
  }
}

## Acceptance criteria

- Output is valid JSON parseable by \`JSON.parse\`.
- \`kind\` is one of "decision", "recommendation", or "unmappable".
- When \`kind === "decision"\`, \`templateId\` matches one of the three template ids AND every required field for that template is present with a value in the documented range.
- When \`kind === "recommendation"\`, \`painPath\` is one of the six valid values AND \`challengeText\` is 60–600 chars.
- No content outside the JSON object.`;

/** Test-only no-op (kept for API compat after fs-based cache removal). */
export function __resetPromptCacheForTests(): void {
  /* no-op */
}

// ---------------------------------------------------------------------------
// JSON parsing — tolerant of fenced output
// ---------------------------------------------------------------------------

function parseJson(raw: string): unknown {
  const trimmed = raw.trim();
  const stripped = trimmed
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  try {
    return JSON.parse(stripped);
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Public surface
// ---------------------------------------------------------------------------

/**
 * Map a survey submission onto a typed engine input. Returns null on any
 * failure (Groq error, parse failure, schema validation failure,
 * "unmappable" classification). NEVER throws — caller falls back to the
 * conversational intake.
 */
export async function adaptSubmission(
  input: AdaptSubmissionInput,
): Promise<AdapterResult | null> {
  const question = input.userQuestion.trim();
  if (!question) return null;

  try {
    const userPrompt = buildUserPrompt(input);
    const { answer } = await callStage({
      systemPrompt: SYSTEM_PROMPT,
      userPrompt,
      responseSchema: { type: "object" },
      temperature: 0,
    });
    const parsedJson = parseJson(answer);
    if (!parsedJson) return null;
    const validated = AdapterOutputSchema.safeParse(parsedJson);
    if (!validated.success) return null;
    if (validated.data.kind === "unmappable") {
      if (process.env.NODE_ENV !== "production") {
        console.info(
          "[survey-adapter] unmappable:",
          validated.data.reason,
        );
      }
      return null;
    }
    return validated.data as AdapterResult;
  } catch (err) {
    if (process.env.NODE_ENV !== "production") {
      console.warn("[survey-adapter] groq call failed:", err);
    }
    return null;
  }
}

function buildUserPrompt(input: AdaptSubmissionInput): string {
  const answers = JSON.stringify(input.submission.answers, null, 2);
  return [
    `USER_QUESTION: ${input.userQuestion}`,
    `SURVEY_TITLE: ${input.survey.title}`,
    `ANSWERS:`,
    answers,
  ].join("\n");
}
