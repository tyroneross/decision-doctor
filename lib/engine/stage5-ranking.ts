// PRD §6.2 Stage 5 — Ranking (TOPSIS) + minimax-regret robust alternative
// + LLM-generated rationale + workloadReducers (≥3 per A-12).
//
// Confidence formula (OQ-03): TOPSIS top-1 / top-2 closeness ratio, mapped
// to [0, 100]. Specifically:
//   confidence = round(50 + 50 * (margin / max_margin))
// where margin = closeness(top1) - closeness(top2), and max_margin is 1.
// Bounded to [0, 100]. Larger margin = larger confidence.

import "server-only";
import { callStage } from "@/lib/groq";
import type { Candidate, DecisionTemplate } from "@/lib/engine/types";
import type { DecisionInput, DecisionOutput } from "@/shared/schema";

export interface Stage5Output {
  ranked: Array<{ candidate: Candidate; closeness: number }>;
  topCandidate: Candidate;
  confidence: number; // 0..100
  robustCandidate: Candidate;
  robustWhy: string;
  rationale: string;
  workloadReducers: DecisionOutput["workloadReducers"];
  reasoning: string | null;
  tokensIn: number;
  tokensOut: number;
}

interface TopsisResult {
  ranked: Array<{ candidate: Candidate; closeness: number }>;
}

export async function runStage5Ranking(
  template: DecisionTemplate,
  dominantCandidates: Candidate[],
  weights: Record<string, number>,
  input: DecisionInput,
  values: string[],
): Promise<Stage5Output> {
  // Edge case: only one candidate left after Stages 2+4. Confidence is high
  // but the math is degenerate; skip TOPSIS and pin closeness=1.
  if (dominantCandidates.length === 1) {
    const only = dominantCandidates[0]!;
    const wl = await generateRecommendationCopy({
      template,
      input,
      topCandidate: only,
      runnerUp: undefined,
      values,
      confidence: 100,
    });
    return {
      ranked: [{ candidate: only, closeness: 1 }],
      topCandidate: only,
      confidence: 100,
      robustCandidate: only,
      robustWhy: "Only candidate remaining after constraint and outranking filtering.",
      rationale: wl.rationale,
      workloadReducers: wl.workloadReducers,
      reasoning: wl.reasoning,
      tokensIn: wl.tokensIn,
      tokensOut: wl.tokensOut,
    };
  }

  const topsis = computeTopsis(dominantCandidates, weights, template);
  const top = topsis.ranked[0]!.candidate;
  const second = topsis.ranked[1]?.candidate;
  const margin =
    topsis.ranked[0]!.closeness - (topsis.ranked[1]?.closeness ?? 0);
  // Confidence: scale margin (in [0, 1]) into [50, 100], floor at 25 if margin
  // is exactly 0 (means top-2 are tied — flag uncertainty).
  const confidence = Math.max(
    25,
    Math.min(100, Math.round(50 + 50 * margin)),
  );

  // Minimax-regret robust alternative: pick the option with the lowest
  // worst-case regret across criteria. Regret(c, k) = max(score[k]) - score[c, k].
  const robust = computeMinimaxRegret(dominantCandidates, weights);

  const wl = await generateRecommendationCopy({
    template,
    input,
    topCandidate: top,
    runnerUp: second,
    values,
    confidence,
  });

  return {
    ranked: topsis.ranked,
    topCandidate: top,
    confidence,
    robustCandidate: robust.candidate,
    robustWhy: robust.why,
    rationale: wl.rationale,
    workloadReducers: wl.workloadReducers,
    reasoning: wl.reasoning,
    tokensIn: wl.tokensIn,
    tokensOut: wl.tokensOut,
  };
}

// --- Pure deterministic math: TOPSIS ---
function computeTopsis(
  candidates: Candidate[],
  weights: Record<string, number>,
  template: DecisionTemplate,
): TopsisResult {
  const critIds = template.criteria.map((c) => c.id);
  // Normalize: divide each score column by its Euclidean norm.
  const norms: Record<string, number> = {};
  for (const cid of critIds) {
    const sumSq = candidates.reduce(
      (acc, cand) => acc + Math.pow(cand.scores[cid] ?? 0, 2),
      0,
    );
    norms[cid] = Math.sqrt(sumSq) || 1;
  }
  const weighted: Array<{ id: string; v: Record<string, number> }> = candidates.map(
    (cand) => {
      const v: Record<string, number> = {};
      for (const cid of critIds) {
        const w = weights[cid] ?? 0;
        v[cid] = ((cand.scores[cid] ?? 0) / norms[cid]!) * w;
      }
      return { id: cand.id, v };
    },
  );
  // Ideal best/worst (assuming all criteria are "max" — templates conform).
  const best: Record<string, number> = {};
  const worst: Record<string, number> = {};
  for (const cid of critIds) {
    const col = weighted.map((row) => row.v[cid]!);
    best[cid] = Math.max(...col);
    worst[cid] = Math.min(...col);
  }
  // Closeness coefficient.
  const ranked = weighted
    .map((row) => {
      let dPlus = 0;
      let dMinus = 0;
      for (const cid of critIds) {
        dPlus += Math.pow(row.v[cid]! - best[cid]!, 2);
        dMinus += Math.pow(row.v[cid]! - worst[cid]!, 2);
      }
      const dp = Math.sqrt(dPlus);
      const dm = Math.sqrt(dMinus);
      const closeness = dp + dm > 0 ? dm / (dp + dm) : 0;
      return {
        candidate: candidates.find((c) => c.id === row.id)!,
        closeness,
      };
    })
    .sort((a, b) => b.closeness - a.closeness);
  return { ranked };
}

