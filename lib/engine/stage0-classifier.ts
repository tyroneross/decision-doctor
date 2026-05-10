// PRD §6.2 Stage 0 (F-11) — PEDE decision-type classifier.
//
// Pre-engine classifier. The LLM emits categorical tuples + rationale only:
//   { epistemicType, structuralType, modifiers[], rationale }
//
// Per docs/research/question-type-coverage-2026-05-10.md (Gartner+) and
// algorithm-problem-fit-2026-05-10.md (PEDE structural taxonomy).
//
// Routing the orchestrator does AFTER this stage:
//   • epistemicType ∈ {descriptive | diagnostic | predictive | optimization}
//       → decline-and-reframe (no engine run)
//   • epistemicType == "sequential"
//       → partial coverage (v1.1 weekly audit lands here)
//   • epistemicType == "decision_analysis" + structuralType == "VDD"
//       → values-map output (no recommendation.confidence)
//   • epistemicType == "decision_analysis" + structuralType ∈ {SED, EDD, TCLD, GDD}
//       → current engine pipeline
//
// Determinism contract: temperature: 0 + structured-output JSON. Same input
// → same classification across 5 repeats, asserted by tests/pede-classifier.

import "server-only";
import { callStage } from "@/lib/groq";
import {
  DecisionTypeSchema,
  EpistemicTypeSchema,
  StructuralTypeSchema,
  ModifierFlagSchema,
  type DecisionType,
} from "@/shared/schema";
import { z } from "zod";

const SYSTEM_PROMPT = `You are a decision-type classifier. You read one user message describing a question or decision and classify it across two orthogonal axes plus optional modifier flags. You output JSON only — no prose, no markdown fences.

AXIS 1 — epistemicType (what is the user asking?):
  "descriptive"        — "What is true? / What happened?" Characterize state.
                         Examples: "what ate the most time last week?",
                         "how much do I bill on average?"
  "diagnostic"         — "Why did this happen?" Counterfactual / causal.
                         Examples: "why is my no-show rate up?",
                         "why did Monday admin time creep up?"
  "predictive"         — "What will happen?" Forecast.
                         Examples: "what will Q3 revenue look like?",
                         "will my fill rate hold?"
  "decision_analysis"  — "Which option should I choose?" Discrete MCDM.
                         Examples: "should I raise rates?",
                         "should I hire a part-time VA?",
                         "should I take insurance or stay self-pay?",
                         "should I sell my practice or keep it?"
  "optimization"       — "What is the best possible outcome?" Continuous solve.
                         Examples: "what's the optimal price across all tiers?",
                         "what schedule maximizes utilization?"
  "sequential"         — "What should I do next over time?" Policy / multi-step.
                         Examples: "what's my next move this quarter?",
                         "what should my weekly review focus on?"

AXIS 2 — structuralType (what shape is the option space?):
  "SED"   — Structured Enumerable: a finite list of discrete options
            describable by known attributes.
            Example: "hire VA / hold / cap intakes / waitlist"
  "GDD"   — Generative Design: the option must be designed/built, not picked.
            Example: "design the right AI tool stack for my practice"
  "VDD"   — Values-Dominant: identity, life direction, irreversible meaning.
            Example: "sell vs keep the practice", "stay self-pay or take insurance"
  "EDD"   — Exploratory Discovery: option space + feature space both unknown.
            Example: "where should I start using AI in my practice?"
  "TCLD"  — Time-Critical / Low-Data: must act fast with incomplete info.
            Example: "should I take this urgent referral?"

MODIFIERS (zero or more):
  "HC"  — High consequence / low reversibility
  "SP"  — Sparse preferences (only k of d criteria matter)
  "GD"  — Group decision (spouse, partner, board)
  "MS"  — Multi-session (evolves over weeks)
  "UD"  — Unstructured documents present
  "NF"  — No fixed option set

OUTPUT (JSON object only):
{
  "epistemicType": <one of the six values>,
  "structuralType": <one of the five values>,
  "modifiers": [<zero or more flags>],
  "rationale": "<one sentence, ≤200 chars, plain language>"
}

Tie-breaking rules:
  • If the user is asking "should I X?" or "which of X / Y / Z?" — epistemic = decision_analysis.
  • If the question is forward-looking about a single irreversible life-direction choice (sell practice, change patient population, ethical-line decisions) — structural = VDD, modifier += HC.
  • If the user describes a past pattern they want explained — epistemic = diagnostic.
  • If they ask about future state of an outcome — epistemic = predictive.
  • Default structural for decision_analysis without obvious VDD signals: SED.

Be deterministic: same input → same classification. Do not add randomness or "alternative phrasings."`;

// Zod schema for the LLM output.
const ClassifierResponseSchema = z.object({
  epistemicType: EpistemicTypeSchema,
  structuralType: StructuralTypeSchema,
  modifiers: z.array(ModifierFlagSchema).max(6).default([]),
  rationale: z.string().min(1).max(400),
});

