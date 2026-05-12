// C1 — Schema additive union + feature flag tests.
// Covers: old-shape parse, new checklist shape, new workflow shape,
//         rejection of bad discriminants, lynchpinScore range guard,
//         and feature-flag behavior.
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { AiTaskRecommendationSchema, ActivityStepSchema, WorkflowRecommendationSchema } from "../../../shared/schema";
import { getEngineMode, getEngineModeFromRequest } from "../workflow/feature-flag";

// ---------------------------------------------------------------------------
// Shared fixture helpers
// ---------------------------------------------------------------------------

const makeRung = (kind: string, builderKind: string, permTier: string) => ({
  kind,
  label: `${kind} label`,
  rationale: "rationale text",
  confidence: 80,
  state: "recommended" as const,
  builderHandoff: {
    seed:
      builderKind === "prompt"
        ? {
            builderKind: "prompt" as const,
            taskTitle: "task",
            taskDescription: null,
            painPath: "admin" as const,
            scoringRationale: "rationale",
            targetAudience: "SMB",
            outputSpec: "markdown",
            permissionTier: "T0" as const,
          }
        : builderKind === "checklist"
          ? {
              builderKind: "checklist" as const,
              taskTitle: "task",
              taskDescription: null,
              painPath: "admin" as const,
              scoringRationale: "rationale",
              stepCountTarget: 3,
              format: "ordered-steps" as const,
              permissionTier: "T0" as const,
            }
          : builderKind === "skill"
            ? {
                builderKind: "skill" as const,
                taskTitle: "task",
                taskDescription: null,
                painPath: "admin" as const,
                scoringRationale: "rationale",
                scaffoldTarget: "claude-code-skill" as const,
                permissionTier: "T1" as const,
              }
            : builderKind === "plugin"
              ? {
                  builderKind: "plugin" as const,
                  taskTitle: "task",
                  taskDescription: null,
                  painPath: "admin" as const,
                  scoringRationale: "rationale",
                  scaffoldTarget: "claude-code-plugin" as const,
                  permissionTier: "T2" as const,
                }
              : {
                  builderKind: "agent" as const,
                  taskTitle: "task",
                  taskDescription: null,
                  painPath: "admin" as const,
                  scoringRationale: "rationale",
                  scaffoldTarget: "claude-code-plugin" as const,
                  permissionTier: "T3" as const,
                },
  },
});

const ADOPTION_PATHWAY = [
  makeRung("prompt", "prompt", "T0"),
  { ...makeRung("checklist", "checklist", "T0"), state: "optional" as const },
  { ...makeRung("skill", "skill", "T1"), state: "not-recommended" as const },
  { ...makeRung("plugin", "plugin", "T2"), state: "not-recommended" as const },
  { ...makeRung("agent", "agent", "T3"), state: "not-recommended" as const },
] as const;

const BASE_RECOMMENDATION = {
  selectedPainPath: "admin" as const,
  challengeSummary: "Challenge summary text here",
  goal: "Goal text",
  candidateTasks: [
    {
      id: "task-1",
      title: "Automate referral intake",
      description: "Use AI to route inbound referral emails",
      painPath: "admin" as const,
      score: 85,
      tags: ["automation"],
    },
  ],
  recommendedTask: "Automate referral intake",
  recommendedApproach: "skill" as const,
  whyThisTask: "High volume, rule-based, low exception rate",
  starterSolution: "Use Claude skill to parse emails",
  guardrails: ["Review output before sending"],
  tryThisWeek: ["Draft the skill spec"],
  successMetric: "Referral processing time drops by half",
  adoptionPathway: ADOPTION_PATHWAY,
  confidence: 82,
  methodTrace: [
    {
      stage: "pain-classify" as const,
      name: "stage0",
      output: { path: "admin" },
    },
  ],
};

const MINIMAL_ACTIVITY_STEP = {
  id: "1",
  parentId: null,
  order: 0,
  title: "Collect referral data",
  origin: "existing" as const,
  inputs: ["Referral email"],
  outputs: ["Structured record"],
  currentTool: "Outlook",
  jobRole: "Practice manager",
  dataNeeded: [{ source: "EHR", sensitivity: "phi" as const }],
  integrations: ["EHR"],
  valueClass: "value-add" as const,
  estDurationMins: 15,
  frequencyPerMonth: 60,
  aiSuitability: {
    eloundouBeta: 0.5 as const,
    predictability: 4 as const,
    volume: 5 as const,
    dataAvailability: 3 as const,
    exceptionFrequency: 4 as const,
    compositeScore: 0.72,
  },
  aiRung: "skill" as const,
  aiSuggestion: {
    label: "Skill: parse referral email",
    summary: "Claude skill extracts structured fields from inbound referral emails",
    artifactSeed: null,
    permissionTier: "T1" as const,
  },
  systemImpact: 3 as const,
  userPain: 4 as const,
  lynchpinScore: 0.85,
  isLynchpin: true,
  evolutionNotes: null,
};

