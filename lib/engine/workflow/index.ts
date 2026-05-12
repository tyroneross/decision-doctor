// lib/engine/workflow/index.ts
//
// Public surface for the v2 workflow pipeline.
//
// Exports runWorkflowV2() — the entry point called by the orchestrator when
// DD_ENGINE_MODE === "v2-workflow". Also re-exports all sub-functions for
// testing and direct consumption.

import "server-only";
import type { AiTaskRecommendation, PainPathId } from "@/lib/engine/types";
import type { RecommendationInput } from "@/lib/engine/types";
import type { WorkflowRecommendation } from "@/lib/engine/types";
import { decomposeWorkflow } from "./decompose";
import { scoreSteps } from "./score-steps";
import { selectLynchpins } from "./select-lynchpins";
import { buildHorizons } from "./horizons";
import { buildArtifacts } from "./artifacts";

// Re-export sub-functions.
export { decomposeWorkflow } from "./decompose";
export { scoreSteps } from "./score-steps";
export { selectLynchpins } from "./select-lynchpins";
export { buildHorizons } from "./horizons";
export { buildArtifacts } from "./artifacts";

// Re-export types for convenience.
export type { DecomposeInput } from "./decompose";
export type { ScoringContext } from "./score-steps";
export type { SelectResult } from "./select-lynchpins";
export type { ArtifactsResult } from "./artifacts";
export type {
  ActivityStep,
  WorkflowRecommendation,
  AiTaskRecommendation,
  PainPathId,
} from "@/lib/engine/types";

// ---------------------------------------------------------------------------
// Pain-path → workflow title/outcome/task lookup
// (Avoids a third LLM call for v1 of v2. Telemetry can improve this later.)
// ---------------------------------------------------------------------------

const PAIN_PATH_TITLES: Record<
  PainPathId,
  { task: string; workflow: string; outcome: string }
> = {
  referrals: {
    task: "Standardize the referral intake workflow",
    workflow: "Referral intake & triage",
    outcome: "Faster referral throughput with no missed handoffs",
  },
  research: {
    task: "Speed up the medical-research literature workflow",
    workflow: "Literature review & evidence synthesis",
    outcome: "Trusted summaries delivered faster",
  },
  admin: {
    task: "Cut administrative overhead in the practice",
    workflow: "Daily admin & ops",
    outcome: "Hours back per week from the admin treadmill",
  },
  capacity_growth: {
    task: "Run quarterly capacity & growth planning",
    workflow: "Quarterly capacity-growth planning",
    outcome: "A signed-off quarterly plan with target services + outreach",
  },
  follow_up: {
    task: "Operationalize patient follow-up",
    workflow: "Patient follow-up & adherence",
    outcome: "Higher follow-through, fewer no-shows",
  },
  custom: {
    task: "Map a custom workflow to AI",
    workflow: "Custom workflow",
    outcome: "Tasks delegated to AI where it earns its keep",
  },
};

// Fallback for any pain path we don't recognise (type-safe exhaustive check
// is done by the PainPathId enum, but runtime may receive unknown strings).
const FALLBACK_TITLES = {
  task: "Map workflow to AI",
  workflow: "Workflow analysis",
  outcome: "Identified AI opportunities across the workflow",
};

function getTitles(painPath: PainPathId) {
  return PAIN_PATH_TITLES[painPath] ?? FALLBACK_TITLES;
}

// ---------------------------------------------------------------------------
// runWorkflowV2
// ---------------------------------------------------------------------------

/**
 * v2 workflow recommendation pipeline.
 *
 * Stages:
 * 1. Derive workflow titles from pain-path lookup (no extra LLM call).
 * 2. Pass 1: decomposeWorkflow() → ActivityStep[] (Groq).
 * 3. Pass 2: scoreSteps() → ActivityStep[] with AI fields (OpenAI).
 * 4. selectLynchpins() → isLynchpin flags + startHere.
 * 5. buildHorizons() → 3-entry horizon strip.
 * 6. buildArtifacts() → per-lynchpin artifacts + catalog matching.
 * 7. Assemble WorkflowRecommendation.
 * 8. Return AiTaskRecommendation with output.kind === "workflow" AND
 *    starterSolution fallback (backward-compat for old readers).
 *
 * On any stage error: throws so the orchestrator can catch and degrade to v1.
 * The orchestrator is responsible for the try/catch + fallback.
 */
