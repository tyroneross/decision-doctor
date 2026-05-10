// PRD §6.2 Stage 3 — Criteria weighting. Derive a normalized weight per criterion
// based on the user's intake signals (TTM-style, lightweight prompt vs full PAPRIKA).

import { callStage } from "@/lib/groq";
import type { Stage1Output } from "./stage1-values";
import type { DecisionTemplate } from "./templates/types";

export interface Stage3Output {
  weights: Record<string, number>; // criterion id -> 0..1, sums to ~1
  rationale: string;
}

export async function runStage3Weights(
  fields: Record<string, unknown>,
  values: Stage1Output,
  template: DecisionTemplate,
): Promise<{ output: Stage3Output; reasoning: string | null; tokensIn: number; tokensOut: number; latencyMs: number }> {
  const t0 = Date.now();
  const criteriaList = template.criteria.map((c) => `${c.id} (${c.label})`).join(", ");
  const sys = `You are running Stage 3 of a 5-stage MCDA pipeline.
You ONLY return JSON. No prose outside the JSON.
Job: assign normalized weights (each in [0,1], sum to 1.0) across the criteria for THIS user, given their intake signals and value statement. Higher weight = more decision-leverage for this user.
Tie-breaking heuristic: when in doubt, favour reversibility and risk-floor protection.`;
  const user = `<template>${template.id}: ${template.title}</template>
<intake>${JSON.stringify(fields)}</intake>
<value_statement>${values.valueStatement}</value_statement>
<criteria>${criteriaList}</criteria>

Return JSON in this exact shape:
{
  "weights": { "<criterionId>": <0-1>, ... },
  "rationale": "<one sentence naming what drove the heaviest weight>"
}`;

  const { answer, reasoning, tokensIn, tokensOut } = await callStage({
    systemPrompt: sys,
    userPrompt: user,
    responseSchema: {},
    temperature: 0.2,
  });
  const parsed = safeJson(answer);
  let weights: Record<string, number> = {};
  if (parsed.weights && typeof parsed.weights === "object") {
    for (const [k, v] of Object.entries(parsed.weights as Record<string, unknown>)) {
      const n = typeof v === "number" ? v : Number(v);
      if (Number.isFinite(n) && n >= 0) weights[k] = n;
    }
  }
  // Default to uniform if model returned garbage.
  if (Object.keys(weights).length === 0) {
    const uniform = 1 / template.criteria.length;
    for (const c of template.criteria) weights[c.id] = uniform;
  }
  // Normalize.
  const sum = Object.values(weights).reduce((a, b) => a + b, 0) || 1;
  weights = Object.fromEntries(Object.entries(weights).map(([k, v]) => [k, v / sum]));
  const output: Stage3Output = {
    weights,
    rationale: typeof parsed.rationale === "string" ? parsed.rationale : "Uniform weighting across criteria.",
  };
  return { output, reasoning, tokensIn, tokensOut, latencyMs: Date.now() - t0 };
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
