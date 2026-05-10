// PRD §6.2 Stage 2 — Constraint screen (veto). Eliminate candidates that
// violate hard constraints derived from intake (income floor, HIPAA touch, etc.).

import { callStage } from "@/lib/groq";
import type { Stage1Output } from "./stage1-values";
import type { DecisionTemplate } from "./templates/types";

export interface Stage2Eliminated {
  option: string;
  reason: string;
}
export interface Stage2Output {
  filtered: string[]; // surviving candidates
  eliminated: Stage2Eliminated[];
  constraintsApplied: string[]; // human-readable list
}

export async function runStage2Constraints(
  fields: Record<string, unknown>,
  values: Stage1Output,
  template: DecisionTemplate,
): Promise<{ output: Stage2Output; reasoning: string | null; tokensIn: number; tokensOut: number; latencyMs: number }> {
  const t0 = Date.now();
  const sys = `You are running Stage 2 of a 5-stage MCDA pipeline for a solo healthcare practitioner.
You ONLY return JSON. No prose outside the JSON object.
Job: apply HARD constraints to the candidate option set. Eliminate any candidate that materially violates a hard constraint visible from the intake fields. Be conservative — eliminate only when violation is clear, not when uncertain.
Hard constraints to consider when applicable:
- Income floor (if specified) cannot drop in the short term
- HIPAA exposure must match the user's stated tolerance
- Management bandwidth cannot exceed user's stated capacity
- Budget caps cannot be exceeded
Each elimination needs a 1-sentence reason in plain language naming the constraint and the violation.`;
  const user = `<template>${template.id}: ${template.title}</template>
<intake>${JSON.stringify(fields)}</intake>
<value_statement>${values.valueStatement}</value_statement>
<signals>${JSON.stringify(values.signals)}</signals>
<candidates>${JSON.stringify(template.candidates)}</candidates>

Return JSON in this exact shape:
{
  "filtered": ["<surviving candidate string>", ...],
  "eliminated": [{"option": "<eliminated candidate>", "reason": "<one sentence>"}],
  "constraintsApplied": ["<short label>", ...]
}`;

  const { answer, reasoning, tokensIn, tokensOut } = await callStage({
    systemPrompt: sys,
    userPrompt: user,
    responseSchema: {},
    temperature: 0.2,
  });
  const parsed = safeJson(answer);
  const filtered = Array.isArray(parsed.filtered) && parsed.filtered.length > 0
    ? (parsed.filtered as string[])
    : template.candidates;
  const eliminated = Array.isArray(parsed.eliminated)
    ? (parsed.eliminated as Stage2Eliminated[]).filter(
        (e) => typeof e?.option === "string" && typeof e?.reason === "string",
      )
    : [];
  const constraintsApplied = Array.isArray(parsed.constraintsApplied)
    ? (parsed.constraintsApplied as string[])
    : [];
  const output: Stage2Output = { filtered, eliminated, constraintsApplied };
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
