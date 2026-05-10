import { describe, expect, it } from "vitest";
import { DecisionInputSchema, detectPhiLikeText } from "../shared/schema";

const baseInput = {
  templateId: "capacity",
  source: {
    type: "user_form",
    capturedAt: new Date("2026-05-10T12:00:00.000Z"),
  },
  context: {
    userId: "11111111-1111-4111-8111-111111111111",
    tenantId: "22222222-2222-4222-8222-222222222222",
  },
};

describe("PHI-shaped intake rejection", () => {
  it.each([
    ["email", "patient@example.com"],
    ["phone", "555-123-4567"],
    ["date of birth", "DOB 01/02/1980"],
    ["medical record number", "MRN: AB12345"],
    ["street address", "123 Main St"],
    ["person name", "Jane Patient"],
  ])("detects %s values", (_label, value) => {
    expect(detectPhiLikeText(value)).toEqual(expect.any(String));
  });

  it("rejects PHI-shaped field values at the shared Zod layer", () => {
    const parsed = DecisionInputSchema.safeParse({
      ...baseInput,
      fields: {
        weeklyVisitCount: 30,
        waitlistWeeks: 4,
        note: "Call 555-123-4567 before scheduling",
      },
    });

    expect(parsed.success).toBe(false);
  });

  it("rejects field names that can carry patient identifiers", () => {
    const parsed = DecisionInputSchema.safeParse({
      ...baseInput,
      fields: {
        weeklyVisitCount: 30,
        patientName: "not_provided",
      },
    });

    expect(parsed.success).toBe(false);
  });

  it("accepts short categorical and numeric business intake", () => {
    const parsed = DecisionInputSchema.safeParse({
      ...baseInput,
      fields: {
        weeklyVisitCount: 34,
        waitlistWeeks: 8,
        adminHoursPerWeek: 12,
        burnoutRisk: "high",
        growthGoal: "maintain",
        scheduleFlexibility: "medium",
      },
    });

    expect(parsed.success).toBe(true);
  });
});
