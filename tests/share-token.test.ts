// T-05: HMAC-signed share URLs round-trip and reject tampered tokens.

import { describe, it, expect, beforeAll } from "vitest";

beforeAll(() => {
  // Ensure SHARE_URL_SECRET is set for the test
  if (!process.env.SHARE_URL_SECRET && !process.env.BETTER_AUTH_SECRET) {
    process.env.BETTER_AUTH_SECRET = "test-secret-with-enough-entropy-for-zod-validation-XXXX";
  }
});

describe("share token signing (T-05)", () => {
  it("round-trips a decisionId", async () => {
    const { signShareToken, verifyShareToken } = await import("@/lib/share");
    const id = "33333333-3333-3333-3333-333333333333";
    const token = signShareToken(id, 1_700_000_000_000);
    const payload = verifyShareToken(token);
    expect(payload?.decisionId).toBe(id);
    expect(payload?.issuedAt).toBe(1_700_000_000_000);
  });

  it("rejects a tampered payload", async () => {
    const { signShareToken, verifyShareToken } = await import("@/lib/share");
    const id = "44444444-4444-4444-4444-444444444444";
    const token = signShareToken(id);
    // Replace the payload with a different decision id but keep the original sig.
    const [, sig] = token.split(".");
    const evilPayload = Buffer.from(JSON.stringify({ decisionId: "evil", issuedAt: 0 })).toString(
      "base64",
    ).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    expect(verifyShareToken(`${evilPayload}.${sig}`)).toBeNull();
  });

  it("rejects a totally fake token", async () => {
    const { verifyShareToken } = await import("@/lib/share");
    expect(verifyShareToken("not-a-valid-token")).toBeNull();
    expect(verifyShareToken("a.b")).toBeNull();
  });
});
