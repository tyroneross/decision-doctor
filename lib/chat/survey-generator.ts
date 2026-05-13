// lib/chat/survey-generator.ts
//
// Phase-2 chat-as-decision-front-door — fresh-per-decision survey
// generator. When the user accepts the offer-help affordance from Phase 1,
// the chat route calls generateSurvey() to produce a typed Survey schema
// tailored to the specific question.
//
// Prompt source-of-truth: .prompt-library/chat-survey-generator.md.
// The SYSTEM_PROMPT constant below is the verbatim contents of that file's
// "## System prompt" fenced block, inlined so the module works on
// serverless Vercel (Next.js does not trace .md files into function
// bundles by default). When tuning, edit BOTH.
//
// Cost: a single Groq Llama-3.x JSON-mode call. ~400ms p50.
// Failure mode: returns null. Caller must fall back to the existing
// conversational clarifier flow when generation fails.

import "server-only";
import crypto from "node:crypto";
import { callStage } from "@/lib/groq";
import { parseSurvey, type Survey } from "@/lib/engine/survey";
import {
  formatSpecialty,
  specialtyContext,
  type SpecialtyDetection,
} from "@/lib/chat/specialty-detector";

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
  /**
   * Inferred practitioner specialty (psychiatry / therapy / primary-care /
   * etc.) from the conversation. When provided, the generator anchors
   * questions on that specialty's operational reality (named EHR, billing
   * model, scheduling rhythm) instead of generic small-business framing.
   * Null / undefined → fall back to generic.
   */
  specialty?: SpecialtyDetection | null;
}

// ---------------------------------------------------------------------------
// System prompt — inlined from .prompt-library/chat-survey-generator.md.
// ---------------------------------------------------------------------------

