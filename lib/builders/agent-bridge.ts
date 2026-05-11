// lib/builders/agent-bridge.ts — U4 server-side plugin/agent builder bridge.
//
// Generates a plugin scaffold: plugin.json manifest, component manifest
// (skills/agents/hooks list), placeholder files.
//
// Covers both "plugin" and "agent" rung kinds. The underlying scaffold
// target is "claude-code-plugin" for both (per types.ts).
//
// External plugins (agent-builder Claude Code skill) are design references only.
// This is the server-side re-implementation per architecture decision doc.

import "server-only";
import { callStage } from "@/lib/groq";
import type { PluginBuilderSeed, AgentBuilderSeed } from "@/lib/engine/types";

// ---------------------------------------------------------------------------
// Output type (matches library_plugins row shape for insert)
// ---------------------------------------------------------------------------

export interface PluginArtifact {
  name: string;
  description: string;
  pluginJson: string;
  componentsManifest: string;
  status: "draft";
}

// ---------------------------------------------------------------------------
// System prompt
// ---------------------------------------------------------------------------

const PLUGIN_BUILDER_SYSTEM = `You are a Claude Code plugin architect building plugin scaffolds for solo healthcare practitioners.

A Claude Code plugin has a plugin.json manifest + component files (skills/, agents/, hooks/).

CRITICAL RULES:
1. Plugin name: kebab-case, ≤64 chars, never use "anthropic" or "claude".
2. Component file references in plugin.json: paths relative to plugin root (e.g. "skills/my-skill/SKILL.md"), NOT inside ".claude-plugin/".
3. The pluginJson must be valid JSON with at minimum: { "name": "...", "description": "...", "version": "0.1.0" }.
4. The componentsManifest lists files that would exist at plugin root — one per line.

Return ONLY a JSON object, no prose, no markdown fences:
{
  "name": "<kebab-case plugin name, ≤64 chars>",
  "description": "<third-person plugin description, ≤1024 chars>",
  "pluginJson": "<full plugin.json as a JSON string — must be valid JSON>",
  "componentsManifest": "<newline-separated list of files in the plugin root: skills/, agents/, hooks/, etc.>"
}

The pluginJson must include:
- "name": kebab-case
- "description": third-person
- "version": "0.1.0"
- "skills": array of { "name": "...", "path": "skills/<name>/SKILL.md" }
- Optional: "hooks": { "SessionStart": [...] }

The componentsManifest should list: plugin.json, CLAUDE.md, skills/<skill-name>/SKILL.md, and any other planned files.`;

// ---------------------------------------------------------------------------
// Parser
// ---------------------------------------------------------------------------

function parsePluginArtifact(answer: string): PluginArtifact | null {
  const cleaned = answer
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/i, "");
  try {
    const parsed = JSON.parse(cleaned);
    if (
      typeof parsed !== "object" ||
      !parsed ||
      typeof parsed.name !== "string" ||
      typeof parsed.description !== "string" ||
      typeof parsed.pluginJson !== "string" ||
      typeof parsed.componentsManifest !== "string"
    ) {
      return null;
    }
    // Validate that pluginJson is itself valid JSON.
    JSON.parse(parsed.pluginJson as string);
    return {
      name: (parsed.name as string).slice(0, 64),
      description: (parsed.description as string).slice(0, 1024),
      pluginJson: parsed.pluginJson as string,
      componentsManifest: parsed.componentsManifest as string,
      status: "draft",
    };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Stub fallback
// ---------------------------------------------------------------------------

function makeStubPlugin(seed: PluginBuilderSeed | AgentBuilderSeed): PluginArtifact {
  const nameSlug = seed.taskTitle
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 56)
    .concat(seed.builderKind === "agent" ? "-agent" : "-plugin");

  const description = `This plugin enables solo healthcare practitioners to automate ${seed.taskTitle.toLowerCase()} within their ${seed.painPath.replace(/_/g, " ")} workflow.`;

  const skillName = nameSlug.replace(/-(?:plugin|agent)$/, "-skill");

  const pluginJsonObj = {
    name: nameSlug,
    description,
    version: "0.1.0",
    skills: [
      {
        name: skillName,
        path: `skills/${skillName}/SKILL.md`,
      },
    ],
    ...(seed.builderKind === "agent"
      ? {
          agents: [
            {
              name: `${nameSlug}-orchestrator`,
              path: `agents/${nameSlug}-orchestrator/AGENT.md`,
            },
          ],
        }
      : {}),
  };

  const pluginJson = JSON.stringify(pluginJsonObj, null, 2);

  const componentsManifest = [
    "plugin.json",
    "CLAUDE.md",
    `skills/${skillName}/SKILL.md`,
    ...(seed.builderKind === "agent"
      ? [`agents/${nameSlug}-orchestrator/AGENT.md`]
      : []),
  ].join("\n");

  return {
    name: nameSlug,
    description,
    pluginJson,
    componentsManifest,
    status: "draft",
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Generate a plugin scaffold from a PluginBuilderSeed or AgentBuilderSeed.
 * Returns a PluginArtifact with status='draft'.
 * Falls back to a stub if LLM call fails.
 */
export async function generatePlugin(
  seed: PluginBuilderSeed | AgentBuilderSeed,
): Promise<PluginArtifact> {
  const userPrompt = JSON.stringify({
    taskTitle: seed.taskTitle,
    taskDescription: seed.taskDescription,
    painPath: seed.painPath,
    scoringRationale: seed.scoringRationale,
    builderKind: seed.builderKind,
    scaffoldTarget: seed.scaffoldTarget,
    targetUser: "solo healthcare practitioner",
  });

  let answer: string;
  try {
    const result = await callStage({
      systemPrompt: PLUGIN_BUILDER_SYSTEM,
      userPrompt,
      responseSchema: {},
      temperature: 0.15,
    });
    answer = result.answer;
  } catch (err) {
    console.warn("[agent-bridge] Groq call failed, returning stub:", err);
    return makeStubPlugin(seed);
  }

  const parsed = parsePluginArtifact(answer);
  if (!parsed) {
    console.warn("[agent-bridge] Failed to parse LLM response, returning stub");
    return makeStubPlugin(seed);
  }

  return parsed;
}
