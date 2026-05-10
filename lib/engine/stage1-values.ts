// PRD §6.2 Stage 1 — Values extraction (VFT — Value-Focused Thinking).
//
// LLM role: read the practitioner's intake and surface the 1–3 underlying values
// that should weight the decision. This is the only place v1 lets the LLM
// influence weights, and it does so by re-balancing the template's defaults —
// it never invents new criteria. That keeps "the math" auditable.
//
// Output: an adjusted weight map (criterionId -> weight, normalized to sum=1)
// plus a short rationale string for the methodTrace.

import "server-only";
import { callStage } from "@/lib/groq";
import type { DecisionInput } from "@/shared/schema";
import type { DecisionTemplate } from "@/lib/engine/types";

export interface Stage1Output {
  adjustedWeights: Record<string, number>;
  values: string[]; // 1–3 short value statements e.g. "burnout protection"
  rationale: string;
  reasoning: string | null;
  tokensIn: number;
  tokensOut: number;
}

const SYSTEM_PROMPT = `You analyze a solo healthcare practitioner's intake to identify which decision criteria matter most to *this* user, *this* time.

You are given:
- A decision template with criteria (id + label + defaultWeight).
- The user's intake (categorical + numeric, no PHI).

Return a JSON object with exactly these fields:
- "values": 1–3 short value statements (≤6 words each). Phrases the user would recognize, e.g. "burnout protection", "patient access", "cash flow".
- "weightAdjustments": object mapping criterion id -> a number in [0.5, 2.0]. Multiplied by defaultWeight to get the new weight (the orchestrator normalizes after).
- "rationale": 1 sentence explaining the adjustment in plain language.

Constraints:
- Output JSON only. No prose outside the JSON.
- Do NOT invent criterion ids — only use the ids provided.
- Do NOT include any user identifier in your output.

Example response:
{"values":["burnout protection","sustainability"],"weightAdjustments":{"sustainability":1.4,"revenue":0.8},"rationale":"User reports depleted energy; sustainability outweighs revenue this cycle."}`;

export async function runStage1Values(
  input: DecisionInput,
  template: DecisionTemplate,
): Promise<Stage1Output> {
  const userPrompt = JSON.stringify({
    template: {
      id: template.id,
      label: template.label,
      criteria: template.criteria.map((c) => ({
        id: c.id,
        label: c.label,
        description: c.description,
        defaultWeight: c.defaultWeight,
      })),
    },
    intake: input.fields,
  });

  const result = await callStage({
    systemPrompt: SYSTEM_PROMPT,
    userPrompt,
    responseSchema: {}, // any JSON object — we validate the shape ourselves
    temperature: 0.2,
  });

  // Defensive parse — LLM may emit pre-amble despite instructions.
  const parsed = parseJsonObject(result.answer);

  const adjustments: Record<string, number> = {};
  for (const c of template.criteria) {
    const raw = parsed?.weightAdjustments?.[c.id];
    const factor =
      typeof raw === "number" && Number.isFinite(raw)
        ? Math.max(0.5, Math.min(2.0, raw))
        : 1.0;
    adjustments[c.id] = c.defaultWeight * factor;
  }
  const sum = Object.values(adjustments).reduce((a, b) => a + b, 0) || 1;
  const adjustedWeights: Record<string, number> = {};
  for (const id of Object.keys(adjustments)) {
    adjustedWeights[id] = adjustments[id]! / sum;
  }

  const values = Array.isArray(parsed?.values)
    ? parsed.values.filter((v: unknown): v is string => typeof v === "string").slice(0, 3)
    : [];
  const rationale =
    typeof parsed?.rationale === "string"
      ? parsed.rationale
      : "Default weights retained — no adjustment from intake.";

  return {
    adjustedWeights,
    values,
    rationale,
    reasoning: result.reasoning,
    tokensIn: result.tokensIn,
    tokensOut: result.tokensOut,
  };
}

// Tiny tolerant parser — accepts a bare JSON object or one wrapped in code fences.
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
    // Last-ditch: extract first {...} block
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]);
    } catch {
      return null;
    }
  }
}
