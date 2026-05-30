// Contract tests for hiring-decision routing + WHY-first fallback.
//
// Stream 2 of the feat/custom-challenge-engine build (2026-05-13). These
// tests guard the routing decisions the controller makes for
// hiring-shaped custom challenges — the user complaint that triggered
// this work was that "decide whether to hire an admin assistant" was
// being asked frequency/duration questions instead of WHY-shaped ones.

import { describe, expect, it } from "vitest";
import {
  isHiringShapedChallenge,
  nextStep,
  type IntentDetector,
} from "../controller";
import type { DecisionDetection } from "@/lib/chat/decision-detector";

const detectorYes: IntentDetector = async (): Promise<DecisionDetection> => ({
  kind: "decision",
  confidence: 0.92,
  suggestedPath: "decision",
  rationale: "Rule 1: 'should I hire' — discrete decision.",
});

const detectorNo: IntentDetector = async (): Promise<DecisionDetection> => ({
  kind: "not-decision",
  confidence: 0.85,
  suggestedPath: null,
  rationale: "Rule 9: pain-narrative without an explicit yes/no choice.",
});

describe("isHiringShapedChallenge — keyword pre-filter", () => {
  it.each([
    ["decide whether to hire an admin assistant", true],
    ["should I hire a virtual assistant?", true],
    ["I'm thinking about hiring a biller", true],
    ["delegate insurance claims to a contractor", true],
    ["should I outsource phone coverage to a VA?", true],
    ["should I hire an associate to share call?", true],
  ])("matches %o → %s", (text, expected) => {
    expect(isHiringShapedChallenge(text)).toBe(expected);
  });

  it.each([
    ["reduce intake form chaos", false],
    ["my schedule keeps slipping past 7pm", false],
    ["how do I keep up with research?", false],
    ["", false],
    [undefined, false],
  ])("does not match %o → %s", (text, expected) => {
    expect(isHiringShapedChallenge(text)).toBe(expected);
  });
});

describe("nextStep — route_to_decision for hiring challenges", () => {
  it("routes 'decide whether to hire an admin assistant' to admin-hire template", async () => {
    const result = await nextStep(
      {
        challengeText: "decide whether to hire an admin assistant",
        painPath: "custom",
      },
      { detector: detectorYes },
    );

    expect(result.action).toBe("route_to_decision");
    if (result.action !== "route_to_decision") {
      throw new Error("expected route_to_decision");
    }
    expect(result.suggestedTemplate).toBe("admin-hire");
    expect(result.confidence).toBeGreaterThanOrEqual(0.7);
    expect(result.rationale).toMatch(/Rule 1/);
  });

  it("routes 'should I hire a virtual assistant' to admin-hire template", async () => {
    const result = await nextStep(
      {
        challengeText: "should I hire a virtual assistant?",
        painPath: "custom",
      },
      { detector: detectorYes },
    );

    expect(result.action).toBe("route_to_decision");
    if (result.action !== "route_to_decision") {
      throw new Error("expected route_to_decision");
    }
    expect(result.suggestedTemplate).toBe("admin-hire");
  });

  it("does NOT route 'reduce intake form chaos' — stays on pain pipeline", async () => {
    const result = await nextStep(
      {
        challengeText: "reduce intake form chaos in my practice",
        painPath: "custom",
      },
      { detector: detectorYes }, // would-be positive, but keyword gate must reject first
    );

    expect(result.action).not.toBe("route_to_decision");
  });

  it("suppresses routing when state.routingDeclined === true", async () => {
    const result = await nextStep(
      {
        state: {
          challengeText: "decide whether to hire an admin assistant",
          painPath: "custom",
          scoringInput: {},
          answers: [],
          assumptions: [],
          askedTopics: [],
          challengedTopics: [],
          filledPaths: ["painPath"],
          questionCount: 0,
          routingDeclined: true,
        },
      },
      { detector: detectorYes },
    );

    expect(result.action).not.toBe("route_to_decision");
  });

  it("does NOT route when LLM detector returns not-decision (e.g., pure venting)", async () => {
    const result = await nextStep(
      {
        challengeText: "we hired three admin assistants last year and it was a mess",
        painPath: "custom",
      },
      { detector: detectorNo },
    );

    // Keyword gate fires (hire), LLM detector says not-decision → no routing.
    expect(result.action).not.toBe("route_to_decision");
  });

  it("does NOT route when detector throws (graceful degradation)", async () => {
    const detectorThrows: IntentDetector = async () => {
      throw new Error("simulated Groq outage");
    };
    const result = await nextStep(
      {
        challengeText: "should I hire an admin assistant",
        painPath: "custom",
      },
      { detector: detectorThrows },
    );

    expect(result.action).not.toBe("route_to_decision");
  });
});

describe("nextStep — WHY-first fallback for declined hiring challenges", () => {
  it("first ask is 'what's driving this' when user declined routing", async () => {
    const result = await nextStep(
      {
        state: {
          challengeText: "decide whether to hire an admin assistant",
          painPath: "custom",
          scoringInput: {},
          answers: [],
          assumptions: [],
          askedTopics: [],
          challengedTopics: [],
          filledPaths: ["painPath"],
          questionCount: 0,
          routingDeclined: true,
        },
      },
      { detector: detectorYes },
    );

    expect(result.action).toBe("ask");
    if (result.action !== "ask") throw new Error("expected ask");
    expect(result.question.topic).toBe("hiring_driver");
    expect(result.question.widget.label).toMatch(/driving/i);
  });

  it("first ask is 'what's driving this' for admin-path hiring text (no routing dispatched)", async () => {
    // Variant: painPath=admin (came from a pain-card click). Routing is
    // dispatched, but if detector says decision, we'd route. To prove
    // WHY-first beats frequency, use detector=detectorNo so we skip routing
    // entirely and exercise buildUnknowns ordering.
    const result = await nextStep(
      {
        challengeText: "my admin work is overwhelming, considering hiring help",
        painPath: "admin",
      },
      { detector: detectorNo },
    );

    expect(result.action).toBe("ask");
    if (result.action !== "ask") throw new Error("expected ask");
    expect(result.question.topic).toBe("hiring_driver");
    expect(result.question.topic).not.toBe("frequency");
    expect(result.question.topic).not.toBe("time_burden");
  });

  it("non-hiring custom challenge still asks frequency first (no regression)", async () => {
    const result = await nextStep(
      {
        challengeText: "every Monday I spend 3 hours reconciling intake forms",
        painPath: "custom",
      },
      { detector: detectorNo },
    );

    expect(result.action).toBe("ask");
    if (result.action !== "ask") throw new Error("expected ask");
    // pain_path is unfilled when painPath=custom AND classifier doesn't
    // confidently re-classify, so the first question may be pain_path OR
    // frequency. Either way it MUST NOT be hiring_driver.
    expect(result.question.topic).not.toBe("hiring_driver");
  });
});
