// lib/chat/survey-generator.ts
//
// Phase-2 chat-as-decision-front-door — fresh-per-decision survey
// generator. When the user accepts the offer-help affordance from Phase 1,
// the chat route calls generateSurvey() to produce a typed Survey schema
// tailored to the specific question.
//
// The prompt lives in `.prompt-library/chat-survey-generator.md` and is
// authored via the prompt-builder skill. Loaded sync at module load,
// cached forever in process.
//
// Cost: a single Groq Llama-3.x JSON-mode call. ~400ms p50.
// Failure mode: returns null. Caller must fall back to the existing
// conversational clarifier flow when generation fails.

import "server-only";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { callStage } from "@/lib/groq";
import { parseSurvey, type Survey } from "@/lib/engine/survey";

// ---------------------------------------------------------------------------
// Input contract
// ---------------------------------------------------------------------------

export interface GenerateSurveyInput {
  /** The user's decision-shaped question (verbatim). */
  question: string;
  /** Routing from the decision-intent detector. */
  suggestedPath: "decision" | "recommendation";
  /** Optional one-sentence rationale from the detector (for context). */
  rationale?: string;
}

// ---------------------------------------------------------------------------
// Prompt loader
// ---------------------------------------------------------------------------

const PROMPT_REL_PATH = ".prompt-library/chat-survey-generator.md";
let _systemPromptCache: string | null = null;

function loadSystemPrompt(): string {
  if (_systemPromptCache) return _systemPromptCache;
  const absPath = path.join(process.cwd(), PROMPT_REL_PATH);
  const raw = fs.readFileSync(absPath, "utf8");
  const match = raw.match(/##\s+System prompt\s*\n+```\s*\n([\s\S]*?)\n```/);
  if (!match || !match[1]) {
    throw new Error(
      `[survey-generator] Could not extract system prompt from ${PROMPT_REL_PATH}`,
    );
  }
  _systemPromptCache = match[1].trim();
  return _systemPromptCache;
}

/** Test hook — drop the cached prompt. */
export function __resetPromptCacheForTests(): void {
  _systemPromptCache = null;
}

// ---------------------------------------------------------------------------
// JSON parsing — tolerant of fenced output (llama-3.x quirk)
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
 * Generate a Survey from a decision-shaped user question.
 *
 * Returns null on any failure — caller falls back to the existing
 * conversational clarifier flow. NEVER throws.
 *
 * The returned Survey ALWAYS has a freshly-stamped `id` that combines the
 * model's slug with a short random suffix so two surveys from similar
 * questions are still distinguishable in telemetry.
 */
export async function generateSurvey(
  input: GenerateSurveyInput,
): Promise<Survey | null> {
  const question = input.question.trim();
  if (!question) return null;

  try {
    const systemPrompt = loadSystemPrompt();
    const userPrompt = buildUserPrompt(input, question);
    const { answer } = await callStage({
      systemPrompt,
      userPrompt,
      responseSchema: { type: "object" }, // triggers response_format: json_object
      temperature: 0.2,
    });
    const parsedJson = parseJson(answer);
    if (!parsedJson) return null;

    // Force the suggestedPath to match the detector's classification even
    // if the model picked differently. The detector is the source of truth
    // for routing.
    if (parsedJson && typeof parsedJson === "object") {
      (parsedJson as Record<string, unknown>).suggestedPath = input.suggestedPath;
    }

    const survey = parseSurvey(parsedJson);
    if (!survey) return null;

    // Stamp a fresh id with a random suffix so re-runs are distinguishable.
    return {
      ...survey,
      id: stampId(survey.id),
    };
  } catch (err) {
    if (process.env.NODE_ENV !== "production") {
      console.warn("[survey-generator] groq call failed:", err);
    }
    return null;
  }
}

function buildUserPrompt(
  input: GenerateSurveyInput,
  question: string,
): string {
  const parts = [
    `User question: "${question}"`,
    `Detector classification: ${input.suggestedPath}`,
  ];
  if (input.rationale) {
    parts.push(`Detector rationale: ${input.rationale}`);
  }
  parts.push(
    "Generate one survey that captures what the decision-science engine needs to recommend an answer.",
  );
  return parts.join("\n");
}

function stampId(base: string): string {
  const suffix = crypto.randomBytes(3).toString("hex"); // 6 hex chars
  const trimmed = base.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 40);
  return trimmed ? `${trimmed}-${suffix}` : `survey-${suffix}`;
}
