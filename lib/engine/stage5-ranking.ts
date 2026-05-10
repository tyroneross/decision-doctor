// PRD §6.2 Stage 5 — Ranking (TOPSIS-lite + minimax-regret).
// Computes deterministically from Stage 4 scores + Stage 3 weights, then asks
// the LLM for ranking rationale + ≥3 workload reducers.

import { callStage } from "@/lib/groq";
import type { Stage4OptionScore } from "./stage4-outranking";
import type { DecisionTemplate } from "./templates/types";

export interface Stage5Ranked {
  option: string;
  weightedScore: number; // 0..1
  rank: number; // 1 = best
}

export interface WorkloadReducerOut {
  type: "prompt" | "skill" | "plugin" | "mcp_tool" | "playbook";
  title: string;
  description: string;
  artifact: {
    promptText?: string;
    skillName?: string;
    pluginUrl?: string;
    mcpServer?: string;
    playbookSteps?: string[];
  };
  automationLevel: "user_executes" | "ai_assisted" | "fully_automated";
  coverage: "full_task" | "partial_task" | "task_setup";
  permission_tier: "T0" | "T1" | "T2" | "T3" | "T4" | "T5";
}

export interface Stage5Output {
  ranked: Stage5Ranked[];
  recommendationRationale: string; // 1-2 sentences
  robustOption: string; // minimax-regret pick
  robustWhy: string;
  workloadReducers: WorkloadReducerOut[];
  confidence: number; // 0-100, derived from top-1/top-2 margin
}

export async function runStage5Ranking(
  fields: Record<string, unknown>,
  scored: Stage4OptionScore[],
  weights: Record<string, number>,
  template: DecisionTemplate,
): Promise<{ output: Stage5Output; reasoning: string | null; tokensIn: number; tokensOut: number; latencyMs: number }> {
  const t0 = Date.now();

  // --- Deterministic TOPSIS-lite ranking ---
  const ranked: Stage5Ranked[] = scored
    .map((s) => {
      let weightedScore = 0;
      for (const [c, score] of Object.entries(s.scoresByCriterion)) {
        weightedScore += (weights[c] ?? 0) * score;
      }
      return { option: s.option, weightedScore, rank: 0 };
    })
    .sort((a, b) => b.weightedScore - a.weightedScore)
    .map((r, i) => ({ ...r, rank: i + 1 }));

  // --- Confidence from top-1/top-2 margin ---
  const top1 = ranked[0]?.weightedScore ?? 0;
  const top2 = ranked[1]?.weightedScore ?? 0;
  // Margin in [0..1] -> confidence in [50..100]; if all options tied, confidence = 50.
  const margin = Math.max(0, top1 - top2);
  const confidence = Math.min(100, Math.max(50, Math.round(50 + margin * 200)));

  // --- Deterministic minimax-regret robust option ---
  // For each option, max regret = max over criteria of (best_score_on_criterion - this_option_score_on_criterion).
  // Robust pick = arg-min over options of max-regret (excluding the recommended option if possible).
  const criteria = Object.keys(weights);
  const bestPerCrit: Record<string, number> = {};
  for (const c of criteria) {
    bestPerCrit[c] = Math.max(0, ...scored.map((s) => s.scoresByCriterion[c] ?? 0));
  }
  const maxRegrets = scored.map((s) => {
    const regrets = criteria.map((c) => (bestPerCrit[c] ?? 0) - (s.scoresByCriterion[c] ?? 0));
    return { option: s.option, maxRegret: Math.max(...regrets) };
  });
  // Pick lowest max-regret that's NOT the recommended option (if available).
  const recommended = ranked[0]?.option;
  const robustCandidate = [...maxRegrets]
    .sort((a, b) => a.maxRegret - b.maxRegret)
    .find((r) => r.option !== recommended) ?? maxRegrets[0];
  const robustOption = robustCandidate?.option ?? recommended ?? "";

  // --- Ask LLM for rationale + workload reducers ---
  const sys = `You are running Stage 5 of a 5-stage MCDA pipeline. The deterministic ranking is ALREADY done.
You ONLY return JSON. No prose outside the JSON.
Your job: write the recommendation rationale and propose at least 3 workload reducers — paste-ready prompts, playbooks, or known skill / plugin / MCP-tool references — that turn the recommendation into action for a solo practitioner. Each reducer must be concrete enough to execute today (ai_assisted or user_executes; never fully_automated in v1). Reducers should reduce the user's manual work, not just describe what to do.
Reducer types: "prompt" (paste-ready prompt), "playbook" (3-7 step plain-language sequence), "skill" (named Claude Code skill), "plugin" (URL), "mcp_tool" (server name).
Tone: calm-precision, no exclamation points, no "you must" / "always". Acknowledge it's a recommendation, not a command.
NEVER refer to PHI; reducers are about the practitioner's own admin / business workflow.`;

  const robustWhyPrompt = `Robust alternative (lowest max-regret across criteria) is: ${robustOption}.`;
  const user = `<template>${template.id}</template>
<intake>${JSON.stringify(fields)}</intake>
<weights>${JSON.stringify(weights)}</weights>
<ranked>${JSON.stringify(ranked.map((r) => ({ option: r.option, score: Number(r.weightedScore.toFixed(3)), rank: r.rank })))}</ranked>
${robustWhyPrompt}

Return JSON in this exact shape:
{
  "recommendationRationale": "<1-2 sentences naming top-1 + the criteria that drove it>",
  "robustWhy": "<1 sentence explaining when robust alt becomes better>",
  "workloadReducers": [
    {
      "type": "prompt|skill|plugin|mcp_tool|playbook",
      "title": "<short label>",
      "description": "<1-2 sentences>",
      "artifact": {
        "promptText": "<if type=prompt>",
        "skillName": "<if type=skill>",
        "pluginUrl": "<if type=plugin, https URL>",
        "mcpServer": "<if type=mcp_tool>",
        "playbookSteps": ["<step 1>", "<step 2>", ...]
      },
      "automationLevel": "user_executes|ai_assisted",
      "coverage": "full_task|partial_task|task_setup",
      "permission_tier": "T0|T1|T2|T3"
    }
  ]
}
Return AT LEAST 3 reducers.`;

  const { answer, reasoning, tokensIn, tokensOut } = await callStage({
    systemPrompt: sys,
    userPrompt: user,
    responseSchema: {},
    temperature: 0.3,
  });
  const parsed = safeJson(answer);

  let workloadReducers: WorkloadReducerOut[] = [];
  if (Array.isArray(parsed.workloadReducers)) {
    workloadReducers = (parsed.workloadReducers as WorkloadReducerOut[]).filter(
      (w) =>
        w &&
        typeof w.title === "string" &&
        typeof w.description === "string" &&
        typeof w.type === "string",
    );
  }
  // Ensure ≥3 by backfilling with deterministic defaults.
  while (workloadReducers.length < 3) {
    workloadReducers.push(defaultReducer(workloadReducers.length, recommended ?? template.candidates[0] ?? "this option"));
  }
  // Sanitize artifact and required fields.
  workloadReducers = workloadReducers.map((w) => sanitizeReducer(w));

  return {
    output: {
      ranked,
      recommendationRationale:
        typeof parsed.recommendationRationale === "string" && parsed.recommendationRationale.length > 0
          ? parsed.recommendationRationale
          : `${recommended} ranks first on weighted criteria.`,
      robustOption,
      robustWhy:
        typeof parsed.robustWhy === "string" && parsed.robustWhy.length > 0
          ? parsed.robustWhy
          : `${robustOption} has the lowest worst-case regret across all criteria.`,
      workloadReducers,
      confidence,
    },
    reasoning,
    tokensIn,
    tokensOut,
    latencyMs: Date.now() - t0,
  };
}

