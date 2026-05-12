// lib/engine/workflow/score-steps.ts
//
// Pass 2 — Per-step AI-suitability scoring via OpenAI (gpt-4o-mini).
//
// Uses response_format: { type: "json_schema" } for deterministic structured
// output. Fills aiSuitability, aiRung, aiSuggestion, systemImpact, userPain,
// and lynchpinScore. compositeScore is provided by the LLM; lynchpinScore is
// computed deterministically AFTER the LLM call so the formula is auditable.
//
// Rung cutoffs (hardcoded per research packet):
//   compositeScore < 0.3                  → "none"
//   0.3 ≤ compositeScore < 0.5            → "prompt"
//   0.5 ≤ compositeScore < 0.7            → "skill"
//   0.7 ≤ compositeScore < 0.85           → "plugin"
//   compositeScore ≥ 0.85                 → "agent"
//
// lynchpin formula (post-LLM, deterministic):
//   lynchpinScore = 0.4*(userPain/5) + 0.4*(systemImpact/5) + 0.2*compositeScore
//   clamped to [0, 1]

import "server-only";
import OpenAI from "openai";
import { z } from "zod";
import type { ActivityStep, AiRung, PainPathId } from "@/lib/engine/types";
import { getScoreSystemPrompt, getScoreUserPrompt } from "./prompts/score";

// ---------------------------------------------------------------------------
// Input contract
// ---------------------------------------------------------------------------

export interface ScoringContext {
  challengeText: string;
  goal: string | undefined;
  painPath: PainPathId;
  /** Optional user-reported pain (1–5 scale). Defaults mid-scale (3) when absent. */
  reportedPain?: number;
}

// ---------------------------------------------------------------------------
// OpenAI client (lazy singleton — mirrors gpt4o-fallback.ts pattern)
// ---------------------------------------------------------------------------

let _client: OpenAI | null = null;
function openaiClient(): OpenAI {
  if (_client) return _client;
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("[score-steps] OPENAI_API_KEY missing — Pass 2 cannot run.");
  }
  _client = new OpenAI({ apiKey });
  return _client;
}

/** Test hook — drop the cached client so a fresh mock OpenAI is constructed. */
export function __resetClientForTests(): void {
  _client = null;
}

// ---------------------------------------------------------------------------
// Rung cutoff logic (deterministic)
// ---------------------------------------------------------------------------

export function compositeScoreToRung(compositeScore: number): AiRung {
  if (compositeScore < 0.3) return "none";
  if (compositeScore < 0.5) return "prompt";
  if (compositeScore < 0.7) return "skill";
  if (compositeScore < 0.85) return "plugin";
  return "agent";
}

// ---------------------------------------------------------------------------
// lynchpin score formula (deterministic, post-LLM)
// lynchpinScore = 0.4*(userPain/5) + 0.4*(systemImpact/5) + 0.2*compositeScore
// ---------------------------------------------------------------------------

export function computeLynchpinScore(
  userPain: number,
  systemImpact: number,
  compositeScore: number,
): number {
  const raw =
    0.4 * (userPain / 5) +
    0.4 * (systemImpact / 5) +
    0.2 * compositeScore;
  return Math.min(1, Math.max(0, raw));
}

// ---------------------------------------------------------------------------
// Zod schema for LLM response (one scored step)
// ---------------------------------------------------------------------------

const ScoredStepLlmSchema = z.object({
  id: z.string(),
  // AI suitability
  aiSuitability: z.object({
    eloundouBeta: z.union([z.literal(0), z.literal(0.5), z.literal(1)]),
    predictability: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]),
    volume: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]),
    dataAvailability: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]),
    exceptionFrequency: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]),
    compositeScore: z.number().min(0).max(1),
  }),
  // Pain/impact
  systemImpact: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]),
  userPain: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]),
  // AI suggestion
  aiSuggestion: z
    .object({
      label: z.string().max(60),
      summary: z.string().max(150),
      artifactSeed: z.string().nullable(),
      permissionTier: z.enum(["T0", "T1", "T2", "T3"]),
    })
    .nullable(),
  // We accept evolutionNotes optionally — LLM may include it.
  evolutionNotes: z.string().nullable().optional(),
});

const ScoredStepResponseSchema = z.object({
  steps: z.array(ScoredStepLlmSchema).min(1),
});

// ---------------------------------------------------------------------------
// JSON schema for OpenAI response_format
// ---------------------------------------------------------------------------

