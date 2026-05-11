// Stage 8 — Adoption-pathway promotion classifier.
//
// Maps a recommended task + pain path + scoring context to a typed
// AdoptionPathway array (one entry per rung: prompt, checklist, skill,
// plugin, agent). The picker (U4 / <AdoptionPathwayPicker>) renders only
// rungs with state !== "not-recommended".
//
// Engine-gated per .build-loop/memory/decision_engine_gated_promotion.md.
// No Builder Hub. No /app/builders. Seeds are server-side only.
//
// Implementation strategy:
//   1. Single Groq call with a fixed rubric prompt.
//   2. If Groq call fails or returns invalid JSON → deterministic heuristics.
//   Deterministic heuristics inspect task keywords to assign rung states.

import "server-only";
import { callStage } from "@/lib/groq";
import type { AdoptionPathway, AdoptionPathwayRung } from "@/lib/engine/types";
import type { PainPathId } from "@/lib/engine/types";

// ---------------------------------------------------------------------------
// Input shape
// ---------------------------------------------------------------------------

export interface Stage8Input {
  /** The recommended task title (e.g. "Draft patient follow-up emails"). */
  task: string;
  /** Optional one-sentence description of the task. */
  taskDescription?: string;
  /** The pain path this recommendation sits within. */
  painPath: PainPathId;
  /** Scoring context forwarded from the recommendation engine. */
  scoring: {
    /** 0-100 overall recommendation confidence. */
    confidence: number;
    /** Why this task was selected. */
    rationale: string;
  };
}

// ---------------------------------------------------------------------------
// System prompt for the Groq call
// ---------------------------------------------------------------------------

const STAGE8_SYSTEM_PROMPT = `You are the adoption-pathway classifier for Decision Doctor, an AI deployment strategist for solo healthcare practitioners.

Given a recommended AI task for a solo healthcare practitioner, classify which adoption-pathway rungs best fit the task. Return ONLY JSON.

Rungs (evaluate each independently):
- "prompt"     — A paste-ready prompt the practitioner uses in ChatGPT/Claude. Best for single-step drafting, summarizing, or extracting tasks.
- "checklist"  — A structured checklist the practitioner follows each time. Best for multi-step recurring workflows that benefit from guided steps but don't need automation.
- "skill"      — A Claude Code skill (installable; runs in their IDE/CLI). Best for tasks that repeat often and involve file or data manipulation. Requires some technical comfort.
- "plugin"     — A Claude Code plugin (deployable; can integrate with external systems). Best for tasks that need persistent state, webhooks, or integration with third-party tools.
- "agent"      — An autonomous Claude agent. Best for complex multi-session workflows with branching decisions.

Assign each rung one of these states:
- "recommended"    — Strong fit. The rung is the best first step for this task.
- "optional"       — Could work, but is not the ideal first step. Show as secondary option.
- "not-recommended" — Poor fit. Do not surface this rung.

Rules:
- At most 2 rungs should be "recommended". (Engine-gated; avoid decision overload.)
- At least 1 rung MUST be "recommended". Every task has a best fit.
- "prompt" should be "recommended" for single-step drafting, summarizing, generating, extracting, or translating tasks.
- "checklist" should be "recommended" for tasks that are multi-step, recurring, or procedural.
- "skill" should be "recommended" only when: (a) the task repeats multiple times per week, AND (b) involves structured data input/output.
- "plugin" should be "recommended" only when integration with external systems (scheduling, EHR, billing) is a natural next step.
- "agent" should be "recommended" only when the task involves decision trees, multiple tool uses, or multi-session workflows.
- If confidence is low (< 50), downgrade complex rungs (plugin, agent) to "not-recommended".

OUTPUT (JSON object, no prose, no fences):
{
  "rungs": [
    {
      "kind": "prompt" | "checklist" | "skill" | "plugin" | "agent",
      "label": "<10-word label for the rung, action-oriented>",
      "rationale": "<1 sentence why this rung fits or doesn't fit this task>",
      "confidence": <0-100 integer, confidence this rung is the right fit>,
      "state": "recommended" | "optional" | "not-recommended"
    }
  ]
}

The "rungs" array MUST contain exactly 5 entries — one per kind in this order: prompt, checklist, skill, plugin, agent.`;

// ---------------------------------------------------------------------------
// LLM classification
// ---------------------------------------------------------------------------

