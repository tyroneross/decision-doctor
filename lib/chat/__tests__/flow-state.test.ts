// Tests for lib/chat/flow-state.ts — derivation + capability helpers + transitions.

import { describe, it, expect } from "vitest";
import {
  deriveFlowState,
  shouldFireDetector,
  canSubmitFreeText,
  isSaveSkillEligible,
  isValidTransition,
  reachableFrom,
  type MessageForFlow,
} from "../flow-state";

// ─── Fixtures ──────────────────────────────────────────────────────────

function user(content = "hi"): MessageForFlow {
  return { role: "user" };
}
function assistant(extras: Partial<MessageForFlow> = {}): MessageForFlow {
  return { role: "assistant", ...extras };
}

// ─── deriveFlowState ───────────────────────────────────────────────────

describe("deriveFlowState", () => {
  it("returns idle on an empty thread", () => {
    expect(deriveFlowState([]).state).toBe("idle");
  });

  it("returns idle when only a user message is present (no assistant reply yet)", () => {
    expect(deriveFlowState([user()]).state).toBe("idle");
  });

  it("returns idle when the most recent assistant reply has no affordance", () => {
    const r = deriveFlowState([user(), assistant()]);
    expect(r.state).toBe("idle");
  });

  it("returns conversational on an unresolved clarifier widget", () => {
    const r = deriveFlowState([user(), assistant({ clarifier: { kind: "slider" } })]);
    expect(r.state).toBe("conversational");
    expect(r.pendingClarifierMessageIndex).toBe(1);
  });

  it("returns idle after the clarifier is resolved", () => {
    const r = deriveFlowState([
      user(),
      assistant({ clarifier: { kind: "slider" }, clarifierResolved: true }),
      user("$200"),
    ]);
    expect(r.state).toBe("idle");
  });

  it("returns survey on an unresolved survey card", () => {
    const r = deriveFlowState([
      user(),
      assistant({ survey: { id: "s" } }),
    ]);
    expect(r.state).toBe("survey");
    expect(r.pendingSurveyMessageIndex).toBe(1);
  });

  it("returns idle after the survey is submitted (resolved)", () => {
    const r = deriveFlowState([
      user(),
      assistant({ survey: { id: "s" }, surveyResolved: true }),
      user("answers..."),
    ]);
    expect(r.state).toBe("idle");
  });

  it("returns resolved when the engine output carries an unresolved save offer", () => {
    const r = deriveFlowState([
      user(),
      assistant({ survey: { id: "s" }, surveyResolved: true }),
      user("answers..."),
      assistant({ savedFromSurvey: { survey: { id: "s" } } }),
    ]);
    expect(r.state).toBe("resolved");
    expect(r.pendingSaveMessageIndex).toBe(3);
  });

  it("returns idle after the save offer is dismissed/saved", () => {
    const r = deriveFlowState([
      user(),
      assistant({
        savedFromSurvey: { survey: { id: "s" } },
        saveSkillResolved: true,
      }),
    ]);
    expect(r.state).toBe("idle");
  });

  it("most recent unresolved affordance wins (resolved > clarifier on the same message)", () => {
    // An engine-output message with both savedFromSurvey AND a leftover
    // clarifier shouldn't happen in practice, but the priority order
    // (survey > resolved > clarifier) determines the state.
    const r = deriveFlowState([
      user(),
      assistant({
        savedFromSurvey: { survey: { id: "s" } },
        clarifier: { kind: "slider" },
      }),
    ]);
    expect(r.state).toBe("resolved");
  });

  it("survey wins over resolved when both are present on the same message", () => {
    const r = deriveFlowState([
      user(),
      assistant({
        survey: { id: "s" },
        savedFromSurvey: { survey: { id: "old" } },
      }),
    ]);
    expect(r.state).toBe("survey");
  });

  it("walks backward — burrying a resolved affordance under a fresh user message keeps the state at the live affordance", () => {
    // Scenario: thread had a resolved decision, user followed up, no new
    // affordance yet → idle (the live state walks all the way back).
    const r = deriveFlowState([
      user("first decision question"),
      assistant({
        savedFromSurvey: { survey: { id: "s" } },
        saveSkillResolved: true,
      }),
      user("follow-up question"),
    ]);
    expect(r.state).toBe("idle");
  });
});