const SCORE_JSON_SCHEMA = {
  name: "workflow_step_scores",
  strict: false,
  schema: {
    type: "object",
    properties: {
      steps: {
        type: "array",
        items: {
          type: "object",
          properties: {
            id: { type: "string" },
            aiSuitability: {
              type: "object",
              properties: {
                eloundouBeta: { type: "number" },
                predictability: { type: "integer" },
                volume: { type: "integer" },
                dataAvailability: { type: "integer" },
                exceptionFrequency: { type: "integer" },
                compositeScore: { type: "number" },
              },
              required: ["eloundouBeta", "predictability", "volume", "dataAvailability", "exceptionFrequency", "compositeScore"],
            },
            systemImpact: { type: "integer" },
            userPain: { type: "integer" },
            aiSuggestion: {
              oneOf: [
                {
                  type: "object",
                  properties: {
                    label: { type: "string" },
                    summary: { type: "string" },
                    artifactSeed: { type: ["string", "null"] },
                    permissionTier: { type: "string", enum: ["T0", "T1", "T2", "T3"] },
                  },
                  required: ["label", "summary", "artifactSeed", "permissionTier"],
                },
                { type: "null" },
              ],
            },
            evolutionNotes: { type: ["string", "null"] },
          },
          required: ["id", "aiSuitability", "systemImpact", "userPain", "aiSuggestion"],
        },
      },
    },
    required: ["steps"],
  },
};

// ---------------------------------------------------------------------------
// JSON parser (tolerates markdown fences)
// ---------------------------------------------------------------------------

function parseJson(text: string): unknown {
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/i, "");
  try {
    return JSON.parse(cleaned);
  } catch {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
    throw new Error("No JSON object found in OpenAI response");
  }
}

// ---------------------------------------------------------------------------
// Build a step-id lookup from the input steps
// ---------------------------------------------------------------------------

function buildStepIndex(steps: ActivityStep[]): Map<string, ActivityStep> {
  return new Map(steps.map((s) => [s.id, s]));
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Pass 2: score each decomposed step for AI suitability.
 *
 * Calls OpenAI chat.completions with json_schema response_format.
 * Applies deterministic rung cutoffs and lynchpin formula post-LLM.
 * Returns the same-length array with AI fields fully populated.
 * isLynchpin stays false — selectLynchpins() flips the top 1–3.
 *
 * Throws on LLM or parse failure — orchestrator catches and degrades.
 */
export async function scoreSteps(
  steps: ActivityStep[],
  ctx: ScoringContext,
): Promise<ActivityStep[]> {
  if (steps.length === 0) return steps;

  const reportedPain = ctx.reportedPain ?? 3;
  const model = process.env.OPENAI_SCORE_MODEL ?? "gpt-4o-mini";

  const systemPrompt = getScoreSystemPrompt();
  const userPrompt = getScoreUserPrompt({
    steps: steps.map((s) => ({
      id: s.id,
      title: s.title,
      origin: s.origin,
      valueClass: s.valueClass,
      jobRole: s.jobRole,
      estDurationMins: s.estDurationMins,
      frequencyPerMonth: s.frequencyPerMonth,
      currentTool: s.currentTool,
      inputs: s.inputs,
      outputs: s.outputs,
    })),
    challengeText: ctx.challengeText,
    goal: ctx.goal,
    painPath: ctx.painPath,
    reportedPain,
  });

  const completion = await openaiClient().chat.completions.create({
    model,
    temperature: 0.15,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    response_format: { type: "json_schema", json_schema: SCORE_JSON_SCHEMA },
  });

  const rawContent = completion.choices[0]?.message?.content ?? "";
  if (!rawContent) {
    throw new Error("[score-steps] OpenAI returned empty content");
  }

  let rawJson: unknown;
  try {
    rawJson = parseJson(rawContent);
  } catch (err) {
    throw new Error(
      `[score-steps] Failed to parse OpenAI JSON: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  const parsed = ScoredStepResponseSchema.safeParse(rawJson);
  if (!parsed.success) {
    throw new Error(
      `[score-steps] OpenAI response schema mismatch: ${parsed.error.message}`,
    );
  }

  const scoredById = new Map(parsed.data.steps.map((s) => [s.id, s]));
  const inputIndex = buildStepIndex(steps);

  // Merge LLM scores back onto the input steps.
  return steps.map((step) => {
    const scored = scoredById.get(step.id);
    const base = inputIndex.get(step.id) ?? step;

    if (!scored) {
      // LLM omitted this step — return base with sentinel defaults preserved.
      return base;
    }

    const compositeScore = scored.aiSuitability.compositeScore;
    const aiRung = compositeScoreToRung(compositeScore);
    const lynchpinScore = computeLynchpinScore(
      scored.userPain,
      scored.systemImpact,
      compositeScore,
    );

    return {
      ...base,
      aiSuitability: scored.aiSuitability,
      aiRung,
      aiSuggestion: scored.aiSuggestion,
      systemImpact: scored.systemImpact,
      userPain: scored.userPain,
      lynchpinScore,
      isLynchpin: false, // selectLynchpins() flips this
      evolutionNotes: scored.evolutionNotes ?? base.evolutionNotes ?? null,
    };
  });
}