export async function runWorkflowV2(
  input: RecommendationInput,
): Promise<AiTaskRecommendation> {
  const methodTrace: AiTaskRecommendation["methodTrace"] = [];

  const painPath = input.painPath;
  const challengeText = input.challengeText;
  const goal = input.goal;
  const reportedPain = input.scoringInput?.painSeverity
    ? Math.round(input.scoringInput.painSeverity * 5) // 0-1 → 1-5
    : 3;

  const titles = getTitles(painPath);

  // STAGE: Decompose (Pass 1 — Groq)
  const rawSteps = await decomposeWorkflow({
    painPath,
    challengeText,
    goal,
    recommendedTaskTitle: titles.task,
  });
  methodTrace.push({
    stage: "candidate-gen",
    name: "workflow-decompose-pass1",
    output: { stepCount: rawSteps.length, painPath },
  });

  // STAGE: Score (Pass 2 — OpenAI)
  const scoredSteps = await scoreSteps(rawSteps, {
    challengeText,
    goal,
    painPath,
    reportedPain,
  });
  methodTrace.push({
    stage: "scoring",
    name: "workflow-score-pass2",
    output: {
      stepCount: scoredSteps.length,
      rungDistribution: Object.fromEntries(
        ["none", "prompt", "skill", "plugin", "agent"].map((rung) => [
          rung,
          scoredSteps.filter((s) => s.aiRung === rung).length,
        ]),
      ),
    },
  });

  // STAGE: Select lynchpins (deterministic)
  const { steps: markedSteps, startHereStepIds, rationale } = selectLynchpins(scoredSteps);
  methodTrace.push({
    stage: "stage8-promotion",
    name: "workflow-select-lynchpins",
    output: { lynchpinCount: startHereStepIds.length, startHereStepIds },
  });

  // STAGE: Build horizons (deterministic)
  const horizon = buildHorizons(markedSteps);

  // STAGE: Build artifacts + catalog match
  const lynchpinSteps = markedSteps.filter((s) => s.isLynchpin);
  const { artifacts, steps: finalSteps } = await buildArtifacts(
    lynchpinSteps,
    painPath,
    markedSteps,
  );
  methodTrace.push({
    stage: "stage8-promotion",
    name: "workflow-artifacts",
    output: { artifactCount: artifacts.length, lynchpinCount: lynchpinSteps.length },
  });

  // STAGE: Assemble WorkflowRecommendation
  const workflow: WorkflowRecommendation = {
    workflowTitle: titles.workflow,
    outcome: titles.outcome,
    scope: {
      in: [challengeText.slice(0, 200)],
      out: ["Steps with no AI fit (aiRung === 'none')"],
    },
    steps: finalSteps,
    startHere: {
      stepIds: startHereStepIds,
      rationale: rationale || "Top steps by lynchpin score.",
    },
    horizon,
    artifacts,
  };

  // Backward-compat: populate starterSolution from the rationale (truncated).
  const starterSolution = rationale.slice(0, 2000) || titles.outcome;

  // Derive candidateTasks from the top-scored steps for v1 field compatibility.
  const topScoredSteps = [...finalSteps]
    .sort((a, b) => b.lynchpinScore - a.lynchpinScore)
    .slice(0, 5);

  const candidateTasks: AiTaskRecommendation["candidateTasks"] = topScoredSteps.map(
    (s) => ({
      id: s.id,
      title: s.title,
      description: s.aiSuggestion?.summary ?? s.title,
      painPath,
      score: Math.round(s.lynchpinScore * 100),
      tags: [s.aiRung, s.valueClass],
    }),
  );

  // Derive adoption pathway from the highest-rung lynchpin step.
  // Use a deterministic mapping — no extra LLM call.
  const topLynchpin = lynchpinSteps[0];
  const topRung = topLynchpin?.aiRung ?? "prompt";

  const RUNG_TO_STATE = (
    candidateRung: string,
    topRung: string,
  ): "recommended" | "optional" | "not-recommended" => {
    const order = ["prompt", "checklist", "skill", "plugin", "agent"];
    const topIdx = order.indexOf(topRung === "none" ? "prompt" : topRung);
    const candIdx = order.indexOf(candidateRung);
    if (candIdx < 0) return "not-recommended";
    if (candIdx === topIdx) return "recommended";
    if (candIdx === topIdx - 1 || candIdx === topIdx + 1) return "optional";
    return "not-recommended";
  };

  const adoptionPathway: AiTaskRecommendation["adoptionPathway"] = [
    {
      kind: "prompt",
      label: "Start with a paste-ready prompt",
      rationale: "Lowest barrier; works today with no setup.",
      confidence: 80,
      state: RUNG_TO_STATE("prompt", topRung),
      builderHandoff: {
        seed: {
          builderKind: "prompt",
          taskTitle: topLynchpin?.title ?? titles.task,
          taskDescription: topLynchpin?.aiSuggestion?.summary ?? null,
          painPath,
          scoringRationale: rationale.slice(0, 200),
          targetAudience: topLynchpin?.jobRole ?? "solo healthcare practitioner",
          outputSpec: "paste-ready prompt",
          permissionTier: "T0",
        },
      },
    },
    {
      kind: "checklist",
      label: "Turn it into a step-by-step checklist",
      rationale: "Structured workflow aids consistency.",
      confidence: 60,
      state: "optional",
      builderHandoff: {
        seed: {
          builderKind: "checklist",
          taskTitle: topLynchpin?.title ?? titles.task,
          taskDescription: topLynchpin?.aiSuggestion?.summary ?? null,
          painPath,
          scoringRationale: rationale.slice(0, 200),
          stepCountTarget: 5,
          format: "ordered-steps",
          permissionTier: "T0",
        },
      },
    },
    {
      kind: "skill",
      label: "Package as a reusable Claude skill",
      rationale: "One-click reuse across sessions.",
      confidence: 70,
      state: RUNG_TO_STATE("skill", topRung),
      builderHandoff: {
        seed: {
          builderKind: "skill",
          taskTitle: topLynchpin?.title ?? titles.task,
          taskDescription: topLynchpin?.aiSuggestion?.summary ?? null,
          painPath,
          scoringRationale: rationale.slice(0, 200),
          scaffoldTarget: "claude-code-skill",
          permissionTier: "T1",
        },
      },
    },
    {
      kind: "plugin",
      label: "Install a Claude plugin for this workflow",
      rationale: "Integrates with your existing tools.",
      confidence: 65,
      state: RUNG_TO_STATE("plugin", topRung),
      builderHandoff: {
        seed: {
          builderKind: "plugin",
          taskTitle: topLynchpin?.title ?? titles.task,
          taskDescription: topLynchpin?.aiSuggestion?.summary ?? null,
          painPath,
          scoringRationale: rationale.slice(0, 200),
          scaffoldTarget: "claude-code-plugin",
          permissionTier: "T2",
        },
      },
    },
    {
      kind: "agent",
      label: "Automate end-to-end with an AI agent",
      rationale: "Full autonomy for high-volume repetitive branches.",
      confidence: 55,
      state: RUNG_TO_STATE("agent", topRung),
      builderHandoff: {
        seed: {
          builderKind: "agent",
          taskTitle: topLynchpin?.title ?? titles.task,
          taskDescription: topLynchpin?.aiSuggestion?.summary ?? null,
          painPath,
          scoringRationale: rationale.slice(0, 200),
          scaffoldTarget: "claude-code-plugin",
          permissionTier: "T3",
        },
      },
    },
  ];

  const topScoredCandidate = topScoredSteps[0];

  return {
    selectedPainPath: painPath,
    challengeSummary: challengeText.slice(0, 600),
    goal: (goal ?? titles.outcome).slice(0, 400),
    candidateTasks: candidateTasks.length > 0 ? candidateTasks : [
      {
        id: "fallback",
        title: titles.task,
        description: titles.outcome,
        painPath,
        score: 70,
        tags: ["workflow"],
      },
    ],
    recommendedTask: topLynchpin?.title ?? titles.task,
    recommendedApproach: (topRung === "none" ? "prompt" : topRung) as AiTaskRecommendation["recommendedApproach"],
    whyThisTask:
      topScoredCandidate
        ? `"${topScoredCandidate.title}" has the highest combined pain + impact + AI fit in your ${painPath.replace("_", " ")} workflow.`
        : titles.outcome,
    starterSolution,
    guardrails: [
      "Review AI-generated clinical content before use with patients.",
      "Do not include PHI in prompt inputs unless secured end-to-end.",
      "Validate workflow step outputs against your existing protocols.",
    ],
    tryThisWeek: (horizon[0]?.upliftedStepIds ?? []).slice(0, 3).map((id) => {
      const step = finalSteps.find((s) => s.id === id);
      return step
        ? `Try a prompt on: "${step.title}"`
        : "Try a prompt on the highest-pain step.";
    }).concat(
      (horizon[0]?.upliftedStepIds.length ?? 0) === 0
        ? ["Start by mapping your current workflow to identify the highest-pain step."]
        : [],
    ).slice(0, 5),
    successMetric: `Reduce manual time on ${painPath.replace("_", " ")} tasks by at least one hour per week within 60 days.`,
    adoptionPathway,
    confidence: Math.round(
      (topScoredCandidate?.lynchpinScore ?? 0.5) * 100,
    ),
    methodTrace,
    output: {
      kind: "workflow",
      workflow,
    },
  };
}
