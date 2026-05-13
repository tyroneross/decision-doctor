// Tests for lib/chat/survey-adapter.ts

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({ callStage: vi.fn() }));

vi.mock("@/lib/groq", () => ({ callStage: mocks.callStage }));

import {
  adaptSubmission,
  __resetPromptCacheForTests,
} from "../survey-adapter";
import type { Survey, SurveySubmission } from "@/lib/engine/survey";

function mockGroq(payload: object | string): void {
  mocks.callStage.mockResolvedValueOnce({
    answer: typeof payload === "string" ? payload : JSON.stringify(payload),
    reasoning: null,
    tokensIn: 1,
    tokensOut: 1,
  });
}

const survey: Survey = {
  id: "pricing-x",
  title: "Plan your next price change",
  fields: [
    {
      kind: "stepper",
      id: "currentRateUSD",
      label: "Current rate?",
      min: 0,
      max: 2000,
      defaultValue: 200,
      unit: "$",
    },
    {
      kind: "single-select",
      id: "riskTolerance",
      label: "Risk?",
      options: [
        { value: "low", label: "Low" },
        { value: "medium", label: "Medium" },
        { value: "high", label: "High" },
      ],
    },
  ],
  submitLabel: "Show",
  suggestedPath: "decision",
};

const submission: SurveySubmission = {
  surveyId: "pricing-x",
  answers: {
    currentRateUSD: { kind: "number", value: 200 },
    riskTolerance: { kind: "single", value: "medium" },
  },
};

describe("adaptSubmission", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    __resetPromptCacheForTests();
  });

  it("returns a typed decision input when the LLM emits a valid pricing mapping", async () => {
    mockGroq({
      kind: "decision",
      templateId: "pricing",
      fields: {
        currentRateUSD: 200,
        monthsSinceLastIncrease: 12,
        insuranceShare: 50,
        cashShare: 50,
        avgFillRate: 85,
        competitorBenchmarkUSD: 250,
        riskTolerance: "medium",
      },
    });
    const result = await adaptSubmission({
      userQuestion: "How much should I raise my prices?",
      survey,
      submission,
    });
    expect(result).not.toBeNull();
    expect(result!.kind).toBe("decision");
    if (result?.kind === "decision") {
      expect(result.templateId).toBe("pricing");
      expect(result.fields.currentRateUSD).toBe(200);
      expect(result.fields.riskTolerance).toBe("medium");
    }
  });

  it("returns a typed recommendation input when the LLM emits a valid recommendation mapping", async () => {
    mockGroq({
      kind: "recommendation",
      painPath: "admin",
      challengeText:
        "Solo psychiatry practice on SimplePractice, 25 sessions per week, high concern for patient data sensitivity. Wants an AI scribe that reduces note-taking without compromising compliance.",
      goal: "Pick a scribe that fits my EHR and protects patient data.",
      scoringInput: {
        painSeverity: 4,
        frequency: 5,
        timeBurden: 4,
        riskTolerance: 2,
        aiComfort: 3,
        dataReadiness: 3,
      },
    });
    const result = await adaptSubmission({
      userQuestion: "What AI scribe should I use?",
      survey,
      submission,
    });
    expect(result).not.toBeNull();
    expect(result!.kind).toBe("recommendation");
    if (result?.kind === "recommendation") {
      expect(result.painPath).toBe("admin");
      expect(result.scoringInput.painSeverity).toBe(4);
    }
  });

  it("returns null when the LLM emits 'unmappable'", async () => {
    mockGroq({ kind: "unmappable", reason: "decision shape not covered" });
    const result = await adaptSubmission({
      userQuestion: "Should I move to Portland?",
      survey,
      submission,
    });
    expect(result).toBeNull();
  });

  it("returns null when templateId is invalid", async () => {
    mockGroq({
      kind: "decision",
      templateId: "real-estate",
      fields: {},
    });
    const result = await adaptSubmission({
      userQuestion: "x",
      survey,
      submission,
    });
    expect(result).toBeNull();
  });

  it("returns null when painPath is invalid", async () => {
    mockGroq({
      kind: "recommendation",
      painPath: "bogus",
      challengeText:
        "Some long challenge text that is over sixty characters so the zod validator does not reject on length grounds.",
      goal: "Pick something.",
      scoringInput: {
        painSeverity: 3,
        frequency: 3,
        timeBurden: 3,
        riskTolerance: 3,
        aiComfort: 3,
        dataReadiness: 3,
      },
    });
    const result = await adaptSubmission({
      userQuestion: "x",
      survey,
      submission,
    });
    expect(result).toBeNull();
  });

  it("returns null when challengeText is too short", async () => {
    mockGroq({
      kind: "recommendation",
      painPath: "admin",
      challengeText: "too short",
      goal: "x",
      scoringInput: {
        painSeverity: 3,
        frequency: 3,
        timeBurden: 3,
        riskTolerance: 3,
        aiComfort: 3,
        dataReadiness: 3,
      },
    });
    const result = await adaptSubmission({
      userQuestion: "x",
      survey,
      submission,
    });
    expect(result).toBeNull();
  });

  it("returns null when Groq throws", async () => {
    mocks.callStage.mockRejectedValueOnce(new Error("network"));
    const result = await adaptSubmission({
      userQuestion: "x",
      survey,
      submission,
    });
    expect(result).toBeNull();
  });

  it("returns null on unparseable JSON", async () => {
    mockGroq("not json {{{");
    const result = await adaptSubmission({
      userQuestion: "x",
      survey,
      submission,
    });
    expect(result).toBeNull();
  });

  it("tolerates fenced JSON output", async () => {
    mockGroq(
      '```json\n' +
        JSON.stringify({
          kind: "decision",
          templateId: "pricing",
          fields: {
            currentRateUSD: 200,
            monthsSinceLastIncrease: 12,
            insuranceShare: 50,
            cashShare: 50,
            avgFillRate: 85,
            competitorBenchmarkUSD: 250,
            riskTolerance: "medium",
          },
        }) +
        "\n```",
    );
    const result = await adaptSubmission({
      userQuestion: "x",
      survey,
      submission,
    });
    expect(result).not.toBeNull();
  });

  it("returns null on empty question", async () => {
    const result = await adaptSubmission({
      userQuestion: "   ",
      survey,
      submission,
    });
    expect(result).toBeNull();
    expect(mocks.callStage).not.toHaveBeenCalled();
  });

  it("returns null when scoringInput axes are out of range", async () => {
    mockGroq({
      kind: "recommendation",
      painPath: "admin",
      challengeText:
        "A sufficiently long challenge text for the validator to accept by length, more than sixty characters total here for sure.",
      goal: "Pick something.",
      scoringInput: {
        painSeverity: 7, // out of [1,5]
        frequency: 3,
        timeBurden: 3,
        riskTolerance: 3,
        aiComfort: 3,
        dataReadiness: 3,
      },
    });
    const result = await adaptSubmission({
      userQuestion: "x",
      survey,
      submission,
    });
    expect(result).toBeNull();
  });
});
