// PRD §6.2 Stage 4 — Outranking (ELECTRE-lite). Score each surviving option
// per criterion (0..1), eliminate dominated alternatives.

import { callStage } from "@/lib/groq";
import type { DecisionTemplate } from "./templates/types";

export interface Stage4OptionScore {
  option: string;
  scoresByCriterion: Record<string, number>; // 0..1 each
}
export interface Stage4Eliminated {
  option: string;
  reason: string;
}
export interface Stage4Output {
  scored: Stage4OptionScore[];
  eliminated: Stage4Eliminated[];
}

export async function runStage4Outranking(
  fields: Record<string, unknown>,
  filteredOptions: string[],
  weights: Record<string, number>,
  template: DecisionTemplate,
): Promise<{ output: Stage4Output; reasoning: string | null; tokensIn: number; tokensOut: number; latencyMs: number }> {
  const t0 = Date.now();
  const criteriaIds = template.criteria.map((c) => c.id);
  const sys = `You are running Stage 4 of a 5-stage MCDA pipeline (ELECTRE-lite outranking).
You ONLY return JSON. No prose outside the JSON.
Job: score each surviving option from 0.0 to 1.0 on EACH criterion. 1.0 = best on this criterion for this user. Use intake signals for grounding. Then mark as ELIMINATED any option that is strictly dominated (every criterion score < at least one other option, no criterion better) — give a 1-sentence reason.
Be honest about tradeoffs; do not award all 0.8s.`;
  const user = `<template>${template.id}</template>
<intake>${JSON.stringify(fields)}</intake>
<weights>${JSON.stringify(weights)}</weights>
<criteria>${JSON.stringify(criteriaIds)}</criteria>
<options>${JSON.stringify(filteredOptions)}</options>

Return JSON in this exact shape:
{
  "scored": [
    {"option": "<option string>", "scoresByCriterion": { "<criterionId>": <0-1>, ... }}
  ],
  "eliminated": [{"option": "<option>", "reason": "<one sentence>"}]
}`;

  const { answer, reasoning, tokensIn, tokensOut } = await callStage({
    systemPrompt: sys,
    userPrompt: user,
    responseSchema: {},
    temperature: 0.2,
  });
  const parsed = safeJson(answer);
  const scored: Stage4OptionScore[] = Array.isArray(parsed.scored)
    ? (parsed.scored as Stage4OptionScore[]).filter((s) => typeof s?.option === "string" && s?.scoresByCriterion && typeof s.scoresByCriterion === "object")
    : filteredOptions.map((o) => ({
        option: o,
        scoresByCriterion: Object.fromEntries(criteriaIds.map((c) => [c, 0.5])),
      }));
  // Backfill any missing criterion with 0.5.
  for (const s of scored) {
    for (const c of criteriaIds) {
      if (typeof s.scoresByCriterion[c] !== "number" || !Number.isFinite(s.scoresByCriterion[c])) {
        s.scoresByCriterion[c] = 0.5;
      } else {
        s.scoresByCriterion[c] = Math.min(1, Math.max(0, s.scoresByCriterion[c] as number));
      }
    }
  }
  const eliminated: Stage4Eliminated[] = Array.isArray(parsed.eliminated)
    ? (parsed.eliminated as Stage4Eliminated[]).filter((e) => typeof e?.option === "string" && typeof e?.reason === "string")
    : [];
  return {
    output: { scored, eliminated },
    reasoning,
    tokensIn,
    tokensOut,
    latencyMs: Date.now() - t0,
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
