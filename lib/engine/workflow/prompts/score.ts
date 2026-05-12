// lib/engine/workflow/prompts/score.ts
//
// Pass 2 (OpenAI) system + user prompt templates.
//
// TODO: Iteration C4 — replace with prompt-library/*.md files authored via
// /prompt-builder:prompt-builder. These inline placeholders ship for C2;
// C4 replaces with pyramid-structured, calibrated prompts.

export interface ScoreUserPromptInput {
  steps: Array<{
    id: string;
    title: string;
    origin: string;
    valueClass: string;
    jobRole: string;
    estDurationMins: number | null;
    frequencyPerMonth: number | null;
    currentTool: string | null;
    inputs: string[];
    outputs: string[];
  }>;
  challengeText: string;
  goal: string | undefined;
  painPath: string;
  reportedPain: number;
}

export function getScoreSystemPrompt(): string {
  return `You are an AI-task analyst evaluating workflow steps for AI-adoption potential in a solo healthcare practice.

For each step, score the following fields:

SUITABILITY fields (all 1-5 integers, higher = more AI-suitable):
- predictability: How rule-based/predictable is this step? 1 = highly variable, 5 = fully predictable
- volume: How often does volume/frequency make AI worthwhile? 1 = rarely, 5 = constantly
- dataAvailability: How available/structured is the data? 1 = unstructured/absent, 5 = clean/structured
- exceptionFrequency: How rarely do exceptions occur? 1 = many exceptions, 5 = almost none
- eloundouBeta: Eloundou et al. LLM exposure. Use exactly: 0 (no exposure), 0.5 (LLM+software needed), or 1 (standalone LLM sufficient)
- compositeScore: 0.0–1.0 float. Formula: (predictability + volume + dataAvailability + exceptionFrequency) / 20 * (0.5 + 0.5 * eloundouBeta). Round to 2 decimal places.

PAIN/IMPACT fields (1-5 integers):
- userPain: How much pain does the practitioner feel on this step? 1 = low, 5 = very high
- systemImpact: If this step improves, how many other steps/outcomes benefit? 1 = isolated, 5 = high downstream impact

AI SUGGESTION fields:
- aiSuggestion: object with:
  - label: short label for the suggested AI approach (≤ 60 chars)
  - summary: one sentence describing what the AI would do (≤ 150 chars)
  - artifactSeed: a 1-2 sentence seed for the prompt/skill/plugin that would handle this step (or null if aiRung is "none")
  - permissionTier: "T0" (prompt), "T1" (skill), "T2" (plugin), "T3" (agent)

NOTE: Do NOT fill aiRung or lynchpinScore — those are computed deterministically after your response.
NOTE: Do NOT change any other fields from the input — preserve id, title, parentId, order, origin, inputs, outputs, etc. exactly.

Return exactly: { "steps": [ ...complete ActivityStep objects with all fields populated... ] }

JSON only. No prose.`;
}

export function getScoreUserPrompt(input: ScoreUserPromptInput): string {
  const stepsJson = JSON.stringify(
    input.steps.map((s) => ({
      id: s.id,
      title: s.title,
      origin: s.origin,
      valueClass: s.valueClass,
      jobRole: s.jobRole,
      estDurationMins: s.estDurationMins,
      frequencyPerMonth: s.frequencyPerMonth,
      currentTool: s.currentTool,
      inputs: s.inputs,
      outputs: s.outputs,
    })),
    null,
    2,
  );

  return `Pain path: ${input.painPath}
Challenge: ${input.challengeText}${input.goal ? `\nGoal: ${input.goal}` : ""}
Practitioner-reported pain (1–5): ${input.reportedPain}

Steps to score:
${stepsJson}

Score each step per the system instructions. Return the full steps array with all original fields plus your scores filled in.`;
}
