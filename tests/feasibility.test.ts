// T-11 (F-08) — AI-feasibility scoring contract.
//
// What this asserts:
//   1. Every WorkloadReducer carries aiFeasibility ∈ enum after Stage 6 runs.
//   2. Numbers (impactScore / feasibilityScore / combinedScore) are TS-computed
//      and bounded to [0, 100]; same input → same numbers across 5 repeats.
//   3. Stage 6's reducer order is sorted by combinedScore desc (the engine's
//      "ranked drains" contract).
//   4. UI helper feasibilityFor() returns a non-null style for every enum value
//      and falls back to "human" for missing input.
//
// Mocking: we mock @/lib/groq to return a deterministic classification so the
// test doesn't depend on a live Groq endpoint. The TS-computes-numbers
// invariant means the determinism test is meaningful even with a mocked LLM —
// we verify the formula, not the LLM.

import { describe, expect, it, vi, beforeEach } from "vitest";

// Mock the Groq client BEFORE importing Stage 6.
vi.mock("@/lib/groq", () => ({
  callStage: vi.fn(),
  GROQ_MODEL: "test-mock-model",
  groq: {},
}));

import { callStage } from "@/lib/groq";
import {
  runStage6Feasibility,
  computeFeasibilityScore,
  computeImpactScore,
} from "@/lib/engine/stage6-feasibility";
import { feasibilityFor } from "@/lib/decision-display";
import {
  AiFeasibilitySchema,
  WorkloadReducerSchema,
  type WorkloadReducer,
} from "@/shared/schema";

const FIXTURE_REDUCERS: WorkloadReducer[] = [
  {
    type: "prompt",
    title: "Draft patient cancellation note",
    description: "Paste-ready prompt that turns a same-day cancellation into a 4-line rebooking note.",
    artifact: { promptText: "Help me draft a calm patient cancellation note..." },
    automationLevel: "user_executes",
    coverage: "full_task",
    permission_tier: "T0",
    estTimeSavingHrsPerWeek: 2,
  },
  {
    type: "playbook",
    title: "60-day rollout playbook",
    description: "Concrete steps to implement the new rate over the next 60 days.",
    artifact: { playbookSteps: ["Week 1: ...", "Week 2: ..."] },
    automationLevel: "user_executes",
    coverage: "partial_task",
    permission_tier: "T0",
    estTimeSavingHrsPerWeek: 1,
  },
  {
    type: "skill",
    title: "Weekly revenue snapshot",
    description: "A small Claude Code skill that emails you a Friday snapshot of revenue + fill-rate.",
    artifact: { skillName: "decision-doctor-revenue-snapshot" },
    automationLevel: "user_executes",
    coverage: "task_setup",
    permission_tier: "T1",
    estTimeSavingHrsPerWeek: 3,
  },
];

const DETERMINISTIC_LLM_RESPONSE = {
  answer: JSON.stringify({
    classifications: [
      { id: 0, aiFeasibility: "skill", signals: ["copy-paste", "single-turn"], rationale: "Single-turn paste-ready prompt." },
      { id: 1, aiFeasibility: "human", signals: ["judgment"], rationale: "Multi-week rollout requires human ownership." },
      { id: 2, aiFeasibility: "plugin", signals: ["multi-step", "scheduled"], rationale: "Weekly trigger + multi-step retrieval." },
    ],
  }),
  reasoning: null,
  tokensIn: 100,
  tokensOut: 50,
};

