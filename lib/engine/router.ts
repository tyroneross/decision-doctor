// Stage 0 — Decision Mode Router.
//
// The chat-first entry needs to classify a free-form user message into one of
// four modes BEFORE any framework runs. The master report is emphatic that
// running TOPSIS on a values-dominant question is "actively harmful" — so this
// gate is load-bearing.
//
// Two-step routing:
//   1. Cheap deterministic heuristics (lexical + structural) — produces a
//      first-pass mode + confidence + a list of missing info to commit.
//   2. If confidence < 0.7, ask the LLM to confirm + return a clarifying
//      question chip-set the UI can render. The LLM never picks the mode
//      alone; it gets to disagree with the heuristic only with explicit
//      reasoning we surface to the user.
//
// Modes (per .build-loop/decisions/2026-05-10-research-digest.md):
//   structured_enumerable — 2+ named options, often matches a v1 template
//   generic_structured    — 2+ named options, no template match
//   generative_design     — exploring without options ("free up time")
//   values_dominant       — non-optimization (retire when, change careers)

import "server-only";
import { callStage } from "@/lib/groq";
import { z } from "zod";

export type DecisionMode =
  | "structured_enumerable"
  | "generic_structured"
  | "generative_design"
  | "values_dominant";

export interface RouterOutput {
  mode: DecisionMode;
  confidence: number; // 0..1
  templateMatch: "capacity" | "pricing" | "admin-hire" | null;
  missingInfo: string[]; // What's needed before commit / next pipeline step
  rationale: string; // 1 sentence — surfaced in chat for transparency
  clarifyingQuestion?: {
    text: string;
    chips: { value: DecisionMode; label: string }[];
  };
}

// ---------------------------------------------------------------------------
// Lexical signals — exact phrases / regexes per mode.
// Tuned from the digest's signal table; adjust when persona retests show drift.
// ---------------------------------------------------------------------------

const TEMPLATE_PATTERNS = {
  capacity: /\b(cap intakes?|panel|caseload|patient load|burn(?:ed)? out|workload|too many patients|waitlist|see fewer)\b/i,
  pricing: /\b(raise (?:my )?(?:prices|rates)|cash[- ]pay|self[- ]pay|insurance panel|drop (?:a |my )?payer|reimbursement|fee schedule)\b/i,
  "admin-hire": /\b(hire (?:an? )?(?:admin|VA|virtual assistant|associate|biller)|outsource (?:my )?billing|admin help|front desk)\b/i,
};

const ENUMERABLE_PATTERNS: RegExp[] = [
  /\bbetween\s+\w+\s+(?:and|or|vs\.?)\s+\w+\b/i,
  /\b(should I|do I)\s+(?:pick|choose|go with)\s+/i,
  /\b\w+\s+(?:vs\.?|versus|or)\s+\w+\b/i,
  /\bcompare\s+(?:these|the)\s+/i,
];

const GENERATIVE_PATTERNS: RegExp[] = [
  /\b(free up|streamline|automate|simplify|reduce|eliminate)\s+(?:my\s+)?(?:time|work|workflow|admin|hours)\b/i,
  /\b(where (?:do|should) I start|how (?:do|should) I)\b/i,
  /\b(want to (?:grow|expand|figure out|understand|learn))\b/i,
  /\b(ideas for|help me (?:figure|think|explore))\b/i,
];

const VALUES_PATTERNS: RegExp[] = [
  /\b(retire|retirement|close (?:the )?practice|leave clinical)\b/i,
  /\b(have (?:a )?kids?|family|second career|career change)\b/i,
  /\b(is this what I (?:want|should be doing)|should I keep|am I happy)\b/i,
  /\b(burn(?:ed|ing) out for years|done this for \d+ years)\b/i,
];

// ---------------------------------------------------------------------------
// Phase 1 — heuristic classification
// ---------------------------------------------------------------------------

function countNamedOptions(text: string): number {
  // Heuristic: count proper-noun-ish tokens around comparison keywords.
  // Catches "Stripe vs Square", "Acuity or SimplePractice".
  let count = 0;
  for (const pat of ENUMERABLE_PATTERNS) {
    if (pat.test(text)) count += 1;
  }
  return count;
}

