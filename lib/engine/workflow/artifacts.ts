// lib/engine/workflow/artifacts.ts
//
// Per-lynchpin artifact generation + upstream catalog matching.
//
// Routes each lynchpin step to the appropriate builder based on aiRung:
//   "prompt"          → prompt-bridge.generatePrompt()
//   "skill"           → skill-bridge.generateSkill()
//   "plugin" | "agent" → agent-bridge.generatePlugin()
//   "none"            → skipped (no artifact)
//
// Each generated artifact is validated through quality-gate.validateArtifact().
// If a single artifact fails the gate, it is skipped — the engine continues
// and the UI shows steps without an artifact for that step.
//
// For steps with aiRung === "plugin", findUpstreamPluginMatch() from the
// catalog is called. A match populates step.aiSuggestion.upstreamPlugin on
// a copy of the step — no mutation of the input array.

import "server-only";
import { generatePrompt } from "@/lib/builders/prompt-bridge";
import { generateSkill } from "@/lib/builders/skill-bridge";
import { generatePlugin } from "@/lib/builders/agent-bridge";
import { validateArtifact } from "@/lib/builders/quality-gate";
import { findUpstreamPluginMatch } from "@/lib/catalog/anthropic-knowledge-work";
import type {
  ActivityStep,
  PainPathId,
  WorkflowRecommendation,
} from "@/lib/engine/types";
import type {
  PromptBuilderSeed,
  SkillBuilderSeed,
  PluginBuilderSeed,
  AgentBuilderSeed,
} from "@/lib/engine/types";

// ---------------------------------------------------------------------------
// Output contract
// ---------------------------------------------------------------------------

export interface ArtifactsResult {
  artifacts: WorkflowRecommendation["artifacts"];
  /** Copy of allSteps with upstreamPlugin populated on plugin-rung steps where a catalog match exists. */
  steps: ActivityStep[];
}

// ---------------------------------------------------------------------------
// Seed builders per rung
// ---------------------------------------------------------------------------

function makePromptSeed(step: ActivityStep, painPath: PainPathId): PromptBuilderSeed {
  return {
    builderKind: "prompt",
    taskTitle: step.title,
    taskDescription: step.aiSuggestion?.summary ?? null,
    painPath,
    scoringRationale: step.aiSuggestion?.label ?? `Prompt for: ${step.title}`,
    targetAudience: step.jobRole || "solo healthcare practitioner",
    outputSpec: step.outputs.join("; ") || "structured output",
    permissionTier: "T0",
  };
}

function makeSkillSeed(step: ActivityStep, painPath: PainPathId): SkillBuilderSeed {
  return {
    builderKind: "skill",
    taskTitle: step.title,
    taskDescription: step.aiSuggestion?.summary ?? null,
    painPath,
    scoringRationale: step.aiSuggestion?.label ?? `Skill for: ${step.title}`,
    scaffoldTarget: "claude-code-skill",
    permissionTier: "T1",
  };
}

function makePluginSeed(step: ActivityStep, painPath: PainPathId): PluginBuilderSeed {
  return {
    builderKind: "plugin",
    taskTitle: step.title,
    taskDescription: step.aiSuggestion?.summary ?? null,
    painPath,
    scoringRationale: step.aiSuggestion?.label ?? `Plugin for: ${step.title}`,
    scaffoldTarget: "claude-code-plugin",
    permissionTier: "T2",
  };
}

function makeAgentSeed(step: ActivityStep, painPath: PainPathId): AgentBuilderSeed {
  return {
    builderKind: "agent",
    taskTitle: step.title,
    taskDescription: step.aiSuggestion?.summary ?? null,
    painPath,
    scoringRationale: step.aiSuggestion?.label ?? `Agent for: ${step.title}`,
    scaffoldTarget: "claude-code-plugin",
    permissionTier: "T3",
  };
}

// ---------------------------------------------------------------------------
// Artifact body serialiser — converts typed artifact objects → string body
// ---------------------------------------------------------------------------

function promptArtifactBody(artifact: {
  title: string;
  instructions: string;
  requiredInputs: string[];
  outputFormat: string;
  safetyNotes: string;
  reviewRequirements: string;
}): string {
  return [
    `# ${artifact.title}`,
    "",
    artifact.instructions,
    "",
    `## Output format`,
    artifact.outputFormat,
    "",
    `## Required inputs`,
    artifact.requiredInputs.map((i) => `- ${i}`).join("\n") || "None specified.",
    "",
    `## Safety notes`,
    artifact.safetyNotes,
    "",
    `## Review requirements`,
    artifact.reviewRequirements,
  ].join("\n");
}

