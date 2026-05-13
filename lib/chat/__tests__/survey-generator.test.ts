// Tests for lib/chat/survey-generator.ts and the Survey schema.

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  callStage: vi.fn(),
}));

vi.mock("@/lib/groq", () => ({
  callStage: mocks.callStage,
}));

import {
  generateSurvey,
  __resetPromptCacheForTests,
} from "../survey-generator";
import {
  parseSurvey,
  parseSurveySubmission,
  formatSubmissionAsMessage,
  type Survey,
} from "@/lib/engine/survey";

function makeValidSurveyJson(): string {
  return JSON.stringify({
    id: "pricing-raise",
    title: "Plan your next price change",
    intro: "Quick questions.",
    fields: [
      {
        kind: "stepper",
        id: "current_fee",
        label: "Current fee?",
        min: 50,
        max: 600,
        step: 5,
        defaultValue: 200,
        unit: "$",
      },
      {
        kind: "range",
        id: "target_fee",
        label: "Range you're considering?",
        min: 50,
        max: 800,
        defaultLo: 220,
        defaultHi: 280,
        unit: "$",
      },
      {
        kind: "single-select",
        id: "priority",
        label: "What matters most?",
        options: [
          { value: "income", label: "Income" },
          { value: "retention", label: "Retention" },
        ],
      },
    ],
    submitLabel: "Show my recommendation",
    suggestedPath: "decision",
  });
}

function mockGroq(answer: string | object): void {
  mocks.callStage.mockResolvedValueOnce({
    answer: typeof answer === "string" ? answer : JSON.stringify(answer),
    reasoning: null,
    tokensIn: 1,
    tokensOut: 1,
  });
}

// ─── generateSurvey ────────────────────────────────────────────────────

describe("generateSurvey", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    __resetPromptCacheForTests();
  });

  it("produces a valid Survey from a well-formed LLM response", async () => {
    mockGroq(makeValidSurveyJson());
    const result = await generateSurvey({
      question: "How much should I raise my prices?",
      suggestedPath: "decision",
    });
    expect(result).not.toBeNull();
    expect(result!.fields.length).toBe(3);
    expect(result!.suggestedPath).toBe("decision");
    expect(result!.id).toMatch(/[a-zA-Z0-9_-]+-[a-f0-9]{6}/);
  });

  it("overrides the LLM's suggestedPath with the detector's classification", async () => {
    mockGroq(
      JSON.stringify({
        ...JSON.parse(makeValidSurveyJson()),
        suggestedPath: "recommendation", // model says recommendation
      }),
    );
    const result = await generateSurvey({
      question: "How much should I charge?",
      suggestedPath: "decision", // detector says decision
    });
    expect(result?.suggestedPath).toBe("decision");
  });

  it("returns null when Groq throws", async () => {
    mocks.callStage.mockRejectedValueOnce(new Error("network"));
    const result = await generateSurvey({
      question: "anything",
      suggestedPath: "decision",
    });
    expect(result).toBeNull();
  });

  it("returns null when LLM returns unparseable JSON", async () => {
    mockGroq("totally not json {{{");
    const result = await generateSurvey({
      question: "anything",
      suggestedPath: "decision",
    });
    expect(result).toBeNull();
  });

  it("tolerates fenced JSON output", async () => {
    mockGroq("```json\n" + makeValidSurveyJson() + "\n```");
    const result = await generateSurvey({
      question: "How much should I raise?",
      suggestedPath: "decision",
    });
    expect(result).not.toBeNull();
  });

  it("returns null when survey schema is violated (too many fields)", async () => {
    const tooMany = JSON.parse(makeValidSurveyJson());
    // 9 fields, exceeds max 8
    tooMany.fields = Array.from({ length: 9 }, (_, i) => ({
      kind: "text",
      id: `f${i}`,
      label: `Field ${i}`,
    }));
    mockGroq(JSON.stringify(tooMany));
    const result = await generateSurvey({
      question: "anything",
      suggestedPath: "decision",
    });
    expect(result).toBeNull();
  });

  it("returns null on empty question", async () => {
    const result = await generateSurvey({
      question: "   ",
      suggestedPath: "decision",
    });
    expect(result).toBeNull();
    expect(mocks.callStage).not.toHaveBeenCalled();
  });
});

// ─── Survey schema ─────────────────────────────────────────────────────

describe("parseSurvey", () => {
  it("accepts a well-formed survey", () => {
    const survey = parseSurvey(JSON.parse(makeValidSurveyJson()));
    expect(survey).not.toBeNull();
    expect(survey!.fields[0]!.kind).toBe("stepper");
  });

  it("rejects when fields is empty", () => {
    const bad = JSON.parse(makeValidSurveyJson());
    bad.fields = [];
    expect(parseSurvey(bad)).toBeNull();
  });

  it("rejects when suggestedPath is invalid", () => {
    const bad = JSON.parse(makeValidSurveyJson());
    bad.suggestedPath = "bogus";
    expect(parseSurvey(bad)).toBeNull();
  });

  it("rejects an unknown field kind", () => {
    const bad = JSON.parse(makeValidSurveyJson());
    bad.fields[0] = { kind: "bogus", id: "x", label: "y" };
    expect(parseSurvey(bad)).toBeNull();
  });

  it("rejects single-select with only one option", () => {
    const bad = JSON.parse(makeValidSurveyJson());
    bad.fields[2] = {
      kind: "single-select",
      id: "p",
      label: "?",
      options: [{ value: "only", label: "Only" }],
    };
    expect(parseSurvey(bad)).toBeNull();
  });
});

// ─── SurveySubmission ──────────────────────────────────────────────────

describe("parseSurveySubmission", () => {
  it("accepts a well-formed submission", () => {
    const sub = parseSurveySubmission({
      surveyId: "x",
      answers: {
        current_fee: { kind: "number", value: 200 },
        target_fee: { kind: "range", lo: 220, hi: 280 },
        priority: { kind: "single", value: "income" },
      },
    });
    expect(sub).not.toBeNull();
    expect(Object.keys(sub!.answers).length).toBe(3);
  });

  it("rejects when a value has the wrong shape for its kind", () => {
    const sub = parseSurveySubmission({
      surveyId: "x",
      answers: {
        bad: { kind: "range", value: 5 }, // range needs lo+hi
      },
    });
    expect(sub).toBeNull();
  });
});

// ─── formatSubmissionAsMessage ─────────────────────────────────────────

describe("formatSubmissionAsMessage", () => {
  it("formats stepper/range/single values with units and labels", () => {
    const survey = parseSurvey(JSON.parse(makeValidSurveyJson())) as Survey;
    const msg = formatSubmissionAsMessage(survey, {
      surveyId: survey.id,
      answers: {
        current_fee: { kind: "number", value: 200 },
        target_fee: { kind: "range", lo: 220, hi: 280 },
        priority: { kind: "single", value: "income" },
      },
    });
    expect(msg).toContain("Plan your next price change");
    expect(msg).toContain("200 $");
    expect(msg).toContain("220–280 $");
    expect(msg).toContain("Income"); // resolved from option label
  });

  it("uses '(blank)' for empty text values", () => {
    const survey = parseSurvey({
      id: "x",
      title: "T",
      fields: [{ kind: "text", id: "notes", label: "Notes" }],
      submitLabel: "Submit",
      suggestedPath: "decision",
    }) as Survey;
    const msg = formatSubmissionAsMessage(survey, {
      surveyId: "x",
      answers: { notes: { kind: "text", value: "" } },
    });
    expect(msg).toContain("(blank)");
  });
});
