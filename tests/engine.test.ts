/**
 * T-03 — Engine pipeline integration test (PRD §5).
 *
 * Verifies the full Stages 1-5 chain returns a valid DecisionOutput with:
 *   - 1 recommendation
 *   - ≥2 alternatives
 *   - ≥1 elimination reason per alternative
 *   - confidence in [0, 100]
 *   - 1 robust alternative
 *   - methodTrace covering Stages 1-5
 *   - ≥3 workloadReducers
 *
 * Hits the live Groq API. Latency target: p95 <6s (PRD T-03), but we run a
 * single decision per test so this is a smoke check rather than a percentile.
 *
 * Tests run sequentially to avoid Groq concurrent-rate-limit hiccups.
 */

import { describe, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { runDecision } from "@/lib/engine/orchestrator";
import { DecisionOutputSchema } from "@/shared/schema";

const TEMPLATE_INTAKE_FIXTURES = {
  capacity: {
    weeklyClinicalHours: 32,
    currentWeeklyPatients: 28,
    waitlistLength: 14,
    avgRevenuePerVisitUSD: 220,
    energyLevel: "depleted",
    practiceStage: "established",
    horizonMonths: 6,
  },
  pricing: {
    currentRateUSD: 180,
    monthsSinceLastIncrease: 18,
    insuranceShare: 60,
    cashShare: 40,
    avgFillRate: 92,
    competitorBenchmarkUSD: 220,
    riskTolerance: "medium",
  },
  "admin-hire": {
    weeklyAdminHours: 12,
    monthlyBudgetUSD: 1500,
    monthsSavingsRunway: 6,
    growthExpectation: "growing",
    adminTaskMix: "scheduling-billing",
    delegationComfort: "medium",
    horizonMonths: 12,
  },
} as const;

function buildInput(templateId: keyof typeof TEMPLATE_INTAKE_FIXTURES) {
  return {
    templateId,
    source: { type: "user_form" as const, capturedAt: new Date() },
    fields: TEMPLATE_INTAKE_FIXTURES[templateId],
    context: {
      userId: randomUUID(),
      tenantId: randomUUID(),
    },
  };
}

describe("T-03 — Engine returns valid DecisionOutput", () => {
  for (const tid of Object.keys(TEMPLATE_INTAKE_FIXTURES) as Array<
    keyof typeof TEMPLATE_INTAKE_FIXTURES
  >) {
    it(
      `${tid}: full pipeline returns valid output`,
      async () => {
        const start = Date.now();
        const { output, llmCalls } = await runDecision(buildInput(tid) as any);
        const elapsed = Date.now() - start;

        // Synthetic uuid + decidedAt for the schema check (route handler adds
        // these in production).
        const fullOutput = {
          decisionId: randomUUID(),
          decidedAt: new Date(),
          ...output,
        };
        const parsed = DecisionOutputSchema.safeParse(fullOutput);
        if (!parsed.success) {
          console.error(
            "[T-03] schema validation errors:",
            JSON.stringify(parsed.error.flatten(), null, 2),
          );
        }
        expect(parsed.success).toBe(true);

        // T-03 spelled-out F-criteria
        expect(output.recommendation.option).toBeTruthy();
        expect(output.recommendation.confidence).toBeGreaterThanOrEqual(0);
        expect(output.recommendation.confidence).toBeLessThanOrEqual(100);
        expect(output.alternatives.length).toBeGreaterThanOrEqual(2);
        for (const alt of output.alternatives) {
          expect(alt.reason.length).toBeGreaterThan(0);
        }
        expect(output.robustAlternative.option).toBeTruthy();
        expect(output.workloadReducers.length).toBeGreaterThanOrEqual(3);
        // methodTrace covers Stages 1..5 (core) + Stage 6 (F-08 feasibility)
        // + Stage 7 (F-09 scaffold). Stages 0 (F-11 classifier) and 1B (F-10
        // AHP) only land when their respective routing fires; SED + LLM-
        // weights path never includes them.
        const stages = output.methodTrace
          .map((m) => m.stage)
          .filter((s) => typeof s === "number")
          .sort((a, b) => (a as number) - (b as number));
        expect(stages).toEqual([1, 2, 3, 4, 5, 6, 7]);
        // Token telemetry populated. F-08 adds Stage 6 → 3 LLM calls.
        expect(llmCalls.length).toBe(3); // Stage 1 + Stage 5 + Stage 6
        for (const c of llmCalls) {
          expect(c.tokensIn).toBeGreaterThan(0);
          expect(c.tokensOut).toBeGreaterThan(0);
        }

        console.log(
          `[T-03 ${tid}] elapsed=${elapsed}ms | recommendation="${output.recommendation.option}" | confidence=${output.recommendation.confidence}`,
        );
      },
      30_000,
    );
  }
});