// ─── Capability helpers ────────────────────────────────────────────────

describe("capability helpers", () => {
  describe("shouldFireDetector", () => {
    it("fires only in idle", () => {
      expect(shouldFireDetector("idle")).toBe(true);
      expect(shouldFireDetector("conversational")).toBe(false);
      expect(shouldFireDetector("survey")).toBe(false);
      expect(shouldFireDetector("resolved")).toBe(false);
    });
  });

  describe("canSubmitFreeText", () => {
    it("blocks free text only in survey", () => {
      expect(canSubmitFreeText("idle")).toBe(true);
      expect(canSubmitFreeText("conversational")).toBe(true);
      expect(canSubmitFreeText("survey")).toBe(false);
      expect(canSubmitFreeText("resolved")).toBe(true);
    });
  });

  describe("isSaveSkillEligible", () => {
    it("eligible only in resolved", () => {
      expect(isSaveSkillEligible("idle")).toBe(false);
      expect(isSaveSkillEligible("conversational")).toBe(false);
      expect(isSaveSkillEligible("survey")).toBe(false);
      expect(isSaveSkillEligible("resolved")).toBe(true);
    });
  });
});

// ─── Transition map ────────────────────────────────────────────────────

describe("isValidTransition", () => {
  it("self-edges are always valid", () => {
    for (const s of ["idle", "conversational", "survey", "resolved"] as const) {
      expect(isValidTransition(s, s)).toBe(true);
    }
  });

  it("idle → conversational is valid (first decision question)", () => {
    expect(isValidTransition("idle", "conversational")).toBe(true);
  });

  it("idle → survey is valid (direct survey path)", () => {
    expect(isValidTransition("idle", "survey")).toBe(true);
  });

  it("idle → resolved is NOT valid (engine can't run without intake)", () => {
    expect(isValidTransition("idle", "resolved")).toBe(false);
  });

  it("conversational → survey is valid (user accepts offer)", () => {
    expect(isValidTransition("conversational", "survey")).toBe(true);
  });

  it("conversational → resolved is valid (engine ready from conversational)", () => {
    expect(isValidTransition("conversational", "resolved")).toBe(true);
  });

  it("conversational → idle is valid (engine ran on conversational path, no save chip)", () => {
    expect(isValidTransition("conversational", "idle")).toBe(true);
  });

  it("survey → resolved is valid (submitted)", () => {
    expect(isValidTransition("survey", "resolved")).toBe(true);
  });

  it("survey → conversational is valid (cancel or unmappable)", () => {
    expect(isValidTransition("survey", "conversational")).toBe(true);
  });

  it("survey → idle is NOT valid (user must submit or cancel into conversational)", () => {
    expect(isValidTransition("survey", "idle")).toBe(false);
  });

  it("resolved → idle is valid (save or dismiss)", () => {
    expect(isValidTransition("resolved", "idle")).toBe(true);
  });

  it("resolved → conversational is valid (follow-up question)", () => {
    expect(isValidTransition("resolved", "conversational")).toBe(true);
  });

  it("resolved → survey is NOT valid directly (must go through conversational or idle first)", () => {
    expect(isValidTransition("resolved", "survey")).toBe(false);
  });
});

describe("reachableFrom", () => {
  it("includes the state itself plus all forward transitions", () => {
    const r = reachableFrom("idle");
    expect(r).toContain("idle");
    expect(r).toContain("conversational");
    expect(r).toContain("survey");
    expect(r).not.toContain("resolved");
  });
});