export function classifyHeuristic(message: string): RouterOutput {
  const m = message.trim();
  if (m.length === 0) {
    return {
      mode: "generative_design",
      confidence: 0.0,
      templateMatch: null,
      missingInfo: ["a description of the decision you're facing"],
      rationale: "Empty message — need an opening description.",
    };
  }

  // 1. Template match (highest priority — fastest path)
  for (const [tplId, pat] of Object.entries(TEMPLATE_PATTERNS) as [
    keyof typeof TEMPLATE_PATTERNS,
    RegExp,
  ][]) {
    if (pat.test(m)) {
      const hasNumeric = /\b\d{1,3}(?:\.\d+)?\b/.test(m);
      return {
        mode: "structured_enumerable",
        // Need a numeric anchor to commit fully; without one we're at 0.6.
        confidence: hasNumeric ? 0.9 : 0.65,
        templateMatch: tplId,
        missingInfo: hasNumeric ? [] : ["a number anchoring your situation (e.g. hours/week, current rate, panel size)"],
        rationale: `Matches the ${tplId} template — ${
          hasNumeric ? "you gave a number we can ground in" : "we'd want one number to anchor it"
        }.`,
      };
    }
  }

  // 2. Values-dominant signals
  const valuesHits = VALUES_PATTERNS.filter((p) => p.test(m)).length;
  if (valuesHits > 0) {
    return {
      mode: "values_dominant",
      confidence: valuesHits >= 2 ? 0.85 : 0.7,
      templateMatch: null,
      missingInfo: ["the time horizon you're thinking about"],
      rationale:
        "This reads as a values question — we won't try to rank-and-pick; we'll help you map what's at stake.",
    };
  }

  // 3. Generic structured (≥2 named options, no template)
  const optionScore = countNamedOptions(m);
  if (optionScore >= 1) {
    return {
      mode: "generic_structured",
      confidence: optionScore >= 2 ? 0.85 : 0.7,
      templateMatch: null,
      missingInfo: ["one criterion that matters most to you"],
      rationale: "You named specific options — we'll rank them once we know what you're optimizing for.",
    };
  }

  // 4. Generative design (no options, exploration verbs)
  const generativeHits = GENERATIVE_PATTERNS.filter((p) => p.test(m)).length;
  if (generativeHits > 0) {
    return {
      mode: "generative_design",
      confidence: 0.8,
      templateMatch: null,
      missingInfo: ["one constraint that bounds the exploration (time, money, or what you won't change)"],
      rationale:
        "No specific options yet — we'll help you build a starting plan rather than rank choices.",
    };
  }

  // 5. Fallback — uncertain. Default to clarifying chip-question.
  return {
    mode: "generative_design",
    confidence: 0.4,
    templateMatch: null,
    missingInfo: ["whether you're choosing between options, exploring an open question, or weighing values"],
    rationale: "Couldn't classify confidently from this alone.",
    clarifyingQuestion: {
      text: "Quick check — which best describes what you're doing?",
      chips: [
        { value: "structured_enumerable", label: "Choosing between specific options" },
        { value: "generative_design", label: "Exploring how to approach a problem" },
        { value: "values_dominant", label: "Weighing a values / life question" },
      ],
    },
  };
}

// ---------------------------------------------------------------------------
// Phase 2 — LLM confirmation when heuristic confidence < 0.7
// ---------------------------------------------------------------------------

const LLM_ROUTER_RESPONSE_SCHEMA = z.object({
  mode: z.enum([
    "structured_enumerable",
    "generic_structured",
    "generative_design",
    "values_dominant",
  ]),
  confidence: z.number().min(0).max(1),
  rationale: z.string().max(280),
});

export async function confirmWithLLM(
  message: string,
  heuristic: RouterOutput,
): Promise<RouterOutput> {
  const sys = `You classify free-form decision questions from solo healthcare practitioners into one of four modes. You ONLY return JSON.

Modes:
- structured_enumerable: user gave 2+ named options to choose between, OR matches one of three templates (capacity / pricing / admin-hire). Output later: ranked recommendation.
- generic_structured: 2+ named options but no template match (e.g. "Stripe vs Square"). Output later: ranked recommendation with criteria the user confirms.
- generative_design: user is exploring without options ("free up 8 hours a week, where do I start?"). Output later: a 1-page brief, not a ranked list.
- values_dominant: non-optimization question (retire when, change careers, have kids). Output later: a values map — fundamental objectives + tensions, not a recommendation.

Critical: TOPSIS-style ranking on a values_dominant question is harmful. Bias toward values_dominant when in doubt about a life-stage question; bias toward generative_design when there are no options named.

Return JSON: {"mode":"...", "confidence": 0-1, "rationale": "1 sentence why"}`;

  const user = `Heuristic first-pass: ${JSON.stringify({
    mode: heuristic.mode,
    confidence: heuristic.confidence,
    rationale: heuristic.rationale,
  })}

User message:
"""
${message}
"""

Confirm or override. If you override, your confidence must be ≥ 0.7.`;

  try {
    const { answer } = await callStage({
      systemPrompt: sys,
      userPrompt: user,
      responseSchema: {},
      temperature: 0.0,
    });
    const parsed = LLM_ROUTER_RESPONSE_SCHEMA.safeParse(safeJson(answer));
    if (!parsed.success) return heuristic;
    return {
      ...heuristic,
      mode: parsed.data.mode,
      confidence: parsed.data.confidence,
      rationale: parsed.data.rationale,
      // If LLM is confident, the clarifying question becomes optional.
      clarifyingQuestion:
        parsed.data.confidence >= 0.7 ? undefined : heuristic.clarifyingQuestion,
    };
  } catch {
    return heuristic;
  }
}

// ---------------------------------------------------------------------------
// Public entry — heuristic + (conditional) LLM confirmation
// ---------------------------------------------------------------------------

export async function routeMessage(message: string): Promise<RouterOutput> {
  const h = classifyHeuristic(message);
  // Only call the LLM when heuristic isn't sure. Saves a Groq call on the
  // common path (template match + numeric anchor → 0.9).
  if (h.confidence >= 0.7) return h;
  return confirmWithLLM(message, h);
}

function safeJson(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    const m = s.match(/\{[\s\S]*\}/);
    if (m) try { return JSON.parse(m[0]); } catch { /* */ }
    return {};
  }
}
