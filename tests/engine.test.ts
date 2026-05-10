import { describe, expect, it } from "vitest";
import { runDecision } from "../lib/engine/orchestrator";
import { decisionTemplates } from "../lib/engine/templates";
import { DecisionOutputSchema, type DecisionInput } from "../shared/schema";

const context = {
  userId: "11111111-1111-4111-8111-111111111111",
  tenantId: "22222222-2222-4222-8222-222222222222",
};

function inputFor(fields: DecisionInput["fields"], templateId: DecisionInput["templateId"]): DecisionInput {
  return {
    templateId,
    source: {
      type: "user_form",
      capturedAt: new Date("2026-05-10T12:00:00.000Z"),
    },
    fields,
    context,
  };
}

const validInputs: DecisionInput[] = [
  inputFor(
    {
      weeklyVisitCount: 34,
      waitlistWeeks: 8,
      adminHoursPerWeek: 12,
      burnoutRisk: "high",
      growthGoal: "maintain",
      scheduleFlexibility: "medium",
    },
    "capacity",
  ),
  inputFor(
    {
      currentFee: 220,
      targetMonthlyIncomeGap: 4500,
      panelMix: "mixed",
      demandLevel: "high",
      priceSensitivity: "moderate",
      adminTolerance: "low",
    },
    "pricing",
  ),
  inputFor(
    {
      adminHoursPerWeek: 14,
      missedCallsPerWeek: 9,
      monthlyBudget: 1200,
      hiringUrgency: "high",
      processClarity: "medium",
      privacyComfort: "medium",
    },
    "admin-hire",
  ),
];

describe("decision template registry", () => {
  it("exports all v1 templates with bounded field counts", () => {
    expect(Object.keys(decisionTemplates).sort()).toEqual([
      "admin-hire",
      "capacity",
      "pricing",
    ]);

    Object.values(decisionTemplates).forEach((template) => {
      expect(template.fieldCount).toBeLessThanOrEqual(7);
      expect(template.candidateSet.length).toBeGreaterThanOrEqual(4);
      expect(template.criteria.length).toBeGreaterThanOrEqual(3);
    });
  });
});

describe("runDecision", () => {
  it.each(validInputs)("returns a parseable DecisionOutput for %s", async (input) => {
    const output = await runDecision(input);
    const parsed = DecisionOutputSchema.parse(output);

    expect(parsed.recommendation.option).toEqual(expect.any(String));
    expect(parsed.recommendation.confidence).toBeGreaterThanOrEqual(0);
    expect(parsed.recommendation.confidence).toBeLessThanOrEqual(100);
    expect(parsed.alternatives.length).toBeGreaterThanOrEqual(2);
    expect(parsed.alternatives.every((item) => item.reason.length > 0)).toBe(true);
    expect(parsed.robustAlternative.option).toEqual(expect.any(String));
    expect(parsed.workloadReducers.length).toBeGreaterThanOrEqual(3);
    expect(parsed.destinations[0]?.type).toBe("user_ui");
  });

  it("emits a complete five-stage method trace", async () => {
    const output = await runDecision(validInputs[0]!);

    expect(output.methodTrace.map((entry) => entry.stage)).toEqual([1, 2, 3, 4, 5]);
    expect(output.methodTrace.map((entry) => entry.name)).toEqual([
      "values",
      "constraints",
      "weights",
      "outranking",
      "ranking",
    ]);
  });

  it("keeps local deterministic engine latency well under the p95 target", async () => {
    const durations: number[] = [];

    for (let index = 0; index < 20; index += 1) {
      const start = performance.now();
      await runDecision(validInputs[index % validInputs.length]!);
      durations.push(performance.now() - start);
    }

    const p95 = durations.sort((a, b) => a - b)[Math.floor(durations.length * 0.95)] ?? 0;
    expect(p95).toBeLessThan(6000);
  });
});
