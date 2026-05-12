// C2 — artifacts.test.ts
//
// Tests for buildArtifacts(). Mocks builders and catalog.

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

// Mock builder modules.
vi.mock("@/lib/builders/prompt-bridge", () => ({
  generatePrompt: vi.fn(),
}));

vi.mock("@/lib/builders/skill-bridge", () => ({
  generateSkill: vi.fn(),
}));

vi.mock("@/lib/builders/agent-bridge", () => ({
  generatePlugin: vi.fn(),
}));

vi.mock("@/lib/builders/quality-gate", () => ({
  validateArtifact: vi.fn(),
}));

vi.mock("@/lib/catalog/anthropic-knowledge-work", () => ({
  findUpstreamPluginMatch: vi.fn(),
}));

import { buildArtifacts } from "../artifacts";
import { generatePrompt } from "@/lib/builders/prompt-bridge";
import { generateSkill } from "@/lib/builders/skill-bridge";
import { generatePlugin } from "@/lib/builders/agent-bridge";
import { validateArtifact } from "@/lib/builders/quality-gate";
import { findUpstreamPluginMatch } from "@/lib/catalog/anthropic-knowledge-work";
import type { ActivityStep } from "@/lib/engine/types";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeStep(
  id: string,
  aiRung: "none" | "prompt" | "skill" | "plugin" | "agent" = "prompt",
  isLynchpin = true,
): ActivityStep {
  return {
    id,
    parentId: null,
    order: 0,
    title: `Step ${id}`,
    origin: "existing",
    inputs: [],
    outputs: [],
    currentTool: null,
    jobRole: "Practitioner",
    dataNeeded: [],
    integrations: [],
    valueClass: "value-add",
    estDurationMins: 10,
    frequencyPerMonth: 20,
    aiSuitability: {
      eloundouBeta: 0.5,
      predictability: 4,
      volume: 4,
      dataAvailability: 3,
      exceptionFrequency: 4,
      compositeScore: 0.6,
    },
    aiRung,
    aiSuggestion: {
      label: "Use a prompt",
      summary: "AI summarizes incoming data",
      artifactSeed: "Summarize this referral for EHR entry",
      permissionTier: "T0",
    },
    systemImpact: 3,
    userPain: 4,
    lynchpinScore: isLynchpin ? 0.8 : 0.1,
    isLynchpin,
    evolutionNotes: null,
  };
}

const MOCK_PROMPT_ARTIFACT = {
  title: "Referral Parser Prompt",
  instructions: "Line 1\nLine 2\nLine 3",
  requiredInputs: ["[PATIENT_NAME]"],
  outputFormat: "Structured referral data",
  safetyNotes: "Do not include PHI.",
  reviewRequirements: "Practitioner must review before use.",
};

const MOCK_SKILL_ARTIFACT = {
  name: "referral-parser-skill",
  description: "This skill parses referral emails.",
  skillMdBody: "---\nname: referral-parser-skill\n---\n\n## Overview\n...\n## NOT-DO\n- Do not include PHI\n## Success Criteria\n- Parsed correctly",
  frontmatter: "---\nname: referral-parser-skill\n---",
  status: "draft" as const,
};