export interface Stage0Output {
  classification: DecisionType;
  reasoning: string | null;
  tokensIn: number;
  tokensOut: number;
}

export async function runStage0Classifier(
  userMessage: string,
): Promise<Stage0Output> {
  if (!userMessage || userMessage.trim().length === 0) {
    // Empty input: default to decision_analysis/SED so the engine still runs.
    return {
      classification: {
        epistemicType: "decision_analysis",
        structuralType: "SED",
        modifiers: [],
        rationale: "Empty input; defaulted to structured-enumerable decision.",
      },
      reasoning: null,
      tokensIn: 0,
      tokensOut: 0,
    };
  }

  const result = await callStage({
    systemPrompt: SYSTEM_PROMPT,
    userPrompt: userMessage.slice(0, 4000), // bound prompt size
    responseSchema: {},
    temperature: 0, // T-14 determinism contract
  });

  const parsed = parseJsonObject(result.answer);
  const validated = ClassifierResponseSchema.safeParse(parsed);

  if (!validated.success) {
    // Fallback — default to decision_analysis/SED so the engine still runs;
    // the engine's own routing handles the typical case correctly.
    return {
      classification: {
        epistemicType: "decision_analysis",
        structuralType: "SED",
        modifiers: [],
        rationale: "Classifier output unparseable; defaulted to SED.",
      },
      reasoning: result.reasoning,
      tokensIn: result.tokensIn,
      tokensOut: result.tokensOut,
    };
  }

  // Final Zod validation against the canonical schema.
  const classification = DecisionTypeSchema.parse(validated.data);

  return {
    classification,
    reasoning: result.reasoning,
    tokensIn: result.tokensIn,
    tokensOut: result.tokensOut,
  };
}

// ── Routing helpers (consumed by chat handler + orchestrator) ─────────────

/**
 * Should the classifier output trigger the decline-and-reframe path
 * (i.e., NOT call the engine)? True for diagnostic, predictive, optimization;
 * sequential is also out-of-scope for v1 unless we route to v1.1's weekly
 * audit (currently absent).
 */
export function shouldDeclineAndReframe(t: DecisionType): boolean {
  return (
    t.epistemicType === "diagnostic" ||
    t.epistemicType === "predictive" ||
    t.epistemicType === "optimization" ||
    t.epistemicType === "descriptive" ||
    t.epistemicType === "sequential"
  );
}

/**
 * Should we run the engine but suppress recommendation.confidence (VDD
 * values-dominant output)? True only when the question is decision_analysis
 * AND the option space is values-dominant.
 */
export function isVdd(t: DecisionType): boolean {
  return t.epistemicType === "decision_analysis" && t.structuralType === "VDD";
}

/**
 * Build the canonical decline-and-reframe message for a given epistemic
 * type. Pair with 2 reframe chips in the chat UI (see Chat.tsx).
 */
export function reframeMessageFor(t: DecisionType): {
  reply: string;
  chips: string[];
} {
  switch (t.epistemicType) {
    case "diagnostic":
      return {
        reply:
          "That's a diagnostic question — about explaining a past pattern. I'm scoped to forward decisions: capacity, pricing, admin help. What forward decision would benefit from understanding this pattern?",
        chips: [
          "Decide whether to cap intakes",
          "Decide whether to hire admin help",
        ],
      };
    case "predictive":
      return {
        reply:
          "That's a forecasting question. I'm scoped to forward decisions, not predictions. Want me to help you decide what to do given the range of plausible outcomes instead?",
        chips: [
          "Decide given high vs low projections",
          "Decide whether to raise rates now",
        ],
      };
    case "optimization":
      return {
        reply:
          "That's an optimization question — finding the single best value across many. I'm scoped to discrete decisions (capacity / pricing / admin). Want to decide between a few concrete options instead?",
        chips: [
          "Decide between three rate-change paths",
          "Decide whether to cap or expand capacity",
        ],
      };
    case "descriptive":
      return {
        reply:
          "That's a descriptive question — characterizing what's true now. I help with what to decide next. What forward decision is this question setting up?",
        chips: [
          "Decide what to change next month",
          "Decide capacity for the next quarter",
        ],
      };
    case "sequential":
      return {
        reply:
          "That's a multi-step policy question — what to do next over time. I'm scoped to one decision at a time today; the weekly-audit feature (planned) will own that. Want to decide the most pressing single move now?",
        chips: [
          "Decide my biggest move this month",
          "Decide capacity for the next quarter",
        ],
      };
    default:
      // decision_analysis (or unknown) — should never hit this branch.
      return {
        reply:
          "Let me make sure I'm in the right lane. Which of these feels closest: capacity, pricing, or admin help?",
        chips: ["Capacity", "Pricing", "Admin help"],
      };
  }
}

function parseJsonObject(text: string): Record<string, unknown> | null {
  if (!text) return null;
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/i, "");
  try {
    const parsed = JSON.parse(cleaned);
    return typeof parsed === "object" && parsed !== null
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]);
    } catch {
      return null;
    }
  }
}