function defaultReducer(idx: number, recommended: string): WorkloadReducerOut {
  if (idx === 0) {
    return {
      type: "prompt",
      title: "Draft a patient-facing announcement",
      description: "Paste this into your favourite LLM to generate a calm announcement of the change.",
      artifact: {
        promptText: `Write a short, warm message I can send to my patients announcing this change: "${recommended}". Tone: calm, professional, no exclamation points. 4 sentences max. Keep it neutral about the reasons.`,
      },
      automationLevel: "ai_assisted",
      coverage: "partial_task",
      permission_tier: "T0",
    };
  }
  if (idx === 1) {
    return {
      type: "playbook",
      title: "30-day rollout checklist",
      description: "A short ordered checklist to roll the recommendation out without surprising patients or staff.",
      artifact: {
        playbookSteps: [
          "Day 0: write the announcement and your own internal one-pager.",
          "Day 1-7: tell anyone who needs to know first (partner, staff, key patients).",
          "Day 8-14: send the patient-facing announcement.",
          "Day 15-30: monitor cancellations, fill rate, and your own workload.",
          "Day 30: run a 10-minute review and decide whether to keep, adjust, or revert.",
        ],
      },
      automationLevel: "user_executes",
      coverage: "full_task",
      permission_tier: "T0",
    };
  }
  return {
    type: "playbook",
    title: "Reversibility plan",
    description: "A pre-written rollback path so you can change course without re-deciding from scratch.",
    artifact: {
      playbookSteps: [
        "Set a calendar reminder for 30 days from today titled \"Decision review\".",
        "List two metrics that would tell you to revert (e.g. fill rate < 80%, burnout up).",
        "If either trips, run the same template again with the new numbers and compare to today's recommendation.",
      ],
    },
    automationLevel: "user_executes",
    coverage: "task_setup",
    permission_tier: "T0",
  };
}

function sanitizeReducer(w: WorkloadReducerOut): WorkloadReducerOut {
  const allowedTypes = ["prompt", "skill", "plugin", "mcp_tool", "playbook"] as const;
  const allowedAutomation = ["user_executes", "ai_assisted", "fully_automated"] as const;
  const allowedCoverage = ["full_task", "partial_task", "task_setup"] as const;
  const allowedTiers = ["T0", "T1", "T2", "T3", "T4", "T5"] as const;
  const type = (allowedTypes as readonly string[]).includes(w.type) ? w.type : "playbook";
  const artifact = w.artifact ?? {};
  // Strip pluginUrl if not a valid http(s) URL.
  if (artifact.pluginUrl && !/^https?:\/\//.test(artifact.pluginUrl)) {
    delete artifact.pluginUrl;
  }
  return {
    type: type as WorkloadReducerOut["type"],
    title: w.title.slice(0, 120),
    description: w.description.slice(0, 600),
    artifact,
    automationLevel: (allowedAutomation as readonly string[]).includes(w.automationLevel)
      ? w.automationLevel
      : "user_executes",
    coverage: (allowedCoverage as readonly string[]).includes(w.coverage) ? w.coverage : "partial_task",
    permission_tier: (allowedTiers as readonly string[]).includes(w.permission_tier)
      ? w.permission_tier
      : "T0",
  };
}

function safeJson(s: string): Record<string, unknown> {
  try {
    return JSON.parse(s) as Record<string, unknown>;
  } catch {
    const m = s.match(/\{[\s\S]*\}/);
    if (m) try { return JSON.parse(m[0]) as Record<string, unknown>; } catch { /* */ }
    return {};
  }
}