// --- Pure deterministic math: minimax-regret ---
function computeMinimaxRegret(
  candidates: Candidate[],
  weights: Record<string, number>,
): { candidate: Candidate; why: string } {
  // For each criterion, the best score across candidates.
  const maxByCrit: Record<string, number> = {};
  for (const cand of candidates) {
    for (const [crit, sc] of Object.entries(cand.scores)) {
      if (!(crit in maxByCrit) || sc > maxByCrit[crit]!) maxByCrit[crit] = sc;
    }
  }
  // Each candidate's worst-case weighted regret = max over criteria of
  //   weight[k] * (maxByCrit[k] - cand.scores[k])
  let bestId: string | null = null;
  let bestWorst = Infinity;
  let bestExplanation = "";
  for (const cand of candidates) {
    let worst = 0;
    let worstCrit = "";
    for (const [crit, w] of Object.entries(weights)) {
      const regret = w * ((maxByCrit[crit] ?? 0) - (cand.scores[crit] ?? 0));
      if (regret > worst) {
        worst = regret;
        worstCrit = crit;
      }
    }
    if (worst < bestWorst) {
      bestWorst = worst;
      bestId = cand.id;
      bestExplanation = worstCrit
        ? `Smallest worst-case regret across criteria; biggest gap is on "${worstCrit}".`
        : "Smallest worst-case regret across all criteria.";
    }
  }
  const candidate = candidates.find((c) => c.id === bestId) ?? candidates[0]!;
  return { candidate, why: bestExplanation };
}

// --- LLM rationale + workloadReducers ---
const RATIONALE_SYSTEM_PROMPT = `You write the concise rationale and 3 paste-ready "workload reducers" that ship with a decision recommendation for a solo healthcare practitioner.

INPUT (JSON): the user's intake, the chosen recommendation (top option), the runner-up if any, the elicited values, and the confidence number.

OUTPUT (JSON object only — no prose):
{
  "rationale": "1–2 sentences explaining why this option ranked first. Refer to the user's stated values. Plain language. Confident but qualified — never 'you must' or 'you should always'.",
  "workloadReducers": [
    { /* exactly 3 items, see schema below */ }
  ]
}

Each workloadReducer (3 of them, each different "type") MUST conform to this schema:
{
  "type": "prompt" | "playbook" | "skill",
  "title": "<10-word title>",
  "description": "<one-sentence what-and-why>",
  "artifact": {
    "promptText": "<for type=prompt — paste-ready prompt the user can give to ChatGPT/Claude>",
    "playbookSteps": ["<for type=playbook — 3–5 short imperatives>"],
    "skillName": "<for type=skill — short identifier, lowercase-hyphenated>"
  },
  "automationLevel": "user_executes",
  "coverage": "full_task" | "partial_task" | "task_setup",
  "permission_tier": "T0" | "T1"
}

Rules:
- Output JSON only. No markdown fences. No commentary outside JSON.
- All 3 workloadReducers MUST have automationLevel="user_executes" (v1 ships text-only).
- Use exactly 3 different types from {prompt, playbook, skill}.
- artifact MUST contain exactly the field for its type (promptText / playbookSteps / skillName) and nothing else.
- Never reference PHI (no patient names, diagnoses, MRNs).
- Tone: action-oriented, specific to the recommendation.

AI-time-recovery requirement (NEW):
At least ONE of the 3 workloadReducers MUST be an AI-driven workflow whose specific aim is to reclaim clinical time the practitioner is currently spending on non-clinical work. Examples to inspire (do NOT copy verbatim — tailor to the recommendation):
  • A "prompt" that drafts patient comms (cancellation rebooking note, late-policy explainer, intake screening) so the practitioner doesn't write each from scratch.
  • A "prompt" that summarizes a referral letter or insurance EOB into a 4-line action plan.
  • A "playbook" for routing scheduling/triage to an AI assistant + a human review gate.
  • A "skill" reference name for a Claude Code or ChatGPT skill that automates a recurring weekly task (e.g., monthly revenue snapshot, no-show pattern detector).
This reducer's promptText MUST embed the user's intake context (e.g., "I run a [specialty] practice with [X] visits/week and lose ~[Y] hours to [pain-point]") and end with a clear output spec.

Permission tiers:
- T0 = paste-only (user copies into ChatGPT/Claude). Use for "prompt" reducers.
- T1 = simple tool/skill the user installs locally (no external write). Use for "skill" reducers.`;

