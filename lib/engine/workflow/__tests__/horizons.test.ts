// C2 — horizons.test.ts
//
// Pure function — no mocks needed.

import { describe, it, expect } from "vitest";
import { buildHorizons } from "../horizons";
import type { ActivityStep } from "@/lib/engine/types";

// ---------------------------------------------------------------------------
// Fixture helper
// ---------------------------------------------------------------------------

function makeStep(
  id: string,
  aiRung: "none" | "prompt" | "skill" | "plugin" | "agent",
  origin: "existing" | "new" = "existing",
  isLynchpin = false,
): ActivityStep {
  return {
    id,
    parentId: null,
    order: 0,
    title: `Step ${id}`,
    origin,
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
    systemImpact: 3,
    userPain: 3,
    lynchpinScore: isLynchpin ? 0.8 : 0.1,
    isLynchpin,
    evolutionNotes: null,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("buildHorizons", () => {
  it("always returns exactly 3 entries", () => {
    const horizons = buildHorizons([]);
    expect(horizons).toHaveLength(3);
  });

  it("returns entries in order: this week, this quarter, this year", () => {
    const horizons = buildHorizons([makeStep("a", "prompt", "existing", true)]);
    expect(horizons[0]!.label).toBe("this week");
    expect(horizons[1]!.label).toBe("this quarter");
    expect(horizons[2]!.label).toBe("this year");
  });

  it("assigns lynchpin prompt steps to this-week", () => {
    const steps = [
      makeStep("a", "prompt", "existing", true),
      makeStep("b", "prompt", "existing", false), // not lynchpin
      makeStep("c", "skill", "existing", false),
    ];
    const horizons = buildHorizons(steps);
    expect(horizons[0]!.upliftedStepIds).toContain("a");
    // non-lynchpin prompt is only included if no lynchpin prompts exist
    expect(horizons[0]!.upliftedStepIds).not.toContain("b");
  });

  it("falls back to any prompt step when no lynchpin prompts exist", () => {
    const steps = [
      makeStep("a", "prompt", "existing", false),
      makeStep("b", "skill", "existing", false),
    ];
    const horizons = buildHorizons(steps);
    expect(horizons[0]!.upliftedStepIds).toContain("a");
  });

  it("assigns skill and plugin steps to this-quarter", () => {
    const steps = [
      makeStep("a", "skill", "existing", false),
      makeStep("b", "plugin", "existing", false),
      makeStep("c", "agent", "existing", false),
    ];
    const horizons = buildHorizons(steps);
    expect(horizons[1]!.upliftedStepIds).toContain("a");
    expect(horizons[1]!.upliftedStepIds).toContain("b");
    expect(horizons[1]!.upliftedStepIds).not.toContain("c");
  });

  it("assigns agent steps to this-year", () => {
    const steps = [makeStep("a", "agent", "existing", false)];
    const horizons = buildHorizons(steps);
    expect(horizons[2]!.upliftedStepIds).toContain("a");
  });

  it("assigns origin=new steps to this-year newStepIds", () => {
    const steps = [makeStep("a", "prompt", "new", false)];
    const horizons = buildHorizons(steps);
    // "a" is origin=new with prompt rung — appears in this-week upliftedStepIds
    // AND in this-year newStepIds.
    expect(horizons[2]!.newStepIds).toContain("a");
  });

  it("handles empty steps without throwing", () => {
    expect(() => buildHorizons([])).not.toThrow();
    const horizons = buildHorizons([]);
    horizons.forEach((h) => {
      expect(Array.isArray(h.upliftedStepIds)).toBe(true);
      expect(Array.isArray(h.newStepIds)).toBe(true);
    });
  });

  it("none-rung steps do not appear in any horizon upliftedStepIds", () => {
    const steps = [makeStep("a", "none", "existing", false)];
    const horizons = buildHorizons(steps);
    horizons.forEach((h) => {
      expect(h.upliftedStepIds).not.toContain("a");
    });
  });

  it("each horizon has a non-empty description", () => {
    const horizons = buildHorizons([]);
    horizons.forEach((h) => {
      expect(h.description.length).toBeGreaterThan(0);
    });
  });
});