async function classifyWithLlm(input: Stage8Input): Promise<AdoptionPathway | null> {
  const userPrompt = JSON.stringify({
    task: input.task,
    taskDescription: input.taskDescription ?? null,
    painPath: input.painPath,
    confidence: input.scoring.confidence,
    rationale: input.scoring.rationale,
  });

  let answer: string;
  try {
    const result = await callStage({
      systemPrompt: STAGE8_SYSTEM_PROMPT,
      userPrompt,
      responseSchema: {},
      temperature: 0.15,
    });
    answer = result.answer;
  } catch {
    return null;
  }

  const parsed = parseJsonObject(answer);
  if (!parsed || !Array.isArray(parsed.rungs) || parsed.rungs.length !== 5) {
    return null;
  }

  const kinds: AdoptionPathwayRung["kind"][] = ["prompt", "checklist", "skill", "plugin", "agent"];
  const rungs: AdoptionPathwayRung[] = [];

  for (let i = 0; i < 5; i++) {
    const r = parsed.rungs[i] as Record<string, unknown>;
    const kind = kinds[i]!;
    if (
      typeof r !== "object" ||
      r === null ||
      !["recommended", "optional", "not-recommended"].includes(r.state as string) ||
      typeof r.label !== "string" ||
      typeof r.rationale !== "string" ||
      typeof r.confidence !== "number"
    ) {
      return null; // force fallback
    }
    rungs.push({
      kind,
      label: (r.label as string).slice(0, 80),
      rationale: (r.rationale as string).slice(0, 280),
      confidence: Math.min(100, Math.max(0, Math.round(r.confidence as number))),
      builderHandoff: {
        seed: buildSeed(kind, input),
      },
      state: r.state as AdoptionPathwayRung["state"],
    });
  }

  // Safety: ensure at least 1 "recommended" rung.
  const hasRecommended = rungs.some((r) => r.state === "recommended");
  if (!hasRecommended) return null;

  // We've verified exactly 5 entries above (loop 0-4); safe tuple cast.
  return rungs as AdoptionPathway;
}

// ---------------------------------------------------------------------------
// Deterministic heuristics (fallback when LLM fails)
// ---------------------------------------------------------------------------

function classifyWithHeuristics(input: Stage8Input): AdoptionPathway {
  const task = input.task.toLowerCase();
  const taskDesc = (input.taskDescription ?? "").toLowerCase();
  const combined = `${task} ${taskDesc}`;
  const lowConfidence = input.scoring.confidence < 50;

  // Pattern matchers
  const isDrafting = /draft|write|compose|template|generat|summar|extract|translat|creat/.test(combined);
  const isMultiStep = /workflow|process|checklist|sop|routine|recurring|step|procedure|track|monitor/.test(combined);
  const isDataAutomation = /report|analyz|parse|batch|automat|transform|export|sync|schedul/.test(combined);
  const isIntegration = /ehr|calendar|billing|schedule|appointment|referral|integration|webhook|system/.test(combined);
  const isComplex = /multi.session|agent|decision|branch|escalat|triage|complex/.test(combined);

  // Derive state per rung
  const promptState: AdoptionPathwayRung["state"] = isDrafting || !isMultiStep ? "recommended" : "optional";
  const checklistState: AdoptionPathwayRung["state"] = isMultiStep ? "recommended" : "optional";
  const skillState: AdoptionPathwayRung["state"] = !lowConfidence && isDataAutomation ? "recommended" : isDataAutomation ? "optional" : "not-recommended";
  const pluginState: AdoptionPathwayRung["state"] = !lowConfidence && isIntegration ? "optional" : "not-recommended";
  const agentState: AdoptionPathwayRung["state"] = !lowConfidence && isComplex ? "optional" : "not-recommended";

  // Ensure at least 1 recommended
  const anyRecommended = [promptState, checklistState, skillState, pluginState, agentState].some((s) => s === "recommended");
  const safePromptState: AdoptionPathwayRung["state"] = !anyRecommended ? "recommended" : promptState;

  const rungs: [AdoptionPathwayRung, AdoptionPathwayRung, AdoptionPathwayRung, AdoptionPathwayRung, AdoptionPathwayRung] = [
    {
      kind: "prompt",
      label: isDrafting ? "Start with a paste-ready prompt" : "Try a one-shot prompt first",
      rationale: isDrafting
        ? "Single-step drafting tasks are best started with a paste-ready prompt in ChatGPT or Claude."
        : "A prompt is the lowest-friction entry point before committing to a more complex rung.",
      confidence: isDrafting ? 85 : 60,
      builderHandoff: { seed: buildSeed("prompt", input) },
      state: safePromptState,
    },
    {
      kind: "checklist",
      label: isMultiStep ? "Build a recurring checklist" : "Create a guided checklist",
      rationale: isMultiStep
        ? "Multi-step recurring workflows benefit from a structured checklist to ensure consistency."
        : "A checklist ensures you don't miss steps when this task arises.",
      confidence: isMultiStep ? 80 : 55,
      builderHandoff: { seed: buildSeed("checklist", input) },
      state: checklistState,
    },
    {
      kind: "skill",
      label: isDataAutomation ? "Install a repeatable skill" : "Consider a skill for automation",
      rationale: isDataAutomation
        ? "Repetitive data tasks run faster and more reliably as an installed Claude Code skill."
        : "A skill adds value only when the task repeats multiple times per week with structured input.",
      confidence: isDataAutomation ? 70 : 40,
      builderHandoff: { seed: buildSeed("skill", input) },
      state: skillState,
    },
    {
      kind: "plugin",
      label: isIntegration ? "Connect via a plugin integration" : "Plugin not the right fit yet",
      rationale: isIntegration
        ? "External system integration (EHR, calendar, billing) is the natural scope for a plugin."
        : "Plugins require integration hooks; consider this once the prompt or skill is proven.",
      confidence: isIntegration ? 60 : 25,
      builderHandoff: { seed: buildSeed("plugin", input) },
      state: pluginState,
    },
    {
      kind: "agent",
      label: isComplex ? "Build an autonomous agent" : "Agent overkill for this task",
      rationale: isComplex
        ? "Multi-branch, multi-session decisions warrant an autonomous agent that can reason across steps."
        : "Agents are high-investment; reserve for complex multi-session workflows once simpler rungs are validated.",
      confidence: isComplex ? 55 : 15,
      builderHandoff: { seed: buildSeed("agent", input) },
      state: agentState,
    },
  ];

  return rungs;
}