interface RationaleArgs {
  template: DecisionTemplate;
  input: DecisionInput;
  topCandidate: Candidate;
  runnerUp: Candidate | undefined;
  values: string[];
  confidence: number;
}

interface RationaleResult {
  rationale: string;
  workloadReducers: DecisionOutput["workloadReducers"];
  reasoning: string | null;
  tokensIn: number;
  tokensOut: number;
}

async function generateRecommendationCopy(
  args: RationaleArgs,
): Promise<RationaleResult> {
  const userPrompt = JSON.stringify({
    decisionTopic: args.template.label,
    intake: args.input.fields,
    chosen: { label: args.topCandidate.label, description: args.topCandidate.description },
    runnerUp: args.runnerUp
      ? { label: args.runnerUp.label, description: args.runnerUp.description }
      : null,
    values: args.values,
    confidence: args.confidence,
  });

  const result = await callStage({
    systemPrompt: RATIONALE_SYSTEM_PROMPT,
    userPrompt,
    responseSchema: {},
    temperature: 0.4, // a touch more variety for the prose
  });

  const parsed = parseJsonObject(result.answer);
  const rationale =
    typeof parsed?.rationale === "string"
      ? parsed.rationale
      : `Recommended: ${args.topCandidate.label}. Best-balanced trade-off across your weighted criteria at ${args.confidence}% confidence.`;

  let workloadReducers: DecisionOutput["workloadReducers"] = [];
  if (Array.isArray(parsed?.workloadReducers)) {
    workloadReducers = parsed.workloadReducers
      .filter((w: unknown) => isValidWorkloadReducer(w))
      .slice(0, 3) as DecisionOutput["workloadReducers"];
  }
  // Ensure we ALWAYS ship ≥3 (T-03). Backfill from a deterministic skeleton if
  // the LLM under-delivers.
  while (workloadReducers.length < 3) {
    workloadReducers.push(fallbackReducer(args.topCandidate, workloadReducers.length));
  }

  return {
    rationale,
    workloadReducers,
    reasoning: result.reasoning,
    tokensIn: result.tokensIn,
    tokensOut: result.tokensOut,
  };
}

function isValidWorkloadReducer(w: unknown): boolean {
  if (typeof w !== "object" || w === null) return false;
  const r = w as Record<string, any>;
  if (!["prompt", "playbook", "skill", "plugin", "mcp_tool"].includes(r.type)) return false;
  if (typeof r.title !== "string" || typeof r.description !== "string") return false;
  if (typeof r.artifact !== "object" || r.artifact === null) return false;
  if (
    !["user_executes", "ai_assisted", "fully_automated"].includes(r.automationLevel)
  ) {
    // Force v1 contract (A-11).
    r.automationLevel = "user_executes";
  }
  if (
    !["full_task", "partial_task", "task_setup"].includes(r.coverage)
  ) {
    r.coverage = "partial_task";
  }
  if (!["T0", "T1", "T2", "T3", "T4", "T5"].includes(r.permission_tier)) {
    r.permission_tier = "T0";
  }
  return true;
}

function fallbackReducer(
  cand: Candidate,
  idx: number,
): DecisionOutput["workloadReducers"][number] {
  if (idx === 0) {
    return {
      type: "prompt",
      title: "Draft the message announcing this change",
      description: `Paste this into ChatGPT/Claude to draft the patient-facing note for "${cand.label}".`,
      artifact: {
        promptText: `Help me draft a short, calm patient-facing note announcing the following decision: "${cand.label}". Keep it under 120 words, professional, and avoid jargon. Audience: established patients in a solo healthcare practice.`,
      },
      automationLevel: "user_executes",
      coverage: "partial_task",
      permission_tier: "T0",
    };
  }
  if (idx === 1) {
    return {
      type: "playbook",
      title: "60-day rollout playbook",
      description: `Concrete steps to implement "${cand.label}" over the next 60 days.`,
      artifact: {
        playbookSteps: [
          "Week 1: tell your top-5 referral sources what's changing.",
          "Week 2: update your intake forms / scheduler to reflect the new posture.",
          "Week 3-4: monitor fill-rate, waitlist, or revenue — whichever criterion this decision hinges on.",
          "Week 8: re-run this decision with the new data and confirm the recommendation still holds.",
        ],
      },
      automationLevel: "user_executes",
      coverage: "full_task",
      permission_tier: "T0",
    };
  }
  return {
    type: "skill",
    title: "Re-run with updated assumptions",
    description: "Open Aida again in 60 days with the same template and updated numbers to confirm the recommendation still holds.",
    artifact: { skillName: "aida-revisit" },
    automationLevel: "user_executes",
    coverage: "task_setup",
    permission_tier: "T0",
  };
}

function parseJsonObject(text: string): Record<string, any> | null {
  if (!text) return null;
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/i, "");
  try {
    const parsed = JSON.parse(cleaned);
    return typeof parsed === "object" && parsed !== null
      ? (parsed as Record<string, any>)
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
