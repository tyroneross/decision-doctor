// lib/chat/survey-adapter.ts
//
// Phase-3 chat-as-decision-front-door — maps a submitted Survey + answers
// onto a typed engine input (DecisionInput OR RecommendationInput) so the
// route can run the decision-science pipeline directly, skipping the
// conversational re-intake.
//
// The adapter is a single Groq JSON-mode call against the prompt at
// `.prompt-library/chat-survey-adapter.md`. The prompt knows the three
// engine templates' field contracts AND the recommendation engine's
// scoring axes — see that file for the source of truth.
//
// On any failure mode (Groq error, parse failure, unmappable submission,
// out-of-range field), the adapter returns null and the caller falls
// through to the existing conversational intake. NEVER throws.

import "server-only";
import fs from "node:fs";
import path from "node:path";
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
// Prompt loader
// ---------------------------------------------------------------------------

const PROMPT_REL_PATH = ".prompt-library/chat-survey-adapter.md";
let _systemPromptCache: string | null = null;

function loadSystemPrompt(): string {
  if (_systemPromptCache) return _systemPromptCache;
  const absPath = path.join(process.cwd(), PROMPT_REL_PATH);
  const raw = fs.readFileSync(absPath, "utf8");
  const match = raw.match(/##\s+System prompt\s*\n+```\s*\n([\s\S]*?)\n```/);
  if (!match || !match[1]) {
    throw new Error(
      `[survey-adapter] Could not extract system prompt from ${PROMPT_REL_PATH}`,
    );
  }
  _systemPromptCache = match[1].trim();
  return _systemPromptCache;
}

/** Test hook. */
export function __resetPromptCacheForTests(): void {
  _systemPromptCache = null;
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
    const systemPrompt = loadSystemPrompt();
    const userPrompt = buildUserPrompt(input);
    const { answer } = await callStage({
      systemPrompt,
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
