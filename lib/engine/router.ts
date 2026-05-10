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

// PRD v2 §LD-11 + user clarification 2026-05-10: SINGLE-MODE product. Every
// chat routes to the AI-leverage finder. Hiring / capacity / pricing
// questions are SECONDARY follow-ups that come AFTER the time-savings
// recommendation, not separate top-level flows.
//
// Practitioners describe their decisions in many ways ("I'm burnt out",
// "should I hire", "I waste 10 hours on charts", "find AI for my practice")
// — they all land in the AI-leverage week-audit. The follow-on hiring/pricing
// guidance gets surfaced ON the recommendation page after the AI tools stack
// is shown.
//
// Patterns retained but now purely diagnostic — they help the chat-orchestrator
// emit a more specific opening rationale ("This is about your patient load"
// vs "This is about hiring") but never change the destination template.
const TEMPLATE_PATTERNS = {
  capacity:
    /\b(find ai|audit (?:my )?week|free up (?:my )?(?:time|hours|week)|automate (?:my )?(?:workflow|admin|notes|comms)|streamline (?:my )?(?:workflow|practice|notes|admin)|cap intakes?|panel|caseload|patient load|burn(?:ed)? out|workload|too many patients|waitlist|see fewer|spend too much time on (?:notes|charting|comms|messaging|billing|admin)|patient (?:messaging|comms) eats|what ai (?:helps|tools|can)|hir(?:e|ing)|associate|second clinician|retir(?:e|ing|ement)|cap (?:new )?patients|raise (?:my )?(?:prices|rates))\b/i,
  pricing:
    /\b(raise (?:my )?(?:prices|rates)|cash[- ]pay|self[- ]pay|insurance panel|drop (?:a |my )?payer|reimbursement|fee schedule)\b/i,
  "admin-hire":
    /\b(hire (?:an? )?(?:admin|VA|virtual assistant|associate|biller)|outsource (?:my )?billing|admin help|front desk)\b/i,
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
      mode: "structured_enumerable",
      confidence: 0.5,
      templateMatch: "capacity",
      missingInfo: [],
      rationale:
        "Tell me about your week — even one sentence. I'll find AI tools that free hours.",
    };
  }

  // PRD v2 §LD-11: SINGLE-MODE PRODUCT. Every chat goes to the AI-leverage
  // template ("capacity" id). Patterns set the OPENING RATIONALE only — the
  // destination is always the same.
  // (Hank persona retest 2026-05-10: "hire vs cap vs retire" was matching
  // generic_structured patterns and ending at the placeholder; users describe
  // the same underlying time-pressure problem 100 different ways.)
  let rationale = "I'll ask a few quick questions about your week and find AI tools that free the most hours.";
  for (const [tplId, pat] of Object.entries(TEMPLATE_PATTERNS) as [
    keyof typeof TEMPLATE_PATTERNS,
    RegExp,
  ][]) {
    if (pat.test(m)) {
      const opening: Record<string, string> = {
        capacity: "Sounds like you're stretched thin. I'll ask about where your week goes and find AI tools that free the most hours.",
        pricing: "Pricing sits downstream of where your time goes — let me first find AI tools that free hours, then we can revisit pricing.",
        "admin-hire": "Hiring sits downstream of how much you can automate first. Let me find the AI tools that would free hours BEFORE you hire — usually you need fewer hours of help than you think.",
      };
      rationale = opening[tplId] ?? rationale;
      break;
    }
  }
  return {
    mode: "structured_enumerable",
    confidence: 0.95,
    templateMatch: "capacity", // single-mode: always route to the AI-leverage template
    missingInfo: [],
    rationale,
  };
}

