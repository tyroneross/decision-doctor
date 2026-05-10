// T-09: PHI rejection. DecisionInputSchema rejects free-form strings >200 chars.

import { describe, it, expect } from "vitest";
import { DecisionInputSchema } from "@/shared/schema";

const validBase = {
  templateId: "capacity" as const,
  source: { type: "user_form" as const, capturedAt: new Date().toISOString() },
  context: {
    userId: "11111111-1111-1111-1111-111111111111",
    tenantId: "22222222-2222-2222-2222-222222222222",
  },
};

describe("PHI rejection (T-09)", () => {
  it("accepts a normal short field", () => {
    const r = DecisionInputSchema.safeParse({
      ...validBase,
      fields: { burnoutLevel: "moderate", currentWeeklyHours: 40 },
    });
    expect(r.success).toBe(true);
  });

  it("rejects a 200+ char free-form string in any field (PHI floor)", () => {
    const longString = "x".repeat(201);
    const r = DecisionInputSchema.safeParse({
      ...validBase,
      fields: { burnoutLevel: "moderate", note: longString },
    });
    expect(r.success).toBe(false);
  });

  it("rejects a 500-char string-array element", () => {
    const r = DecisionInputSchema.safeParse({
      ...validBase,
      fields: { tags: ["short", "y".repeat(500)] },
    });
    expect(r.success).toBe(false);
  });

  it("accepts a string of exactly 200 chars (boundary)", () => {
    const exact = "x".repeat(200);
    const r = DecisionInputSchema.safeParse({
      ...validBase,
      fields: { note: exact },
    });
    expect(r.success).toBe(true);
  });
});
