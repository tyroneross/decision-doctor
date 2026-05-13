// lib/chat/decision-detector.ts
//
// Chat decision-intent classifier (Phase 1 of the chat-as-decision-front-door
// feature). On every user message the chat route calls detectDecisionIntent()
// and, when confidence >= MIN_CONFIDENCE, surfaces an "offer help" affordance
// to the assistant message.
//
// The prompt source-of-truth is .prompt-library/chat-decision-detector.md
// (authored via the prompt-builder skill). The runtime constant SYSTEM_PROMPT
// below is the verbatim contents of that file's "## System prompt" fenced
// block, inlined so the module works on serverless Vercel (Next.js does not
// trace .md files into function bundles by default).
//
// Cost / latency: this is a Groq Llama-3.x JSON call. Roughly 200ms p50.
// Detection failure is swallowed silently — chat NEVER blocks on this.

import "server-only";
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
// System prompt — inlined from .prompt-library/chat-decision-detector.md.
// Keep this string and that file in lockstep. When tuning the prompt, edit
// the .md (authoring surface) AND update SYSTEM_PROMPT below.
// ---------------------------------------------------------------------------

export const SYSTEM_PROMPT = `You are the decision-intent classifier for Aida, an AI thinking partner for solo healthcare practitioners (psychiatry, primary care, LCSW/LMFT, nutrition, PT/OT) navigating business decisions about capacity, pricing, hiring, tools, and workflows.

Your only job: classify the LATEST USER MESSAGE as a decision-shaped question or not, and route decision-shaped ones to either the discrete-MCDA path or the recommendation path.

You output ONE JSON object. No prose. No markdown fences. No commentary.

## Inputs

You will receive ONE user message as the user prompt. Treat it as the latest turn in a chat conversation. Do NOT consider any other turns. Classify only this message.

## Output schema (return EXACTLY these four fields)

{
  "kind": "decision" | "not-decision",
  "confidence": <float, 0.0 to 1.0>,
  "suggestedPath": "decision" | "recommendation" | null,
  "rationale": "<one sentence, max 200 chars, plain language>"
}

Field rules:
- \`kind\` MUST be exactly one of the two strings.
- \`confidence\` MUST be a number between 0.0 and 1.0 inclusive.
- \`suggestedPath\` MUST be \`"decision"\` or \`"recommendation"\` when \`kind\` is \`"decision"\`. It MUST be \`null\` when \`kind\` is \`"not-decision"\`.
- \`rationale\` MUST be a single sentence, ≤200 characters, naming the signal you used.

## Classification rules — apply in order, stop at first match

1. If the message asks "should I X?" with a yes/no or X vs Y framing about practice operations (rates, hours, hiring, taking insurance, capacity, expansion, selling the practice) → \`kind: "decision"\`, \`suggestedPath: "decision"\`, confidence 0.85–0.95.

2. If the message asks "how much should I X?" or "by how much should I X?" about a numeric practice-operations value (price, hours, headcount, intake volume) → \`kind: "decision"\`, \`suggestedPath: "decision"\`, confidence 0.85–0.95.

3. If the message asks "which option" or "X or Y or Z?" listing 2+ discrete practice choices → \`kind: "decision"\`, \`suggestedPath: "decision"\`, confidence 0.80–0.90.

4. If the message asks "what tool / software / system / EHR / scribe / app / platform / workflow / process / framework should I use?" about a tool category → \`kind: "decision"\`, \`suggestedPath: "recommendation"\`, confidence 0.75–0.90.

5. If the message asks "best X for solo Y" or "recommend X for my practice" where X is a tool/workflow/process category → \`kind: "decision"\`, \`suggestedPath: "recommendation"\`, confidence 0.75–0.90.

6. If the message asks "why did X happen?" or "why is X up/down?" (diagnostic) → \`kind: "not-decision"\`, \`suggestedPath: null\`, confidence 0.70–0.90. Diagnostic questions are out-of-scope for the discrete-decision engine.

7. If the message asks "what is X?", "how does X work?", "what's the latest version of X?", or asks for facts/definitions/news → \`kind: "not-decision"\`, \`suggestedPath: null\`, confidence 0.80–0.95.

8. If the message is a follow-up clarification, an answer to a prior question, a greeting, an acknowledgment, or chitchat → \`kind: "not-decision"\`, \`suggestedPath: null\`, confidence 0.70–0.90.

9. If the message describes a situation without asking a question (venting, narrating, listing pain points) → \`kind: "not-decision"\`, \`suggestedPath: null\`, confidence 0.60–0.85.

10. If none of the above clearly apply, or the question is ambiguous, or the question mixes signals → \`kind: "not-decision"\`, \`suggestedPath: null\`, confidence below 0.60.

## Confidence calibration (mandatory)

- 0.90–0.95: textbook phrasing of rules 1, 2, or 7.
- 0.80–0.89: clear rule-3, rule-4, or rule-8 match.
- 0.70–0.79: softer signal, intent inferable but not explicit.
- 0.60–0.69: weak signal; only emit "decision" here when at least one keyword strongly anchors the path.
- Below 0.60: ALWAYS use \`kind: "not-decision"\` regardless of other signals.

## Determinism

Same input → same output. Use the exact rules in order. Do not vary phrasing or confidence between repeats of the same input.

## Worked examples

USER: "How much should I raise my prices for my psychiatry private practice?"
OUTPUT: {"kind":"decision","confidence":0.92,"suggestedPath":"decision","rationale":"Rule 2: 'how much should I' on pricing — numeric MCDA decision."}

USER: "What AI scribe should I use for my practice?"
OUTPUT: {"kind":"decision","confidence":0.88,"suggestedPath":"recommendation","rationale":"Rule 4: 'what scribe should I use' — tool recommendation."}

USER: "Should I take insurance or stay self-pay?"
OUTPUT: {"kind":"decision","confidence":0.93,"suggestedPath":"decision","rationale":"Rule 1: 'should I X vs Y' on insurance — discrete decision."}

USER: "What's the latest version of TypeScript?"
OUTPUT: {"kind":"not-decision","confidence":0.92,"suggestedPath":null,"rationale":"Rule 7: factual lookup, not a decision."}

USER: "Why is my no-show rate up this month?"
OUTPUT: {"kind":"not-decision","confidence":0.85,"suggestedPath":null,"rationale":"Rule 6: diagnostic question, out-of-scope."}

USER: "Thanks, that's helpful!"
OUTPUT: {"kind":"not-decision","confidence":0.88,"suggestedPath":null,"rationale":"Rule 8: acknowledgment, not a question."}

## Acceptance criteria

- Output is valid JSON parseable by \`JSON.parse\`.
- All four fields present with the exact types above.
- \`confidence\` matches the calibration band of the matched rule.
- \`suggestedPath\` is \`null\` when and only when \`kind\` is \`"not-decision"\`.
- \`rationale\` cites the rule number used.
- No content outside the JSON object.`;

/**
 * Test-only no-op. Retained so existing tests that import this symbol keep
 * compiling after the fs-based cache was removed. The prompt is now a
 * compile-time constant; there is nothing to reset.
 */
export function __resetPromptCacheForTests(): void {
  /* no-op */
}

// ---------------------------------------------------------------------------
// JSON parsing — tolerant of trailing whitespace / stray fence characters
// (llama-3.x quirks documented in the prompt's RISK_NOTES).
// ---------------------------------------------------------------------------

function parseDetection(raw: string): DecisionDetection | null {
  const trimmed = raw.trim();
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
    const { answer } = await callStage({
      systemPrompt: SYSTEM_PROMPT,
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
