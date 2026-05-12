// C2 — score-steps.test.ts
//
// Tests for scoreSteps(), compositeScoreToRung(), computeLynchpinScore().
// Mocks OpenAI client so no real API calls are made.

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

// Hoisted shared `create` stub — captured before vi.mock factories run so
// every `new OpenAI()` shares the same mock function.
const openaiMocks = vi.hoisted(() => ({ create: vi.fn() }));

vi.mock("openai", () => ({
  default: class MockOpenAI {
    chat = { completions: { create: openaiMocks.create } };
  },
}));

import {
  scoreSteps,
  compositeScoreToRung,
  computeLynchpinScore,
  __resetClientForTests,
} from "../score-steps";
import type { ActivityStep } from "@/lib/engine/types";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeStep(overrides: Partial<ActivityStep> = {}): ActivityStep {
  return {
    id: "1",
    parentId: null,
    order: 0,
    title: "Collect referral data",
    origin: "existing",
    inputs: ["Fax"],
    outputs: ["Record"],
    currentTool: "Outlook",
    jobRole: "Practice manager",
    dataNeeded: [{ source: "EHR", sensitivity: "phi" }],
    integrations: ["EHR"],
    valueClass: "value-add",
    estDurationMins: 15,
    frequencyPerMonth: 60,
    aiSuitability: {
      eloundouBeta: 0,
      predictability: 3,
      volume: 3,
      dataAvailability: 3,
      exceptionFrequency: 3,
      compositeScore: 0,
    },
    aiRung: "none",
    aiSuggestion: null,
    systemImpact: 3,
    userPain: 3,
    lynchpinScore: 0,
    isLynchpin: false,
    evolutionNotes: null,
    ...overrides,
  };
}

function makeLlmScoredStep(
  id: string,
  compositeScore: number,
  userPain: 1 | 2 | 3 | 4 | 5 = 4,
  systemImpact: 1 | 2 | 3 | 4 | 5 = 3,
) {
  return {
    id,
    aiSuitability: {
      eloundouBeta: 0.5,
      predictability: 4,
      volume: 4,
      dataAvailability: 3,
      exceptionFrequency: 4,
      compositeScore,
    },
    systemImpact,
    userPain,
    aiSuggestion: {
      label: "Use a prompt template",
      summary: "AI extracts structured fields from input",
      artifactSeed: "Summarize inbound referral for EHR entry",
      permissionTier: "T0" as const,
    },
    evolutionNotes: "Could be automated with an agent in future.",
  };
}

