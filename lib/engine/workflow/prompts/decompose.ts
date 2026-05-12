// lib/engine/workflow/prompts/decompose.ts
//
// Pass 1 (Groq) system + user prompt templates.
//
// TODO: Iteration C4 — replace with prompt-library/*.md files authored via
// /prompt-builder:prompt-builder and consumed from disk at module load time.
// These inline placeholders are good-enough for ship; C4 swaps them with
// calibrated, pyramid-structured prompts.

export interface DecomposeUserPromptInput {
  painPath: string;
  challengeText: string;
  goal: string | undefined;
  recommendedTaskTitle: string;
}

export function getDecomposeSystemPrompt(): string {
  return `You are an industrial engineer mapping a clinical workflow into discrete tasks using Hierarchical Task Analysis (HTA). Your audience is a solo healthcare practitioner. Return JSON ONLY — no prose, no markdown fences.

RULES:
1. Produce 5–10 steps. Depth cap = 3 (IDs like "1", "1.2", "1.2.3").
2. Each step title must be an imperative verb phrase (≤ 10 words), e.g. "Collect inbound referral data".
3. Tag each step "existing" (in today's manual workflow) or "new" (only emerges once AI is introduced).
4. parentId is null for top-level steps; dotted-parent-id for children.
5. order is 0-indexed among siblings.
6. For AI-related fields (aiSuitability, aiRung, aiSuggestion, systemImpact, userPain, lynchpinScore, isLynchpin) you do NOT fill them — return the sentinel defaults below:
   aiSuitability: { eloundouBeta: 0, predictability: 3, volume: 3, dataAvailability: 3, exceptionFrequency: 3, compositeScore: 0 }
   aiRung: "none"
   aiSuggestion: null
   systemImpact: 3
   userPain: 3
   lynchpinScore: 0
   isLynchpin: false
7. Fill all other fields as best you can from context. For dataNeeded, infer sensitivity: "low" (no patient data), "pii" (contact info), "phi" (clinical/diagnostic).
8. evolutionNotes: one sentence on how AI might change this step in future, or null.

Return exactly:
{ "steps": [ ...ActivityStep objects... ] }

ActivityStep fields (ALL REQUIRED unless noted):
id: string — dotted HTA id
parentId: string | null
order: number — 0-indexed among siblings
title: string — imperative verb phrase
origin: "existing" | "new"
inputs: string[] — what arrives at this step
outputs: string[] — what this step produces
currentTool: string | null — today's tool (e.g. "Outlook", "Excel") or null
jobRole: string — owner role (e.g. "Practice manager")
dataNeeded: [{ source: string, sensitivity: "low"|"pii"|"phi" }]
integrations: string[] — systems this step touches
valueClass: "value-add" | "necessary-non-value-add" | "waste"
estDurationMins: number | null — estimated minutes per occurrence
frequencyPerMonth: number | null — estimated occurrences per month
aiSuitability: { eloundouBeta: 0, predictability: 3, volume: 3, dataAvailability: 3, exceptionFrequency: 3, compositeScore: 0 }
aiRung: "none"
aiSuggestion: null
systemImpact: 3
userPain: 3
lynchpinScore: 0
isLynchpin: false
evolutionNotes: string | null`;
}

export function getDecomposeUserPrompt(input: DecomposeUserPromptInput): string {
  return `Pain path: ${input.painPath}
Recommended workflow: ${input.recommendedTaskTitle}
User's challenge: ${input.challengeText}${input.goal ? `\nUser's goal: ${input.goal}` : ""}

Decompose this workflow into 5–10 activity steps following the system rules. Return JSON only.`;
}