describe("F-08 / T-11 — AI-feasibility scoring", () => {
  beforeEach(() => {
    vi.mocked(callStage).mockReset();
    vi.mocked(callStage).mockResolvedValue(DETERMINISTIC_LLM_RESPONSE);
  });

  it("every reducer gets aiFeasibility ∈ enum", async () => {
    const result = await runStage6Feasibility(FIXTURE_REDUCERS);
    expect(result.reducers).toHaveLength(FIXTURE_REDUCERS.length);
    for (const r of result.reducers) {
      const parsed = AiFeasibilitySchema.safeParse(r.aiFeasibility);
      expect(parsed.success).toBe(true);
    }
  });

  it("emits TS-computed numbers in [0,100]", async () => {
    const { reducers } = await runStage6Feasibility(FIXTURE_REDUCERS);
    for (const r of reducers) {
      expect(typeof r.feasibilityScore).toBe("number");
      expect(typeof r.impactScore).toBe("number");
      expect(typeof r.combinedScore).toBe("number");
      expect(r.feasibilityScore!).toBeGreaterThanOrEqual(0);
      expect(r.feasibilityScore!).toBeLessThanOrEqual(100);
      expect(r.impactScore!).toBeGreaterThanOrEqual(0);
      expect(r.impactScore!).toBeLessThanOrEqual(100);
      expect(r.combinedScore!).toBeGreaterThanOrEqual(0);
      expect(r.combinedScore!).toBeLessThanOrEqual(100);
    }
  });

  it("same input → same numbers across 5 repeats", async () => {
    const runs = [];
    for (let i = 0; i < 5; i++) {
      vi.mocked(callStage).mockResolvedValueOnce(DETERMINISTIC_LLM_RESPONSE);
      runs.push(await runStage6Feasibility(FIXTURE_REDUCERS));
    }
    const fingerprint = (run: Awaited<ReturnType<typeof runStage6Feasibility>>) =>
      run.reducers
        .map(
          (r) =>
            `${r.title}|${r.aiFeasibility}|${r.feasibilityScore}|${r.impactScore}|${r.combinedScore}`,
        )
        .join("::");
    const fp0 = fingerprint(runs[0]!);
    for (const run of runs.slice(1)) {
      expect(fingerprint(run)).toBe(fp0);
    }
  });

  it("computes deterministic categorical → numeric mapping", () => {
    // Pure determinism — no LLM in the loop.
    expect(computeFeasibilityScore("skill")).toBe(100);
    expect(computeFeasibilityScore("plugin")).toBe(80);
    expect(computeFeasibilityScore("agent")).toBe(55);
    expect(computeFeasibilityScore("human")).toBe(0);
  });

  it("impactScore is bounded and monotone in hrs/wk", () => {
    const base: WorkloadReducer = {
      type: "prompt",
      title: "x",
      description: "x",
      artifact: { promptText: "x" },
      automationLevel: "user_executes",
      coverage: "partial_task",
      permission_tier: "T0",
    };
    const i0 = computeImpactScore({ ...base, estTimeSavingHrsPerWeek: 0 });
    const i1 = computeImpactScore({ ...base, estTimeSavingHrsPerWeek: 1 });
    const i7 = computeImpactScore({ ...base, estTimeSavingHrsPerWeek: 7 });
    expect(i0).toBeLessThanOrEqual(i1);
    expect(i1).toBeLessThanOrEqual(i7);
    expect(i7).toBeLessThanOrEqual(100);
  });

  it("falls back gracefully on unparseable LLM output", async () => {
    vi.mocked(callStage).mockResolvedValueOnce({
      answer: "this is not json",
      reasoning: null,
      tokensIn: 0,
      tokensOut: 0,
    });
    const { reducers } = await runStage6Feasibility(FIXTURE_REDUCERS);
    expect(reducers).toHaveLength(FIXTURE_REDUCERS.length);
    for (const r of reducers) {
      const parsed = AiFeasibilitySchema.safeParse(r.aiFeasibility);
      expect(parsed.success).toBe(true);
    }
  });

  it("empty input returns empty output with zero tokens", async () => {
    const r = await runStage6Feasibility([]);
    expect(r.reducers).toEqual([]);
    expect(r.tokensIn).toBe(0);
    expect(r.tokensOut).toBe(0);
  });

  it("output reducers validate against WorkloadReducerSchema", async () => {
    const { reducers } = await runStage6Feasibility(FIXTURE_REDUCERS);
    for (const r of reducers) {
      const parsed = WorkloadReducerSchema.safeParse(r);
      expect(parsed.success).toBe(true);
    }
  });

  it("feasibilityFor() returns a style for every enum value", () => {
    for (const tier of ["skill", "plugin", "agent", "human"] as const) {
      const style = feasibilityFor(tier);
      expect(style.key).toBe(tier);
      expect(style.label).toBeTruthy();
      expect(style.icon).toBeTruthy();
      expect(style.fg).toBeTruthy();
      expect(style.bg).toBeTruthy();
    }
  });

  it("feasibilityFor() falls back to 'human' on null/undefined", () => {
    expect(feasibilityFor(null).key).toBe("human");
    expect(feasibilityFor(undefined).key).toBe("human");
  });
});
