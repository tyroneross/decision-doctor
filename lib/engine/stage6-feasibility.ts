// PRD §6.2 Stage 6 (F-08) — AI feasibility classification.
//
// Per the LLM-classifies-+-proposes / TS-computes-numbers invariant:
//   • LLM emits, for each WorkloadReducer:
//       { aiFeasibility, signals[], rationale }
//     — categorical + qualitative ONLY. No scores. No rankings.
//   • TS computes every number deterministically here:
//       feasibilityScore  ∈ [0,100]  (from the categorical tier + signals)
//       impactScore       ∈ [0,100]  (from estTimeSavingHrsPerWeek + coverage)
//       combinedScore     = round( (impactScore * feasibilityScore) / 100 )
//
// Determinism: `temperature: 0` + structured-output JSON. Same input → same
// classification, asserted by tests/feasibility.test.ts (T-11).

import "server-only";
import { callStage } from "@/lib/groq";
import {
  AiFeasibilitySchema,
  type AiFeasibility,
  type WorkloadReducer,
} from "@/shared/schema";
import { z } from "zod";

// ── Pre-LLM classification rubric (system prompt) ─────────────────────────
const SYSTEM_PROMPT = `You classify proposed AI workload-reducers by HOW the practitioner should ship each one. You emit categorical + qualitative output ONLY. You do NOT emit numbers — the calling system computes all scores deterministically from your categories.

For each reducer, emit:
{
  "id": <integer index 0..n-1 of the reducer in the input list>,
  "aiFeasibility": "skill" | "plugin" | "agent" | "human",
  "signals": [<1-3 short keywords explaining why this tier fits>],
  "rationale": "<one sentence, ≤200 chars, plain language>"
}

Tier rubric (use precisely — these prescribe the user's next step):

  "skill"   — Single-turn, copy-pasteable. The user pastes a prompt or installs
              a one-file Claude Code / Codex SKILL.md and the task is done.
              Examples: draft a patient cancellation note, summarize an EOB
              into a 4-line action plan, rewrite a referral letter.
              Ship today; lowest friction.

  "plugin"  — Multi-step but bounded. Needs a small directory layout
              (commands + maybe one MCP server) but no sustained autonomy.
              Examples: weekly revenue snapshot, no-show pattern detector,
              templated insurance pre-auth generator.
              Ship this week; moderate friction.

  "agent"   — Sustained autonomy across multiple sessions / data sources.
              Needs persistent state, periodic triggers, or external
              integrations (calendar, EHR, billing). Higher trust required.
              Examples: monitor practice metrics weekly and flag anomalies;
              orchestrate intake-to-scheduling-to-reminders end-to-end.
              Ship this quarter; high friction; needs human review gates.

  "human"   — Cannot or should not be AI-owned. Clinical judgment, regulated
              decisions, identity/values questions, irreversible commitments.
              Examples: diagnosis decisions, medication choices, ethics calls,
              practice-sale decisions.
              Surface explicitly so the user knows where AI does NOT belong.

Output protocol:
  • JSON only. No markdown fences. No prose.
  • Top-level: { "classifications": [ {...}, {...}, ... ] } with one entry per
    input reducer, in the same order.
  • Use only the four enum values for aiFeasibility.
  • signals[] — 1 to 3 short keywords (≤ 20 chars each).
  • rationale — ≤ 200 chars, no jargon.
  • If a reducer is genuinely ambiguous, prefer "skill" (lowest-friction
    default) and note the ambiguity in rationale.

Determinism: same input order produces the same output. Do not introduce
randomness or "alternative phrasings" — be repeatable.`;

// ── Zod schemas for the LLM output ────────────────────────────────────────
const ClassificationItemSchema = z.object({
  id: z.number().int().min(0),
  aiFeasibility: AiFeasibilitySchema,
  signals: z.array(z.string().max(40)).max(5).default([]),
  rationale: z.string().min(1).max(280),
});

const ClassificationsSchema = z.object({
  classifications: z.array(ClassificationItemSchema),
});

// ── Public API ────────────────────────────────────────────────────────────
export interface Stage6Output {
  // Enriched reducers (additive — original fields preserved).
  reducers: WorkloadReducer[];
  reasoning: string | null;
  tokensIn: number;
  tokensOut: number;
}