// Legacy multi-mode classification kept for tests + future re-introduction
// of design-brief / values-map modes (deferred per PRD v2 §17). Not used by
// the live `routeMessage()` path.
export function classifyHeuristicLegacy(message: string): RouterOutput {
  const m = message.trim();
  if (m.length === 0) {
    return {
      mode: "generative_design",
      confidence: 0.0,
      templateMatch: null,
      missingInfo: [],
      rationale: "Empty message — need an opening description.",
    };
  }

  for (const [tplId, pat] of Object.entries(TEMPLATE_PATTERNS) as [
    keyof typeof TEMPLATE_PATTERNS,
    RegExp,
  ][]) {
    if (pat.test(m)) {
      const labelByTpl: Record<string, string> = {
        capacity: "your patient load",
        pricing: "your pricing",
        "admin-hire": "admin help",
      };
      return {
        mode: "structured_enumerable",
        confidence: 0.95,
        templateMatch: tplId,
        missingInfo: [],
        rationale: `This is about ${labelByTpl[tplId] ?? "this"}. I'll ask a few quick questions and walk you through the math.`,
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
      missingInfo: [],
      rationale:
        "This reads as a values question rather than a pick-one decision. I'll help you see what's at stake instead of trying to rank for you.",
    };
  }

  // 3. Generic structured (≥2 named options, no template)
  const optionScore = countNamedOptions(m);
  if (optionScore >= 1) {
    return {
      mode: "generic_structured",
      confidence: optionScore >= 2 ? 0.85 : 0.7,
      templateMatch: null,
      missingInfo: [],
      rationale:
        "You named some specific options. I'll ask a few questions about what matters to you, then rank them.",
    };
  }

  // 4. Generative design (no options, exploration verbs)
  const generativeHits = GENERATIVE_PATTERNS.filter((p) => p.test(m)).length;
  if (generativeHits > 0) {
    return {
      mode: "generative_design",
      confidence: 0.8,
      templateMatch: null,
      missingInfo: [],
      rationale:
        "Sounds like you're still figuring out what the options even are. I'll help you build a starting plan instead of forcing a ranking.",
    };
  }

  // 5. Short / nonsense / unrecognized input — DO NOT pretend to classify.
  // Personas 2026-05-10: "xyzzy" got classified at 0.85 — bug. We now
  // surface the clarifier honestly when nothing matched.
  const tooShort = m.split(/\s+/).length < 3;
  return {
    mode: "generative_design",
    confidence: tooShort ? 0.2 : 0.35,
    templateMatch: null,
    missingInfo: [],
    rationale:
      "I'm not sure I caught the shape of the decision yet — could you tell me which of these fits?",
    clarifyingQuestion: {
      text: "Which best describes what you're trying to do?",
      chips: [
        { value: "structured_enumerable", label: "Choose between specific options" },
        { value: "generative_design", label: "Figure out where to start" },
        { value: "values_dominant", label: "Think through a life or career question" },
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

CRITICAL RULES:
1. TOPSIS-style ranking on a values_dominant question is harmful. Bias toward values_dominant when in doubt about a life-stage question.
2. If the heuristic already matched a template (capacity / pricing / admin-hire), DO NOT override — confirm structured_enumerable. The template path is the highest-quality output the system has; refusing to use it on a known-good signal hurts the user.
3. If the message is gibberish (made-up words, single character, no recognizable English structure), return confidence ≤ 0.4. NEVER classify nonsense at high confidence — the chat will surface a clarifier instead.
4. Your rationale must be ONE complete sentence in plain English written FOR THE USER. NO words like "structured_enumerable", "TOPSIS", "MCDA", "template", "mode", "router". Translate concepts into plain language.

Return JSON: {"mode":"...", "confidence": 0-1, "rationale": "1 plain-English sentence the user will see"}`;

  const user = `Heuristic first-pass: ${JSON.stringify({
    mode: heuristic.mode,
    confidence: heuristic.confidence,
    rationale: heuristic.rationale,
  })}

User message:
"""
${message}
"""

Confirm or refine. Per rule 2 above: if the heuristic returned templateMatch:${heuristic.templateMatch ?? "null"}, you MUST keep mode=structured_enumerable. Per rule 3: if this looks like nonsense, return confidence ≤ 0.4.`;

  try {
    const { answer } = await callStage({
      systemPrompt: sys,
      userPrompt: user,
      responseSchema: {},
      temperature: 0.0,
    });
    const parsed = LLM_ROUTER_RESPONSE_SCHEMA.safeParse(safeJson(answer));
    if (!parsed.success) return heuristic;
    // GUARD: never let the LLM strip a template match. If heuristic matched a
    // template, force mode = structured_enumerable regardless of LLM verdict.
    const finalMode: DecisionMode = heuristic.templateMatch
      ? "structured_enumerable"
      : parsed.data.mode;
    // GUARD: also never let the LLM give nonsense high confidence. The system
    // prompt asks for ≤0.4 on gibberish; if the LLM disobeys, clamp here.
    // Heuristic returns confidence 0.2 for very-short input; trust that.
    const looksLikeGibberish = heuristic.confidence <= 0.3 && !heuristic.templateMatch;
    const finalConfidence = looksLikeGibberish
      ? Math.min(parsed.data.confidence, 0.45)
      : parsed.data.confidence;
    return {
      ...heuristic,
      mode: finalMode,
      confidence: finalConfidence,
      rationale: parsed.data.rationale,
      // If LLM is confident, the clarifying question becomes optional.
      clarifyingQuestion:
        finalConfidence >= 0.7 ? undefined : heuristic.clarifyingQuestion,
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
