// T-10: per-user rate limit. 21st Groq call in 24h returns 429-equivalent.

import { describe, it, expect, beforeEach } from "vitest";

describe("rate limit (T-10)", () => {
  beforeEach(async () => {
    const { reset } = await import("@/lib/rate-limit");
    reset();
  });

  it("allows up to GROQ_RATE_LIMIT_PER_DAY (default 20) calls", async () => {
    const { checkAndConsume } = await import("@/lib/rate-limit");
    const userId = "user-a";
    let allowedCount = 0;
    for (let i = 0; i < 25; i++) {
      const r = checkAndConsume(userId);
      if (r.allowed) allowedCount++;
    }
    expect(allowedCount).toBe(20);
  });

  it("21st call returns allowed=false", async () => {
    const { checkAndConsume } = await import("@/lib/rate-limit");
    const userId = "user-b";
    for (let i = 0; i < 20; i++) {
      const r = checkAndConsume(userId);
      expect(r.allowed).toBe(true);
    }
    const r21 = checkAndConsume(userId);
    expect(r21.allowed).toBe(false);
    expect(r21.remaining).toBe(0);
  });

  it("buckets are per-user (one user's spam doesn't block another)", async () => {
    const { checkAndConsume } = await import("@/lib/rate-limit");
    for (let i = 0; i < 20; i++) checkAndConsume("user-c");
    expect(checkAndConsume("user-c").allowed).toBe(false);
    expect(checkAndConsume("user-d").allowed).toBe(true);
  });

  it("oldest call drops out of window after 24h+1ms", async () => {
    const { checkAndConsume } = await import("@/lib/rate-limit");
    const userId = "user-e";
    const t0 = 1_700_000_000_000;
    for (let i = 0; i < 20; i++) checkAndConsume(userId, t0);
    expect(checkAndConsume(userId, t0).allowed).toBe(false);
    const later = t0 + 24 * 60 * 60 * 1000 + 1;
    expect(checkAndConsume(userId, later).allowed).toBe(true);
  });
});