const MINIMAL_WORKFLOW: object = {
  workflowTitle: "Referral Intake Workflow",
  outcome: "Referrals are processed without manual data entry",
  scope: { in: ["Inbound referral emails"], out: ["Outbound referral calls"] },
  steps: [MINIMAL_ACTIVITY_STEP],
  startHere: { stepIds: ["1"], rationale: "Highest volume + AI fit" },
  horizon: [
    {
      label: "this week",
      description: "Draft skill spec",
      upliftedStepIds: ["1"],
      newStepIds: [],
    },
  ],
  artifacts: [
    {
      stepId: "1",
      rung: "skill",
      body: "# Referral Parser Skill\n\nExtract fields from email...",
    },
  ],
};

// ---------------------------------------------------------------------------
// AiTaskRecommendationSchema — backward + forward compatibility
// ---------------------------------------------------------------------------

describe("AiTaskRecommendationSchema", () => {
  it("parses the OLD shape (no output field)", () => {
    const result = AiTaskRecommendationSchema.safeParse(BASE_RECOMMENDATION);
    expect(result.success).toBe(true);
  });

  it("parses the NEW v1-checklist shape with output.kind === 'checklist'", () => {
    const result = AiTaskRecommendationSchema.safeParse({
      ...BASE_RECOMMENDATION,
      output: { kind: "checklist", body: "1. Review intake form\n2. File referral" },
    });
    expect(result.success).toBe(true);
  });

  it("parses the NEW v2-workflow shape with output.kind === 'workflow'", () => {
    const result = AiTaskRecommendationSchema.safeParse({
      ...BASE_RECOMMENDATION,
      output: { kind: "workflow", workflow: MINIMAL_WORKFLOW },
    });
    expect(result.success).toBe(true);
  });

  it("rejects output.kind that is neither 'checklist' nor 'workflow'", () => {
    const result = AiTaskRecommendationSchema.safeParse({
      ...BASE_RECOMMENDATION,
      output: { kind: "unknown-kind", body: "something" },
    });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// ActivityStepSchema — range guards
// ---------------------------------------------------------------------------

describe("ActivityStepSchema", () => {
  it("accepts a valid ActivityStep", () => {
    const result = ActivityStepSchema.safeParse(MINIMAL_ACTIVITY_STEP);
    expect(result.success).toBe(true);
  });

  it("rejects lynchpinScore above 1", () => {
    const result = ActivityStepSchema.safeParse({
      ...MINIMAL_ACTIVITY_STEP,
      lynchpinScore: 1.1,
    });
    expect(result.success).toBe(false);
  });

  it("rejects lynchpinScore below 0", () => {
    const result = ActivityStepSchema.safeParse({
      ...MINIMAL_ACTIVITY_STEP,
      lynchpinScore: -0.1,
    });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// WorkflowRecommendationSchema
// ---------------------------------------------------------------------------

describe("WorkflowRecommendationSchema", () => {
  it("parses a minimal valid WorkflowRecommendation", () => {
    const result = WorkflowRecommendationSchema.safeParse(MINIMAL_WORKFLOW);
    expect(result.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Feature flag — getEngineMode + getEngineModeFromRequest
// ---------------------------------------------------------------------------

describe("getEngineMode", () => {
  const origEnv = process.env.DD_ENGINE_MODE;

  afterEach(() => {
    if (origEnv === undefined) {
      delete process.env.DD_ENGINE_MODE;
    } else {
      process.env.DD_ENGINE_MODE = origEnv;
    }
  });

  it("returns 'v1' when DD_ENGINE_MODE is unset", () => {
    delete process.env.DD_ENGINE_MODE;
    expect(getEngineMode()).toBe("v1");
  });

  it("returns 'v2-workflow' when DD_ENGINE_MODE === 'v2-workflow'", () => {
    process.env.DD_ENGINE_MODE = "v2-workflow";
    expect(getEngineMode()).toBe("v2-workflow");
  });
});

describe("getEngineModeFromRequest", () => {
  const origEnv = process.env.DD_ENGINE_MODE;
  const origNode = process.env.NODE_ENV;

  beforeEach(() => {
    delete process.env.DD_ENGINE_MODE;
  });

  afterEach(() => {
    if (origEnv === undefined) {
      delete process.env.DD_ENGINE_MODE;
    } else {
      process.env.DD_ENGINE_MODE = origEnv;
    }
    (process.env as Record<string, string>).NODE_ENV = origNode ?? "test";
  });

  it("returns 'v2-workflow' from query param when NODE_ENV !== 'production'", () => {
    (process.env as Record<string, string>).NODE_ENV = "test";
    const params = new URLSearchParams("engineMode=v2-workflow");
    expect(getEngineModeFromRequest(params)).toBe("v2-workflow");
  });

  it("ignores query param in production", () => {
    (process.env as Record<string, string>).NODE_ENV = "production";
    const params = new URLSearchParams("engineMode=v2-workflow");
    expect(getEngineModeFromRequest(params)).toBe("v1");
  });

  it("falls back to env var when query param absent", () => {
    (process.env as Record<string, string>).NODE_ENV = "test";
    process.env.DD_ENGINE_MODE = "v2-workflow";
    expect(getEngineModeFromRequest(new URLSearchParams())).toBe("v2-workflow");
  });
});