function makeOpenAIResponse(steps: ReturnType<typeof makeLlmScoredStep>[]) {
  return {
    choices: [
      {
        message: {
          content: JSON.stringify({ steps }),
        },
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// compositeScoreToRung — deterministic unit tests
// ---------------------------------------------------------------------------

describe("compositeScoreToRung", () => {
  it.each([
    [0, "none"],
    [0.25, "none"],
    [0.29, "none"],
    [0.3, "prompt"],
    [0.4, "prompt"],
    [0.49, "prompt"],
    [0.5, "skill"],
    [0.6, "skill"],
    [0.69, "skill"],
    [0.7, "plugin"],
    [0.8, "plugin"],
    [0.84, "plugin"],
    [0.85, "agent"],
    [0.9, "agent"],
    [1.0, "agent"],
  ])("compositeScore %f → %s", (score, expected) => {
    expect(compositeScoreToRung(score)).toBe(expected);
  });
});

// ---------------------------------------------------------------------------
// computeLynchpinScore — deterministic unit tests
// ---------------------------------------------------------------------------

describe("computeLynchpinScore", () => {
  it("computes correctly at known values", () => {
    // 0.4*(4/5) + 0.4*(3/5) + 0.2*0.6 = 0.32 + 0.24 + 0.12 = 0.68
    const score = computeLynchpinScore(4, 3, 0.6);
    expect(score).toBeCloseTo(0.68, 5);
  });

  it("clamps to 0 at minimum", () => {
    expect(computeLynchpinScore(0, 0, 0)).toBe(0);
  });

  it("clamps to 1 at maximum", () => {
    expect(computeLynchpinScore(5, 5, 1)).toBe(1);
  });

  it("mid-scale values produce mid-scale output", () => {
    // 0.4*(3/5) + 0.4*(3/5) + 0.2*0.5 = 0.24 + 0.24 + 0.10 = 0.58
    const score = computeLynchpinScore(3, 3, 0.5);
    expect(score).toBeCloseTo(0.58, 5);
  });
});

// ---------------------------------------------------------------------------
// scoreSteps — integration (OpenAI mocked)
// ---------------------------------------------------------------------------

describe("scoreSteps", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    __resetClientForTests();
    process.env.OPENAI_API_KEY = "test-key";
  });

  /** Returns the shared OpenAI.chat.completions.create mock. */
  function getCreateMock() {
    return openaiMocks.create;
  }

  it("returns empty array when given empty input", async () => {
    const result = await scoreSteps([], {
      challengeText: "test",
      goal: undefined,
      painPath: "admin",
    });
    expect(result).toEqual([]);
  });

  it("applies rung cutoffs from compositeScore", async () => {
    const steps = [
      makeStep({ id: "a" }),
      makeStep({ id: "b" }),
      makeStep({ id: "c" }),
      makeStep({ id: "d" }),
      makeStep({ id: "e" }),
    ];

    const llmSteps = [
      makeLlmScoredStep("a", 0.25), // → none
      makeLlmScoredStep("b", 0.4),  // → prompt
      makeLlmScoredStep("c", 0.6),  // → skill
      makeLlmScoredStep("d", 0.75), // → plugin
      makeLlmScoredStep("e", 0.9),  // → agent
    ];

    const createMock = getCreateMock();
    createMock.mockResolvedValueOnce(makeOpenAIResponse(llmSteps));

    const result = await scoreSteps(steps, {
      challengeText: "Test challenge",
      goal: "Test goal",
      painPath: "referrals",
    });

    expect(result).toHaveLength(5);
    expect(result[0]!.aiRung).toBe("none");
    expect(result[1]!.aiRung).toBe("prompt");
    expect(result[2]!.aiRung).toBe("skill");
    expect(result[3]!.aiRung).toBe("plugin");
    expect(result[4]!.aiRung).toBe("agent");
  });

  it("computes lynchpinScore deterministically from LLM inputs", async () => {
    const steps = [makeStep({ id: "1" })];
    // compositeScore=0.6, userPain=4, systemImpact=3
    // lynchpin = 0.4*(4/5) + 0.4*(3/5) + 0.2*0.6 = 0.32+0.24+0.12 = 0.68
    const llmSteps = [makeLlmScoredStep("1", 0.6, 4, 3)];

    const createMock = getCreateMock();
    createMock.mockResolvedValueOnce(makeOpenAIResponse(llmSteps));

    const result = await scoreSteps(steps, {
      challengeText: "Test",
      goal: undefined,
      painPath: "admin",
    });

    expect(result[0]!.lynchpinScore).toBeCloseTo(0.68, 5);
    expect(result[0]!.isLynchpin).toBe(false); // selectLynchpins flips this
  });

  it("preserves base step fields not scored by LLM", async () => {
    const step = makeStep({ id: "1", title: "Original title", jobRole: "Nurse" });
    const llmSteps = [makeLlmScoredStep("1", 0.5)];

    const createMock = getCreateMock();
    createMock.mockResolvedValueOnce(makeOpenAIResponse(llmSteps));

    const result = await scoreSteps([step], {
      challengeText: "Test",
      goal: undefined,
      painPath: "follow_up",
    });

    expect(result[0]!.title).toBe("Original title");
    expect(result[0]!.jobRole).toBe("Nurse");
  });

  it("throws when OpenAI returns empty content", async () => {
    const createMock = getCreateMock();
    createMock.mockResolvedValueOnce({
      choices: [{ message: { content: "" } }],
    });

    await expect(
      scoreSteps([makeStep()], { challengeText: "Test", goal: undefined, painPath: "admin" }),
    ).rejects.toThrow("[score-steps]");
  });

  it("throws when OpenAI returns invalid JSON", async () => {
    const createMock = getCreateMock();
    createMock.mockResolvedValueOnce({
      choices: [{ message: { content: "not valid json" } }],
    });

    await expect(
      scoreSteps([makeStep()], { challengeText: "Test", goal: undefined, painPath: "admin" }),
    ).rejects.toThrow("[score-steps]");
  });
});