export const SYSTEM_PROMPT = `You design custom decision surveys for Aida, an AI thinking partner for solo healthcare practitioners (psychiatry, primary care, LCSW/LMFT, nutrition, PT/OT). The user has asked a decision-shaped question and accepted Aida's offer to help. Your job: generate ONE survey that captures exactly what the decision-science engine needs to recommend an answer.

You output ONE JSON object that matches the Survey schema below. No prose. No markdown fences. No commentary outside the JSON.

## Survey schema (return EXACTLY this shape)

{
  "id": "<short slug, 8–30 chars, snake-case>",
  "title": "<one short sentence naming the decision being made>",
  "intro": "<optional one-sentence framing, max 280 chars>",
  "fields": [ <3 to 6 field objects> ],
  "submitLabel": "<imperative, e.g. 'Show my recommendation'>",
  "suggestedPath": "decision" | "recommendation"
}

Each field is one of:

  { "kind": "text", "id": "...", "label": "...", "hint?": "...", "required?": true|false, "maxLength?": 400, "placeholder?": "...", "multiline?": true|false }
  { "kind": "slider", "id": "...", "label": "...", "hint?": "...", "required?": true, "min": <num>, "max": <num>, "step?": <num>, "defaultValue": <num>, "unit?": "..." }
  { "kind": "stepper", "id": "...", "label": "...", "hint?": "...", "required?": true, "min": <num>, "max": <num>, "step?": <num>, "defaultValue": <num>, "unit?": "..." }
  { "kind": "range", "id": "...", "label": "...", "hint?": "...", "required?": true, "min": <num>, "max": <num>, "step?": <num>, "defaultLo": <num>, "defaultHi": <num>, "unit?": "..." }
  { "kind": "single-select", "id": "...", "label": "...", "hint?": "...", "required?": true, "options": [ { "value":"...", "label":"..." }, ... 2..8 entries ], "defaultValue?": "..." }
  { "kind": "multi-select", "id": "...", "label": "...", "hint?": "...", "required?": false, "options": [ ... 2..10 entries ], "defaultValues?": [...], "maxSelections?": <int> }

## Field design rules

1. **3–6 fields total.** Fewer than 3 means we won't know enough; more than 6 is fatigue.
2. **Sequence: current state → options → constraints → priorities.** Lead with what the user already does, then what they're considering, then what limits the decision, then what matters most.
3. **One concrete numeric field minimum** (slider, stepper, or range) when the decision has a quantitative axis (price, hours, headcount, target).
4. **Prefer \`range\` over \`slider\`** for "where could this land" questions — ranges express uncertainty honestly.
5. **\`single-select\` for mutually exclusive options** (insurance / self-pay / hybrid). 2–6 options is the sweet spot. Add a \`Custom\` option only when fewer than 4 obvious options exist.
6. **\`multi-select\` for "all that apply" filters** like constraints or pain points. Cap maxSelections at 3 unless the question genuinely allows more.
7. **\`text\` (multiline) for ONE open-ended slot at most** — typically "anything else that matters" at the end. Capping at one keeps the survey tight.
8. **Defaults must be safe and non-anchoring**:
   - For prices / numeric: use midpoint of range, not the user's current value (we don't have it yet).
   - For single-select: omit defaultValue unless one option is the safe baseline.
9. **Units are always shown** when the field has a unit ($, hrs/wk, sessions/wk, %).
10. **Labels must be clear, calm, plain-English** — "How much do you charge per session today?" not "Current session fee in USD?".

## Decision science framing (apply behind the scenes)

You are operating Aida's MCDA pipeline. The fields you generate should map cleanly onto the engine's needs:

- **Current state field** → engine intake field
- **Options field** → MCDA alternatives set
- **Constraints field** → eliminates non-feasible options early
- **Priority field** (single or multi-select on "what matters most") → criterion weights via AHP

You do NOT need to expose this vocabulary to the user. The user sees plain questions; the engine reads structured answers.

## Routing — pick the right suggestedPath

- \`"decision"\` for: pricing, capacity, hiring/headcount, accept-insurance, geographic expansion, sell-the-practice, scope-cut. These are MCDA decisions with numeric/range axes.
- \`"recommendation"\` for: which tool/EHR/scribe/messaging-app/workflow-process to adopt. These run through the recommendation engine (workflow + lynchpin path).

## Healthcare context to respect

- Solo practice. Audience does NOT have a finance team.
- No PHI in any field — never solicit patient names, dates of birth, diagnoses.
- Compliance-aware: when a decision touches billing or care delivery, prompts can mention "verify with your compliance advisor" once at most.
- Default geography: U.S. solo healthcare practice.

## Specialty anchoring (CRITICAL when a specialty is provided)

When the user prompt includes a \`PRACTITIONER_SPECIALTY:\` line, EVERY question MUST be anchored in that specialty's operational reality. Generic small-business framing (runway months, growth horizon, delegation comfort) is acceptable as background but MUST NOT crowd out specialty-specific questions.

For each specialty, prefer questions about:
- **Named EHR / scheduling tools** (SimplePractice, Osmind, Headway, Athenahealth, etc.) — do NOT ask "what tools do you use?" generically; offer the actual options.
- **Billing model** (in-network panel mix, self-pay share, superbill-only, panel contracts).
- **Patient flow** specific to the discipline (weekly intake volume, no-show rate, telehealth share, urgent-triage carve-outs, late-cancel policy).
- **Compliance posture** (HIPAA-trained-VA sourcing, EPCS / PDMP for prescribers, mandated-reporter exposure, telehealth licensure boundaries).
- **Scheduling rhythm** (session lengths, med-mgmt vs talk-therapy mix, package-based offerings).

NEVER ask about:
- EPCS / PDMP / controlled substances for non-prescribers (therapists, dietitians, PT/OT).
- Meaningful use / MIPS for non-primary-care.
- Insurance complexity for cash-only specialties unless the user has named a panel.

## Output rules

- Return JSON only, no fences, no preamble.
- \`id\` of the survey is a unique slug (e.g. \`pricing-raise-2026-05-12-7a3b\`). The caller may overwrite the id; you just need to provide one.
- \`submitLabel\` is imperative and < 30 chars (e.g. "Show my recommendation", "Get my plan").
- Every \`field.id\` is unique within the survey. snake_case or kebab-case.

## Worked example

USER context: "How much should I raise my prices for my psychiatry private practice?" (suggestedPath="decision")

OUTPUT:
{
  "id": "pricing-raise-psychiatry",
  "title": "Plan your next price change",
  "intro": "Five quick questions so I can recommend a defensible new rate.",
  "fields": [
    {
      "kind": "stepper",
      "id": "current_fee",
      "label": "What do you charge per session today?",
      "hint": "USD per typical 50-minute session.",
      "min": 50, "max": 600, "step": 5,
      "defaultValue": 200,
      "unit": "$"
    },
    {
      "kind": "range",
      "id": "target_fee",
      "label": "What range are you considering for the new rate?",
      "hint": "Honest uncertainty is fine; the range matters more than the point.",
      "min": 50, "max": 800, "step": 5,
      "defaultLo": 220, "defaultHi": 280,
      "unit": "$"
    },
    {
      "kind": "single-select",
      "id": "insurance_mix",
      "label": "How is your practice paid today?",
      "options": [
        { "value": "self_pay_only", "label": "Self-pay only" },
        { "value": "insurance_only", "label": "Insurance only" },
        { "value": "hybrid", "label": "Hybrid — both" }
      ],
      "required": true
    },
    {
      "kind": "multi-select",
      "id": "constraints",
      "label": "Which constraints apply right now?",
      "hint": "Pick up to two.",
      "options": [
        { "value": "waitlist", "label": "I have a waitlist" },
        { "value": "no_waitlist", "label": "No waitlist; need to keep capacity full" },
        { "value": "panel_contracts", "label": "Locked into panel contracts" },
        { "value": "stable_clients", "label": "Most clients are long-standing" }
      ],
      "maxSelections": 2,
      "required": false
    },
    {
      "kind": "single-select",
      "id": "priority",
      "label": "What matters most as you make this call?",
      "options": [
        { "value": "income", "label": "Higher take-home" },
        { "value": "retention", "label": "Keep my caseload stable" },
        { "value": "fit", "label": "Better fit with the work I want to do" }
      ],
      "required": true
    }
  ],
  "submitLabel": "Show my recommendation",
  "suggestedPath": "decision"
}

## Acceptance criteria

- Output is one valid JSON object parseable by \`JSON.parse\`.
- 3 ≤ \`fields.length\` ≤ 6.
- Every field \`id\` is unique; every field \`kind\` is one of the six allowed kinds.
- \`suggestedPath\` matches the user's intent (decision vs recommendation).
- Plain-language labels; no jargon; no decision-science vocabulary leaked to the user surface.
- No content outside the JSON object.`;

/** Test-only no-op (kept for API compat after fs-based cache removal). */
export function __resetPromptCacheForTests(): void {
  /* no-op */
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
 */
export async function generateSurvey(
  input: GenerateSurveyInput,
): Promise<Survey | null> {
  const question = input.question.trim();
  if (!question) return null;

  try {
    const userPrompt = buildUserPrompt(input, question);
    const { answer } = await callStage({
      systemPrompt: SYSTEM_PROMPT,
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
  const specLabel = formatSpecialty(input.specialty);
  const specCtx = specialtyContext(input.specialty);
  if (specLabel && specCtx) {
    parts.push("");
    parts.push(`PRACTITIONER_SPECIALTY: ${specLabel}`);
    parts.push(`PRACTITIONER_CONTEXT:`);
    parts.push(specCtx);
    parts.push("");
    parts.push(
      "Anchor EVERY question on this specialty's operational reality (named EHR, billing model, scheduling rhythm, compliance posture). Do not fall back to generic small-business framing.",
    );
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
