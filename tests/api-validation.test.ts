import { describe, expect, it } from "vitest";
import { parseDecisionInputForActor } from "../app/api/decisions/validation";

const actor = {
  userId: "550e8400-e29b-41d4-a716-446655440000",
  tenantId: "550e8400-e29b-41d4-a716-446655440001",
};

function validBody(): {
  templateId: string;
  source: { type: string; capturedAt: string };
  fields: Record<string, string | number | boolean>;
  context: { userId: string; tenantId: string };
} {
  return {
    templateId: "capacity",
    source: {
      type: "user_form",
      capturedAt: "2026-05-10T12:00:00.000Z",
    },
    fields: {
      weeklyVisits: 32,
      waitlistPressure: "medium",
      acceptingIntake: true,
    },
    context: {
      userId: "550e8400-e29b-41d4-a716-446655440099",
      tenantId: "550e8400-e29b-41d4-a716-446655440098",
    },
  };
}

describe("decision API validation", () => {
  it("derives actor context from the session, not the request body", () => {
    const parsed = parseDecisionInputForActor(validBody(), actor);

    expect(parsed.context.userId).toBe(actor.userId);
    expect(parsed.context.tenantId).toBe(actor.tenantId);
  });

  it("rejects PHI-shaped field names", () => {
    const body = validBody();
    body.fields = { ...body.fields, patientName: "Jane Doe" };

    expect(() => parseDecisionInputForActor(body, actor)).toThrow(
      /Invalid decision input/,
    );
  });

  it("rejects PHI-shaped string values", () => {
    const body = validBody();
    body.fields = { ...body.fields, note: "Call me at 555-123-4567" };

    expect(() => parseDecisionInputForActor(body, actor)).toThrow(
      /Invalid decision input/,
    );
  });
});
