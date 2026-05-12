// C2 — decompose.test.ts
//
// Tests for decomposeWorkflow(). Mocks callStage so no real Groq calls are made.

import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock server-only before any imports that use it.
vi.mock("server-only", () => ({}));

// Mock the groq module.
vi.mock("@/lib/groq", () => ({
  callStage: vi.fn(),
  groq: {},
  GROQ_MODEL: "mock-model",
}));

import { decomposeWorkflow } from "../decompose";
import { callStage } from "@/lib/groq";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const VALID_STEP_JSON: {
  id: string;
  parentId: string | null;
  order: number;
  title: string;
  origin: string;
  inputs: string[];
  outputs: string[];
  currentTool: string;
  jobRole: string;
  dataNeeded: Array<{ source: string; sensitivity: string }>;
  integrations: string[];
  valueClass: string;
  estDurationMins: number;
  frequencyPerMonth: number;
} = {
  id: "1",
  parentId: null,
  order: 0,
  title: "Collect referral data",
  origin: "existing",
  inputs: ["Inbound fax"],
  outputs: ["Referral record"],
  currentTool: "Outlook",
  jobRole: "Practice manager",
  dataNeeded: [{ source: "EHR", sensitivity: "phi" }],
  integrations: ["EHR"],
  valueClass: "value-add",
  estDurationMins: 15,
  frequencyPerMonth: 60,
};

function makeValidGroqResponse(steps = [VALID_STEP_JSON]) {
  return JSON.stringify({ steps });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("decomposeWorkflow", () => {
  const mockCallStage = vi.mocked(callStage);

  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("calls callStage with system and user prompts", async () => {
    mockCallStage.mockResolvedValueOnce({
      answer: makeValidGroqResponse(),
      reasoning: null,
      tokensIn: 10,
      tokensOut: 20,
    });

    await decomposeWorkflow({
      painPath: "referrals",
      challengeText: "Too many referrals are lost in email",
      goal: "Never miss a referral",
      recommendedTaskTitle: "Standardize referral intake",
    });

    expect(mockCallStage).toHaveBeenCalledOnce();
    const callArgs = mockCallStage.mock.calls[0]![0];
    expect(typeof callArgs.systemPrompt).toBe("string");
    expect(callArgs.systemPrompt.length).toBeGreaterThan(10);
    expect(typeof callArgs.userPrompt).toBe("string");
    expect(callArgs.userPrompt).toContain("referrals");
    expect(callArgs.userPrompt).toContain("Too many referrals are lost in email");
  });

  it("returns ActivityStep[] with sentinel AI defaults", async () => {
    mockCallStage.mockResolvedValueOnce({
      answer: makeValidGroqResponse(),
      reasoning: null,
      tokensIn: 10,
      tokensOut: 20,
    });

    const steps = await decomposeWorkflow({
      painPath: "admin",
      challengeText: "Admin tasks take too long",
      goal: undefined,
      recommendedTaskTitle: "Reduce admin overhead",
    });

    expect(steps).toHaveLength(1);
    const step = steps[0]!;
    expect(step.aiRung).toBe("none");
    expect(step.isLynchpin).toBe(false);
    expect(step.lynchpinScore).toBe(0);
    expect(step.userPain).toBe(3);
    expect(step.systemImpact).toBe(3);
    expect(step.aiSuggestion).toBeNull();
    expect(step.aiSuitability.compositeScore).toBe(0);
    expect(step.aiSuitability.eloundouBeta).toBe(0);
  });

  it("throws when callStage returns empty answer", async () => {
    mockCallStage.mockResolvedValueOnce({
      answer: "",
      reasoning: null,
      tokensIn: 0,
      tokensOut: 0,
    });

    await expect(
      decomposeWorkflow({
        painPath: "research",
        challengeText: "Research takes too long",
        goal: undefined,
        recommendedTaskTitle: "Literature review",
      }),
    ).rejects.toThrow("[decompose]");
  });

  it("throws when Groq returns invalid JSON", async () => {
    mockCallStage.mockResolvedValueOnce({
      answer: "This is not JSON at all",
      reasoning: null,
      tokensIn: 5,
      tokensOut: 5,
    });

    await expect(
      decomposeWorkflow({
        painPath: "admin",
        challengeText: "Admin tasks",
        goal: undefined,
        recommendedTaskTitle: "Reduce admin",
      }),
    ).rejects.toThrow("[decompose]");
  });

  it("throws when JSON fails schema validation (missing required field)", async () => {
    const badStep = { ...VALID_STEP_JSON, title: undefined }; // title required
    mockCallStage.mockResolvedValueOnce({
      answer: JSON.stringify({ steps: [badStep] }),
      reasoning: null,
      tokensIn: 5,
      tokensOut: 5,
    });

    await expect(
      decomposeWorkflow({
        painPath: "admin",
        challengeText: "Admin tasks",
        goal: undefined,
        recommendedTaskTitle: "Reduce admin",
      }),
    ).rejects.toThrow("[decompose]");
  });

  it("tolerates markdown fences in Groq response", async () => {
    const responseWithFences = `\`\`\`json\n${makeValidGroqResponse()}\n\`\`\``;
    mockCallStage.mockResolvedValueOnce({
      answer: responseWithFences,
      reasoning: null,
      tokensIn: 10,
      tokensOut: 20,
    });

    const steps = await decomposeWorkflow({
      painPath: "referrals",
      challengeText: "Referral issues",
      goal: undefined,
      recommendedTaskTitle: "Referral workflow",
    });

    expect(steps).toHaveLength(1);
  });

  it("returns multiple steps with parentId links intact", async () => {
    const steps = [
      { ...VALID_STEP_JSON, id: "1", parentId: null, order: 0 },
      {
        ...VALID_STEP_JSON,
        id: "1.1",
        parentId: "1",
        order: 0,
        title: "Review referral form",
      },
      {
        ...VALID_STEP_JSON,
        id: "1.2",
        parentId: "1",
        order: 1,
        title: "Enter data into EHR",
      },
    ];
    mockCallStage.mockResolvedValueOnce({
      answer: makeValidGroqResponse(steps),
      reasoning: null,
      tokensIn: 30,
      tokensOut: 60,
    });

    const result = await decomposeWorkflow({
      painPath: "referrals",
      challengeText: "Referral tracking",
      goal: "Track all referrals",
      recommendedTaskTitle: "Referral intake",
    });

    expect(result).toHaveLength(3);
    expect(result[0]!.parentId).toBeNull();
    expect(result[1]!.parentId).toBe("1");
    expect(result[2]!.parentId).toBe("1");
    // All get sentinel defaults.
    result.forEach((s) => {
      expect(s.aiRung).toBe("none");
      expect(s.lynchpinScore).toBe(0);
    });
  });
});