function skillArtifactBody(artifact: {
  name: string;
  description: string;
  skillMdBody: string;
}): string {
  return artifact.skillMdBody;
}

function pluginArtifactBody(artifact: {
  name: string;
  description: string;
  pluginJson: string;
  componentsManifest: string;
}): string {
  return [
    `# Plugin: ${artifact.name}`,
    "",
    artifact.description,
    "",
    `## plugin.json`,
    "```json",
    artifact.pluginJson,
    "```",
    "",
    `## Component manifest`,
    artifact.componentsManifest,
  ].join("\n");
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Generate artifacts for each lynchpin step and run them through the
 * quality gate. Failed artifacts are skipped silently (engine continues).
 *
 * For plugin-rung steps, calls the upstream catalog matcher and populates
 * step.aiSuggestion.upstreamPlugin on a copy of allSteps.
 */
export async function buildArtifacts(
  lynchpinSteps: ActivityStep[],
  painPath: PainPathId,
  allSteps: ActivityStep[],
): Promise<ArtifactsResult> {
  const artifacts: WorkflowRecommendation["artifacts"] = [];

  // Copy allSteps so we can safely populate upstreamPlugin without mutation.
  const stepsCopy: ActivityStep[] = allSteps.map((s) => ({ ...s }));
  const stepCopyIndex = new Map(stepsCopy.map((s) => [s.id, s]));

  await Promise.all(
    lynchpinSteps.map(async (step) => {
      try {
        const rung = step.aiRung;
        if (rung === "none") return; // skip

        // --- Catalog match for plugin-rung steps ---
        if (rung === "plugin") {
          try {
            const match = await findUpstreamPluginMatch({
              title: step.title,
              jobRole: step.jobRole,
              integrations: step.integrations,
              currentTool: step.currentTool,
            });
            if (match) {
              const copy = stepCopyIndex.get(step.id);
              if (copy && copy.aiSuggestion) {
                copy.aiSuggestion = { ...copy.aiSuggestion, upstreamPlugin: match };
              }
            }
          } catch {
            // Catalog failures are always swallowed.
          }
        }

        // --- Generate artifact ---
        let body: string;
        let artifactForGate: unknown;
        let gateKind: "prompt" | "skill" | "plugin";

        if (rung === "prompt") {
          const seed = makePromptSeed(step, painPath);
          const artifact = await generatePrompt(seed);
          body = promptArtifactBody(artifact);
          artifactForGate = artifact;
          gateKind = "prompt";
        } else if (rung === "skill") {
          const seed = makeSkillSeed(step, painPath);
          const artifact = await generateSkill(seed);
          body = skillArtifactBody(artifact);
          artifactForGate = artifact;
          gateKind = "skill";
        } else {
          // plugin or agent both route to generatePlugin
          const seed = rung === "agent"
            ? makeAgentSeed(step, painPath)
            : makePluginSeed(step, painPath);
          const artifact = await generatePlugin(seed);
          body = pluginArtifactBody(artifact);
          artifactForGate = artifact;
          gateKind = "plugin";
        }

        // --- Quality gate ---
        const gateResult = await validateArtifact(gateKind, artifactForGate);
        if (!gateResult.passed) {
          // Skip this artifact — log non-blocking warning.
          if (process.env.NODE_ENV !== "test") {
            console.warn(
              `[artifacts] QG failed for step "${step.id}" (${rung}):`,
              gateResult.blockers,
            );
          }
          return;
        }

        // Push as Exclude<AiRung, "none"> — "none" is already filtered above.
        artifacts.push({
          stepId: step.id,
          rung: rung as Exclude<typeof rung, "none">,
          body,
        });
      } catch (err) {
        // Swallow per-artifact errors so the engine continues.
        if (process.env.NODE_ENV !== "test") {
          console.warn(
            `[artifacts] Artifact generation failed for step "${step.id}":`,
            err instanceof Error ? err.message : String(err),
          );
        }
      }
    }),
  );

  return {
    artifacts,
    steps: stepsCopy,
  };
}
