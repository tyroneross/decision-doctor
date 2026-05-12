// C2 — select-lynchpins.test.ts
//
// Pure function — no mocks needed.

import { describe, it, expect } from "vitest";
import { selectLynchpins } from "../select-lynchpins";
import type { ActivityStep } from "@/lib/engine/types";

// ---------------------------------------------------------------------------
// Fixture helper
// ---------------------------------------------------------------------------

function makeStep(
  id: string,
  lynchpinScore: number,
  userPain: 1 | 2 | 3 | 4 | 5 = 3,
  systemImpact: 1 | 2 | 3 | 4 | 5 = 3,
  aiRung: "none" | "prompt" | "skill" | "plugin" | "agent" = "prompt",
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
      predictability: 3,
      volume: 3,
      dataAvailability: 3,
      exceptionFrequency: 3,
      compositeScore: 0.5,
    },
    aiRung,
    aiSuggestion: null,
    systemImpact,
    userPain,
    lynchpinScore,
    isLynchpin: false,
    evolutionNotes: null,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("selectLynchpins", () => {
  it("returns empty when given empty array", () => {
    const result = selectLynchpins([]);
    expect(result.steps).toEqual([]);
    expect(result.startHereStepIds).toEqual([]);
    expect(result.rationale).toBe("");
  });

  it("returns empty startHereStepIds when no steps meet threshold (< 0.3)", () => {
    const steps = [
      makeStep("a", 0.1),
      makeStep("b", 0.2),
      makeStep("c", 0.29),
    ];
    const result = selectLynchpins(steps);
    expect(result.startHereStepIds).toHaveLength(0);
    expect(result.rationale).toContain("No steps met the lynchpin threshold");
    // isLynchpin stays false for all.
    result.steps.forEach((s) => expect(s.isLynchpin).toBe(false));
  });

  it("selects 1 lynchpin when only 1 step meets threshold", () => {
    const steps = [
      makeStep("a", 0.8),
      makeStep("b", 0.1),
      makeStep("c", 0.2),
    ];
    const result = selectLynchpins(steps);
    expect(result.startHereStepIds).toEqual(["a"]);
    const markedA = result.steps.find((s) => s.id === "a")!;
    const markedB = result.steps.find((s) => s.id === "b")!;
    expect(markedA.isLynchpin).toBe(true);
    expect(markedB.isLynchpin).toBe(false);
  });

  it("selects up to 3 lynchpins even when 5 candidates are above threshold", () => {
    const steps = [
      makeStep("a", 0.9),
      makeStep("b", 0.85),
      makeStep("c", 0.8),
      makeStep("d", 0.75),
      makeStep("e", 0.7),
    ];
    const result = selectLynchpins(steps);
    expect(result.startHereStepIds.length).toBeLessThanOrEqual(3);
    expect(result.startHereStepIds).toHaveLength(3);
    expect(result.startHereStepIds).toEqual(["a", "b", "c"]);
  });

  it("selects top 3 by score when given exactly 3 eligible", () => {
    const steps = [
      makeStep("low", 0.35),
      makeStep("mid", 0.6),
      makeStep("high", 0.9),
    ];
    const result = selectLynchpins(steps);
    expect(result.startHereStepIds).toHaveLength(3);
    // All above 0.3 — top 3 by score.
    expect(result.startHereStepIds[0]).toBe("high");
    expect(result.startHereStepIds[1]).toBe("mid");
    expect(result.startHereStepIds[2]).toBe("low");
  });

  it("does NOT mutate the input array", () => {
    const steps = [makeStep("x", 0.8)];
    const originalIsLynchpin = steps[0]!.isLynchpin;
    selectLynchpins(steps);
    expect(steps[0]!.isLynchpin).toBe(originalIsLynchpin);
  });

  it("startHereStepIds.length is always ≤ 3", () => {
    // 10 high-scoring steps — only top 3 should be returned.
    const steps = Array.from({ length: 10 }, (_, i) =>
      makeStep(String(i), 0.9 - i * 0.05),
    );
    const result = selectLynchpins(steps);
    expect(result.startHereStepIds.length).toBeLessThanOrEqual(3);
  });

  it("includes pain and impact info in rationale for each lynchpin", () => {
    const steps = [makeStep("a", 0.8, 4, 5, "prompt")];
    const result = selectLynchpins(steps);
    expect(result.rationale).toContain("4/5");
    expect(result.rationale).toContain("5/5");
    expect(result.rationale).toContain("prompt");
  });
});