// ---------------------------------------------------------------------------
// Seed construction (server-side only — never sent client-side)
// ---------------------------------------------------------------------------

function buildSeed(
  kind: AdoptionPathwayRung["kind"],
  input: Stage8Input,
): AdoptionPathwayRung["builderHandoff"]["seed"] {
  const base = {
    taskTitle: input.task,
    taskDescription: input.taskDescription ?? null,
    painPath: input.painPath,
    scoringRationale: input.scoring.rationale,
  };

  switch (kind) {
    case "prompt":
      return {
        ...base,
        builderKind: "prompt" as const,
        targetAudience: "solo healthcare practitioner",
        outputSpec: "paste-ready prompt for ChatGPT or Claude",
        permissionTier: "T0" as const,
      };
    case "checklist":
      return {
        ...base,
        builderKind: "checklist" as const,
        stepCountTarget: 5,
        format: "ordered-steps" as const,
        permissionTier: "T0" as const,
      };
    case "skill":
      return {
        ...base,
        builderKind: "skill" as const,
        scaffoldTarget: "claude-code-skill" as const,
        permissionTier: "T1" as const,
      };
    case "plugin":
      return {
        ...base,
        builderKind: "plugin" as const,
        scaffoldTarget: "claude-code-plugin" as const,
        permissionTier: "T2" as const,
      };
    case "agent":
      return {
        ...base,
        builderKind: "agent" as const,
        scaffoldTarget: "claude-code-plugin" as const,
        permissionTier: "T3" as const,
      };
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Stage 8: classify adoption-pathway rungs for a recommended task.
 *
 * Returns a typed AdoptionPathway (5-element array, one per rung kind).
 * LLM call first; deterministic heuristics if LLM fails.
 *
 * Server-side only. Seeds are typed payloads for the builder bridges
 * that U4 will implement — never constructed client-side.
 */
export async function classifyPromotion(
  input: Stage8Input,
): Promise<AdoptionPathway> {
  const llmResult = await classifyWithLlm(input);
  if (llmResult !== null) return llmResult;
  // Fallback: deterministic heuristics.
  return classifyWithHeuristics(input);
}

// ---------------------------------------------------------------------------
// Utility
// ---------------------------------------------------------------------------

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
