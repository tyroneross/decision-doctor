// lib/engine/workflow/decompose.ts
//
// Pass 1 — Workflow decomposition via Groq (Llama-3.1-70B).
//
// Converts a high-level recommended task title + challenge context into a flat
// ActivityStep[] array with HTA parent-child links (depth ≤ 3).
//
// AI-suitability fields (aiSuitability, aiRung, aiSuggestion, systemImpact,
// userPain, lynchpinScore, isLynchpin) are NOT scored here — sentinel defaults
// are returned and Pass 2 (score-steps.ts) fills them in.

import "server-only";
import { z } from "zod";
import { callStage } from "@/lib/groq";
import type { ActivityStep, PainPathId } from "@/lib/engine/types";
import { getDecomposeSystemPrompt, getDecomposeUserPrompt } from "./prompts/decompose";

// ---------------------------------------------------------------------------
// Input contract
// ---------------------------------------------------------------------------

export interface DecomposeInput {
  painPath: PainPathId;
  challengeText: string;
  goal: string | undefined;
  recommendedTaskTitle: string;
}

// ---------------------------------------------------------------------------
// Zod schema for Pass-1 partial shape
// (AI fields omitted — they arrive with sentinel defaults from the LLM)
// ---------------------------------------------------------------------------

const Pass1StepSchema = z.object({
  id: z.string().min(1).max(32),
  parentId: z.string().nullable(),
  order: z.number().int().min(0),
  title: z.string().min(1).max(200),
  origin: z.enum(["existing", "new"]),
  inputs: z.array(z.string()),
  outputs: z.array(z.string()),
  currentTool: z.string().nullable(),
  jobRole: z.string().min(1).max(120),
  dataNeeded: z.array(
    z.object({
      source: z.string(),
      sensitivity: z.enum(["low", "pii", "phi"]),
    }),
  ),
  integrations: z.array(z.string()),
  valueClass: z.enum(["value-add", "necessary-non-value-add", "waste"]),
  estDurationMins: z.number().positive().nullable(),
  frequencyPerMonth: z.number().positive().nullable(),
  // AI fields — Pass 1 returns sentinel defaults; we accept whatever shape.
  // We normalise them to sentinels after parse regardless.
  aiSuitability: z
    .object({
      eloundouBeta: z.union([z.literal(0), z.literal(0.5), z.literal(1)]),
      predictability: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]),
      volume: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]),
      dataAvailability: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]),
      exceptionFrequency: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]),
      compositeScore: z.number().min(0).max(1),
    })
    .optional()
    .default({
      eloundouBeta: 0,
      predictability: 3,
      volume: 3,
      dataAvailability: 3,
      exceptionFrequency: 3,
      compositeScore: 0,
    }),
  aiRung: z.enum(["none", "prompt", "skill", "plugin", "agent"]).optional().default("none"),
  aiSuggestion: z.any().optional().default(null),
  systemImpact: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]).optional().default(3),
  userPain: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]).optional().default(3),
  lynchpinScore: z.number().min(0).max(1).optional().default(0),
  isLynchpin: z.boolean().optional().default(false),
  evolutionNotes: z.string().nullable().optional().default(null),
});

const Pass1ResponseSchema = z.object({
  steps: z.array(Pass1StepSchema).min(1).max(15),
});

// ---------------------------------------------------------------------------
// JSON parser (tolerates markdown fences from the LLM)
// ---------------------------------------------------------------------------

function parseJson(text: string): unknown {
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/i, "");
  // Try direct parse first.
  try {
    return JSON.parse(cleaned);
  } catch {
    // Extract first JSON object/array if there's surrounding prose.
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (match) {
      return JSON.parse(match[0]);
    }
    throw new Error("No JSON object found in LLM response");
  }
}

// ---------------------------------------------------------------------------
// Sentinel normaliser — ensures AI fields are sentinel defaults regardless of
// what the LLM returned (Pass 2 will overwrite these properly).
// ---------------------------------------------------------------------------

function toSentinelDefaults(
  step: z.infer<typeof Pass1StepSchema>,
): ActivityStep {
  return {
    ...step,
    aiSuitability: {
      eloundouBeta: 0,
      predictability: 3,
      volume: 3,
      dataAvailability: 3,
      exceptionFrequency: 3,
      compositeScore: 0,
    },
    aiRung: "none",
    aiSuggestion: null,
    systemImpact: 3,
    userPain: 3,
    lynchpinScore: 0,
    isLynchpin: false,
    evolutionNotes: step.evolutionNotes ?? null,
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Pass 1: decompose a recommended workflow task into HTA ActivitySteps.
 *
 * Calls Groq via callStage(). Returns a flat array with parentId links.
 * AI suitability fields carry sentinel defaults — Pass 2 fills them.
 *
 * Throws on LLM failure or invalid response shape (orchestrator catches and
 * degrades to v1).
 */
export async function decomposeWorkflow(
  input: DecomposeInput,
): Promise<ActivityStep[]> {
  const systemPrompt = getDecomposeSystemPrompt();
  const userPrompt = getDecomposeUserPrompt({
    painPath: input.painPath,
    challengeText: input.challengeText,
    goal: input.goal,
    recommendedTaskTitle: input.recommendedTaskTitle,
  });

  const result = await callStage({
    systemPrompt,
    userPrompt,
    responseSchema: {},
    temperature: 0.2,
  });

  if (!result.answer) {
    throw new Error("[decompose] Groq returned an empty answer");
  }

  let rawJson: unknown;
  try {
    rawJson = parseJson(result.answer);
  } catch (err) {
    throw new Error(
      `[decompose] Failed to parse Groq JSON response: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  const parsed = Pass1ResponseSchema.safeParse(rawJson);
  if (!parsed.success) {
    throw new Error(
      `[decompose] Groq response failed schema validation: ${parsed.error.message}`,
    );
  }

  return parsed.data.steps.map(toSentinelDefaults);
}
