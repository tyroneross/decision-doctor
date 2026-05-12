// lib/chat/decision-detector.ts
//
// Chat decision-intent classifier (Phase 1 of the chat-as-decision-front-door
// feature). On every user message the chat route calls detectDecisionIntent()
// and, when confidence ≥ MIN_CONFIDENCE, surfaces an "offer help" affordance
// to the assistant message.
//
// The prompt lives in .prompt-library/chat-decision-detector.md — sourced at
// module load (sync fs.readFileSync, cached). Authored via the
// prompt-builder skill and persisted there so future tuning is tracked.
//
// Cost / latency: this is a Groq Llama-3.x JSON call. Roughly 200ms p50.
// Detection failure is swallowed silently — chat NEVER blocks on this.

import "server-only";
import fs from "node:fs";
import path from "node:path";
import { callStage } from "@/lib/groq";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type DetectionKind = "decision" | "not-decision";
export type SuggestedPath = "decision" | "recommendation";

export interface DecisionDetection {
  kind: DetectionKind;
  /** 0..1, calibrated per rule band (see prompt). */
  confidence: number;
  /** Non-null only when kind === "decision". */
  suggestedPath: SuggestedPath | null;
  /** One-sentence justification, cites the matched rule by number. */
  rationale: string;
}

/** Phase-1 threshold for surfacing the affordance to the user. */
export const MIN_CONFIDENCE = 0.6;

// ---------------------------------------------------------------------------
// Prompt loader — read once at module load, cache forever
// ---------------------------------------------------------------------------

const PROMPT_REL_PATH = ".prompt-library/chat-decision-detector.md";

let _systemPromptCache: string | null = null;

function loadSystemPrompt(): string {
  if (_systemPromptCache) return _systemPromptCache;
  const absPath = path.join(process.cwd(), PROMPT_REL_PATH);
  const raw = fs.readFileSync(absPath, "utf8");
  // The markdown file wraps the actual prompt in a fenced ``` block under
  // "## System prompt". Extract the contents of the first fenced block.
  const match = raw.match(/##\s+System prompt\s*\n+```\s*\n([\s\S]*?)\n```/);
  if (!match || !match[1]) {
    throw new Error(
      `[decision-detector] Could not extract system prompt from ${PROMPT_REL_PATH}`,
    );
  }
  _systemPromptCache = match[1].trim();
  return _systemPromptCache;
}

/** Test hook — drop the cached prompt so a re-read picks up edits in dev. */
export function __resetPromptCacheForTests(): void {
  _systemPromptCache = null;
}

// ---------------------------------------------------------------------------
// JSON parsing — tolerant of trailing whitespace / stray fence characters
// (llama-3.x quirks documented in the prompt's RISK_NOTES).
// ---------------------------------------------------------------------------

function parseDetection(raw: string): DecisionDetection | null {
  const trimmed = raw.trim();
  // Strip an optional fenced block if the model leaked one despite
  // response_format: json_object.
  const stripped = trimmed
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripped);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const obj = parsed as Record<string, unknown>;
  const kind = obj.kind;
  const confidence = obj.confidence;
  const suggestedPath = obj.suggestedPath;
  const rationale = obj.rationale;
  if (kind !== "decision" && kind !== "not-decision") return null;
  if (typeof confidence !== "number" || confidence < 0 || confidence > 1) {
    return null;
  }
  if (typeof rationale !== "string") return null;
  if (kind === "decision") {
    if (suggestedPath !== "decision" && suggestedPath !== "recommendation") {
      return null;
    }
    return { kind, confidence, suggestedPath, rationale };
  }
  // kind === "not-decision"
  if (suggestedPath !== null && suggestedPath !== undefined) return null;
  return { kind, confidence, suggestedPath: null, rationale };
}

// ---------------------------------------------------------------------------
// Public surface
// ---------------------------------------------------------------------------

/**
 * Classify a single user message. Returns the typed detection.
 *
 * Never throws — on any failure, returns a `not-decision` result with
 * confidence 0 and a `rationale` naming the failure mode. Callers should
 * treat detection as advisory; the chat path must not block on it.
 */
export async function detectDecisionIntent(
  userMessage: string,
): Promise<DecisionDetection> {
  const trimmed = userMessage.trim();
  if (!trimmed) {
    return {
      kind: "not-decision",
      confidence: 0,
      suggestedPath: null,
      rationale: "empty input",
    };
  }
  try {
    const systemPrompt = loadSystemPrompt();
    const { answer } = await callStage({
      systemPrompt,
      userPrompt: trimmed,
      responseSchema: { type: "object" }, // triggers response_format: json_object
      temperature: 0,
    });
    const parsed = parseDetection(answer);
    if (!parsed) {
      return {
        kind: "not-decision",
        confidence: 0,
        suggestedPath: null,
        rationale: "parse failure",
      };
    }
    return parsed;
  } catch (err) {
    if (process.env.NODE_ENV !== "production") {
      console.warn("[decision-detector] groq call failed:", err);
    }
    return {
      kind: "not-decision",
      confidence: 0,
      suggestedPath: null,
      rationale: "detector unavailable",
    };
  }
}

/**
 * Convenience: should we surface the offer-help affordance for this detection?
 * Phase 1 surfaces only on kind=decision AND confidence ≥ MIN_CONFIDENCE.
 */
export function shouldOfferHelp(d: DecisionDetection): boolean {
  return d.kind === "decision" && d.confidence >= MIN_CONFIDENCE;
}
