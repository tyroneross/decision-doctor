// Tests for lib/chat/decision-detector.ts
//
// Mocks @/lib/groq.callStage so no real Groq calls are made.

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

// Hoisted shared callStage mock so all test cases share one stub.
const mocks = vi.hoisted(() => ({
  callStage: vi.fn(),
}));

vi.mock("@/lib/groq", () => ({
  callStage: mocks.callStage,
}));

import {
  detectDecisionIntent,
  shouldOfferHelp,
  MIN_CONFIDENCE,
  __resetPromptCacheForTests,
} from "../decision-detector";

function mockResponse(json: object | string): void {
  const answer = typeof json === "string" ? json : JSON.stringify(json);
  mocks.callStage.mockResolvedValueOnce({
    answer,
    reasoning: null,
    tokensIn: 1,
    tokensOut: 1,
  });
}

describe("detectDecisionIntent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    __resetPromptCacheForTests();
  });

  it("classifies a pricing question as decision/decision", async () => {
    mockResponse({
      kind: "decision",
      confidence: 0.92,
      suggestedPath: "decision",
      rationale: "Rule 2: how much should I on pricing",
    });
    const result = await detectDecisionIntent(
      "How much should I raise my prices for my psychiatry private practice?",
    );
    expect(result.kind).toBe("decision");
    expect(result.suggestedPath).toBe("decision");
    expect(result.confidence).toBe(0.92);
  });

  it("classifies a tool question as decision/recommendation", async () => {
    mockResponse({
      kind: "decision",
      confidence: 0.88,
      suggestedPath: "recommendation",
      rationale: "Rule 4: what scribe should I use",
    });
    const result = await detectDecisionIntent(
      "What AI scribe should I use for my practice?",
    );
    expect(result.kind).toBe("decision");
    expect(result.suggestedPath).toBe("recommendation");
  });

  it("classifies a fact lookup as not-decision", async () => {
    mockResponse({
      kind: "not-decision",
      confidence: 0.92,
      suggestedPath: null,
      rationale: "Rule 7: factual lookup",
    });
    const result = await detectDecisionIntent(
      "What's the latest version of TypeScript?",
    );
    expect(result.kind).toBe("not-decision");
    expect(result.suggestedPath).toBeNull();
  });

  it("returns not-decision with confidence 0 when groq throws", async () => {
    mocks.callStage.mockRejectedValueOnce(new Error("network"));
    const result = await detectDecisionIntent("anything");
    expect(result.kind).toBe("not-decision");
    expect(result.confidence).toBe(0);
    expect(result.rationale).toBe("detector unavailable");
  });

  it("returns not-decision on unparseable response", async () => {
    mockResponse("not valid json {{{");
    const result = await detectDecisionIntent("anything");
    expect(result.kind).toBe("not-decision");
    expect(result.confidence).toBe(0);
    expect(result.rationale).toBe("parse failure");
  });

  it("tolerates fenced JSON output from the model", async () => {
    mockResponse(
      '```json\n{"kind":"decision","confidence":0.9,"suggestedPath":"decision","rationale":"r"}\n```',
    );
    const result = await detectDecisionIntent("Should I raise rates?");
    expect(result.kind).toBe("decision");
    expect(result.confidence).toBe(0.9);
  });

  it("rejects confidence outside [0, 1]", async () => {
    mockResponse({
      kind: "decision",
      confidence: 1.5,
      suggestedPath: "decision",
      rationale: "out of range",
    });
    const result = await detectDecisionIntent("anything");
    expect(result.kind).toBe("not-decision");
  });

  it("rejects malformed payload (suggestedPath set on not-decision)", async () => {
    mockResponse({
      kind: "not-decision",
      confidence: 0.8,
      suggestedPath: "decision",
      rationale: "bad payload",
    });
    const result = await detectDecisionIntent("anything");
    expect(result.kind).toBe("not-decision");
    expect(result.confidence).toBe(0);
  });

  it("short-circuits on empty input without calling Groq", async () => {
    const result = await detectDecisionIntent("   ");
    expect(result.kind).toBe("not-decision");
    expect(result.confidence).toBe(0);
    expect(mocks.callStage).not.toHaveBeenCalled();
  });
});

describe("shouldOfferHelp", () => {
  it("returns true when kind=decision and confidence ≥ MIN_CONFIDENCE", () => {
    expect(
      shouldOfferHelp({
        kind: "decision",
        confidence: MIN_CONFIDENCE,
        suggestedPath: "decision",
        rationale: "",
      }),
    ).toBe(true);
  });

  it("returns false when kind=not-decision", () => {
    expect(
      shouldOfferHelp({
        kind: "not-decision",
        confidence: 0.9,
        suggestedPath: null,
        rationale: "",
      }),
    ).toBe(false);
  });

  it("returns false when confidence below threshold", () => {
    expect(
      shouldOfferHelp({
        kind: "decision",
        confidence: MIN_CONFIDENCE - 0.01,
        suggestedPath: "decision",
        rationale: "",
      }),
    ).toBe(false);
  });
});
