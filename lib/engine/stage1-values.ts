// PRD §6.2 Stage 1 — Values frame. Translate user intake into a value statement
// and a candidate-relevant signal map. Sets up Stage 2 constraint checks.

import { callStage } from "@/lib/groq";
import type { DecisionTemplate } from "./templates/types";

export interface Stage1Output {
  valueStatement: string;
  signals: Record<string, string>; // e.g. { burnoutRisk: "high", incomeFloorMet: "yes" }
}

export async function runStage1Values(
  fields: Record<string, unknown>,
  template: DecisionTemplate,
): Promise<{ output: Stage1Output; reasoning: string | null; tokensIn: number; tokensOut: number; latencyMs: number }> {
  const t0 = Date.now();
  const sys = `You are a decision analyst for solo healthcare practitioners.
You ONLY return JSON. No prose outside the JSON object.
Stage 1 of a 5-stage MCDA pipeline. Your job: extract a 1-sentence "value statement" that names what the user is optimizing for, and a "signals" map that summarises 4–8 normalized intake signals in plain phrases.
NEVER quote the user's intake fields verbatim. NEVER mention patient names or any identifying info — refuse and return {"valueStatement":"refused","signals":{"reason":"identifying info"}} if you see any.`;
  const user = `<template>${template.id}: ${template.title}</template>
<intake>${JSON.stringify(fields)}</intake>

Return JSON in this exact shape:
{ "valueStatement": "<one sentence>", "signals": { "<key>": "<short value>" } }`;

  const { answer, reasoning, tokensIn, tokensOut } = await callStage({
    systemPrompt: sys,
    userPrompt: user,
    responseSchema: {},
    temperature: 0.2,
  });
  const parsed = safeJson(answer);
  const output: Stage1Output = {
    valueStatement: typeof parsed.valueStatement === "string" ? parsed.valueStatement : "Optimize for the user's stated horizon.",
    signals: typeof parsed.signals === "object" && parsed.signals ? (parsed.signals as Record<string, string>) : {},
  };
  return { output, reasoning, tokensIn, tokensOut, latencyMs: Date.now() - t0 };
}

function safeJson(s: string): Record<string, unknown> {
  try {
    return JSON.parse(s) as Record<string, unknown>;
  } catch {
    // Try to extract first { ... } block
    const m = s.match(/\{[\s\S]*\}/);
    if (m) {
      try {
        return JSON.parse(m[0]) as Record<string, unknown>;
      } catch {
        /* fall through */
      }
    }
    return {};
  }
}
