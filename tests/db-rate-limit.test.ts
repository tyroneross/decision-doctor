import { describe, expect, it } from "vitest";
import {
  createInMemoryDecisionLimiter,
  DECISION_DAILY_LIMIT,
} from "../lib/db/rate-limit";

describe("decision rate limiter", () => {
  it("allows the first 20 decisions in a UTC day and rejects the 21st", () => {
    const limiter = createInMemoryDecisionLimiter();
    const now = new Date("2026-05-10T12:00:00.000Z");

    for (let index = 0; index < DECISION_DAILY_LIMIT; index += 1) {
      expect(limiter.check("user-1", now).allowed).toBe(true);
    }

    const blocked = limiter.check("user-1", now);
    expect(blocked.allowed).toBe(false);
    expect(blocked.remaining).toBe(0);
  });

  it("resets on the next UTC day", () => {
    const limiter = createInMemoryDecisionLimiter(1);

    expect(
      limiter.check("user-1", new Date("2026-05-10T23:59:00.000Z")).allowed,
    ).toBe(true);
    expect(
      limiter.check("user-1", new Date("2026-05-11T00:01:00.000Z")).allowed,
    ).toBe(true);
  });
});