export async function runStage6Feasibility(
  reducers: WorkloadReducer[],
): Promise<Stage6Output> {
  if (reducers.length === 0) {
    return { reducers, reasoning: null, tokensIn: 0, tokensOut: 0 };
  }

  // 1. Ask the LLM for categorical + qualitative classifications.
  const userPrompt = JSON.stringify({
    reducers: reducers.map((r, i) => ({
      id: i,
      type: r.type,
      title: r.title,
      description: r.description,
      automationLevel: r.automationLevel,
      coverage: r.coverage,
    })),
  });

  let reasoning: string | null = null;
  let tokensIn = 0;
  let tokensOut = 0;
  let safeParsed: ReturnType<typeof ClassificationsSchema.safeParse> = {
    success: false,
    error: new z.ZodError([]),
  };

  try {
    const result = await callStage({
      systemPrompt: SYSTEM_PROMPT,
      userPrompt,
      responseSchema: {}, // any JSON object — we Zod-validate the shape ourselves
      temperature: 0, // T-11 determinism contract
    });
    reasoning = result.reasoning;
    tokensIn = result.tokensIn;
    tokensOut = result.tokensOut;
    const parsed = parseJsonObject(result.answer);
    safeParsed = ClassificationsSchema.safeParse(parsed);
  } catch {
    // Continue with deterministic defaultFeasibilityFor() below.
  }

  // Fallback if the LLM produces unparseable output: every reducer gets the
  // lowest-friction default ("skill") with a transparent rationale. Tests
  // assert presence, not LLM-quality.
  const lookup = new Map<number, z.infer<typeof ClassificationItemSchema>>();
  if (safeParsed.success) {
    for (const c of safeParsed.data.classifications) {
      if (c.id >= 0 && c.id < reducers.length) lookup.set(c.id, c);
    }
  }

  // 2. Deterministically compute numbers in TS.
  const enriched: WorkloadReducer[] = reducers.map((r, i) => {
    const classification = lookup.get(i) ?? {
      id: i,
      aiFeasibility: defaultFeasibilityFor(r),
      signals: ["fallback"],
      rationale:
        "Classifier output unavailable; defaulted to lowest-friction tier.",
    };

    const feasibilityScore = computeFeasibilityScore(classification.aiFeasibility);
    const impactScore = computeImpactScore(r);
    const combinedScore = Math.round((impactScore * feasibilityScore) / 100);

    return {
      ...r,
      aiFeasibility: classification.aiFeasibility,
      feasibilityRationale: classification.rationale,
      feasibilityScore,
      impactScore,
      combinedScore,
    };
  });

  return {
    reducers: enriched,
    reasoning,
    tokensIn,
    tokensOut,
  };
}

// ── Deterministic scoring (no LLM input) ──────────────────────────────────

// feasibilityScore — purely categorical → number lookup.
// Skill = 100 (ship today). Plugin = 80. Agent = 55. Human = 0 (not AI-owned).
export function computeFeasibilityScore(t: AiFeasibility): number {
  switch (t) {
    case "skill":
      return 100;
    case "plugin":
      return 80;
    case "agent":
      return 55;
    case "human":
      return 0;
  }
}

// impactScore — derived from time-back estimate + coverage breadth.
// Time-back signal (0-70): hrs/wk back, capped at 7 (more is suspect).
// Coverage signal (0-30): full_task=30, partial_task=18, task_setup=8.
// No LLM input — pure function of WorkloadReducer fields.
export function computeImpactScore(r: WorkloadReducer): number {
  const hrs =
    typeof r.estTimeSavingHrsPerWeek === "number" &&
    Number.isFinite(r.estTimeSavingHrsPerWeek)
      ? Math.max(0, Math.min(7, r.estTimeSavingHrsPerWeek))
      : 1; // assume 1 hr/wk if unspecified — credit for non-zero impact
  const timeBack = Math.round((hrs / 7) * 70);
  const coverage =
    r.coverage === "full_task" ? 30 : r.coverage === "partial_task" ? 18 : 8;
  return Math.min(100, timeBack + coverage);
}

// Defaults for missing classification.
function defaultFeasibilityFor(r: WorkloadReducer): AiFeasibility {
  if (r.type === "plugin" || r.type === "mcp_tool") return "plugin";
  if (r.type === "skill") return "skill";
  if (r.type === "playbook") return "human";
  return "skill"; // prompt type is the canonical "skill" tier
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