const MOCK_PLUGIN_ARTIFACT = {
  name: "referral-plugin",
  description: "This plugin integrates the referral workflow.",
  pluginJson: JSON.stringify({ name: "referral-plugin", description: "Integration plugin", version: "0.1.0", skills: [] }),
  componentsManifest: "plugin.json\nCLAUDE.md",
  status: "draft" as const,
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("buildArtifacts", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(validateArtifact).mockResolvedValue({ passed: true });
    vi.mocked(findUpstreamPluginMatch).mockResolvedValue(null);
  });

  it("routes prompt rung to generatePrompt", async () => {
    vi.mocked(generatePrompt).mockResolvedValueOnce(MOCK_PROMPT_ARTIFACT);
    const step = makeStep("1", "prompt");

    const { artifacts } = await buildArtifacts([step], "referrals", [step]);

    expect(generatePrompt).toHaveBeenCalledOnce();
    expect(generateSkill).not.toHaveBeenCalled();
    expect(generatePlugin).not.toHaveBeenCalled();
    expect(artifacts).toHaveLength(1);
    expect(artifacts[0]!.rung).toBe("prompt");
    expect(artifacts[0]!.stepId).toBe("1");
  });

  it("routes skill rung to generateSkill", async () => {
    vi.mocked(generateSkill).mockResolvedValueOnce(MOCK_SKILL_ARTIFACT);
    const step = makeStep("2", "skill");

    const { artifacts } = await buildArtifacts([step], "admin", [step]);

    expect(generateSkill).toHaveBeenCalledOnce();
    expect(artifacts[0]!.rung).toBe("skill");
  });

  it("routes plugin rung to generatePlugin", async () => {
    vi.mocked(generatePlugin).mockResolvedValueOnce(MOCK_PLUGIN_ARTIFACT);
    const step = makeStep("3", "plugin");

    const { artifacts } = await buildArtifacts([step], "referrals", [step]);

    expect(generatePlugin).toHaveBeenCalledOnce();
    expect(artifacts[0]!.rung).toBe("plugin");
  });

  it("routes agent rung to generatePlugin", async () => {
    vi.mocked(generatePlugin).mockResolvedValueOnce(MOCK_PLUGIN_ARTIFACT);
    const step = makeStep("4", "agent");

    const { artifacts } = await buildArtifacts([step], "admin", [step]);

    expect(generatePlugin).toHaveBeenCalledOnce();
    expect(artifacts[0]!.rung).toBe("agent");
  });

  it("skips none-rung steps", async () => {
    const step = makeStep("5", "none");

    const { artifacts } = await buildArtifacts([step], "admin", [step]);

    expect(generatePrompt).not.toHaveBeenCalled();
    expect(generateSkill).not.toHaveBeenCalled();
    expect(generatePlugin).not.toHaveBeenCalled();
    expect(artifacts).toHaveLength(0);
  });

  it("skips an artifact when QG fails — engine continues", async () => {
    vi.mocked(generatePrompt).mockResolvedValueOnce(MOCK_PROMPT_ARTIFACT);
    vi.mocked(validateArtifact).mockResolvedValueOnce({
      passed: false,
      blockers: ["Missing safety notes"],
      warnings: [],
    });
    const step = makeStep("6", "prompt");

    const { artifacts } = await buildArtifacts([step], "admin", [step]);

    // Artifact skipped — no throw.
    expect(artifacts).toHaveLength(0);
  });

  it("populates upstreamPlugin on step copy when catalog returns a match for plugin rung", async () => {
    vi.mocked(generatePlugin).mockResolvedValueOnce(MOCK_PLUGIN_ARTIFACT);
    vi.mocked(findUpstreamPluginMatch).mockResolvedValueOnce({
      name: "productivity",
      repoUrl: "https://github.com/anthropics/knowledge-work-plugins/tree/main/productivity",
      installCommand: "/plugin install productivity@anthropics/knowledge-work-plugins",
    });

    const step = makeStep("7", "plugin");
    const { steps } = await buildArtifacts([step], "referrals", [step]);

    const resultStep = steps.find((s) => s.id === "7")!;
    expect(resultStep.aiSuggestion?.upstreamPlugin).toBeDefined();
    expect(resultStep.aiSuggestion?.upstreamPlugin?.name).toBe("productivity");
  });

  it("does not populate upstreamPlugin for prompt rung steps", async () => {
    vi.mocked(generatePrompt).mockResolvedValueOnce(MOCK_PROMPT_ARTIFACT);
    const step = makeStep("8", "prompt");

    const { steps } = await buildArtifacts([step], "admin", [step]);

    const resultStep = steps.find((s) => s.id === "8")!;
    // findUpstreamPluginMatch should not be called for prompt rung.
    expect(findUpstreamPluginMatch).not.toHaveBeenCalled();
    expect(resultStep.aiSuggestion?.upstreamPlugin).toBeUndefined();
  });

  it("returns the full allSteps array even when no lynchpin steps given", async () => {
    const allSteps = [makeStep("a", "none", false), makeStep("b", "prompt", false)];
    const { steps } = await buildArtifacts([], "admin", allSteps);
    expect(steps).toHaveLength(2);
  });

  it("swallows catalog match errors — engine does not throw", async () => {
    vi.mocked(generatePlugin).mockResolvedValueOnce(MOCK_PLUGIN_ARTIFACT);
    vi.mocked(findUpstreamPluginMatch).mockRejectedValueOnce(
      new Error("Catalog fetch failed"),
    );
    const step = makeStep("9", "plugin");

    // Should not throw.
    const { artifacts } = await buildArtifacts([step], "referrals", [step]);
    expect(artifacts).toHaveLength(1); // artifact still generated
  });
});
