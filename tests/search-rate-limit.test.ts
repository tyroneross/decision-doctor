// tests/search-rate-limit.test.ts — S1: rate-limit on /api/search.
//
// Tests:
//   SRL-1: N+1 request returns 429 with retry_after field.
//   SRL-2: Authed user shares bucket with a higher base cap (20) than the
//          guest key — verified by checking remaining after first request.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ─── Mocks ──────────────────────────────────────────────────────────────────

vi.mock("@/lib/auth-session", () => ({
  getSessionActor: vi.fn(),
}));

vi.mock("@/lib/auth-guest", () => ({
  isGuestRequest: vi.fn(),
}));

vi.mock("@/lib/ai-knowledge/embed/openai", () => ({
  embedQuery: vi.fn(async () => new Array(768).fill(0.1) as number[]),
}));

vi.mock("@/lib/ai-knowledge/search/bm25-leg", () => ({
  bm25Search: vi.fn(async () => []),
}));

vi.mock("@/lib/ai-knowledge/search/vector-leg", () => ({
  vectorSearch: vi.fn(async () => []),
}));

vi.mock("@/lib/ai-knowledge/search/kg-leg", () => ({
  kgSearch: vi.fn(async () => []),
}));

vi.mock("@/lib/ai-knowledge/search/library-leg", () => ({
  librarySearch: vi.fn(async () => []),
}));

vi.mock("@/lib/ai-knowledge/rerank/bge-client", () => ({
  rerank: vi.fn(async () => ({
    doc_ids: [],
    degraded: false,
    degraded_reason: null,
    rerank_ms: 0,
    source: "passthrough",
  })),
}));

vi.mock("@/lib/ai-knowledge/rerank/gpt4o-fallback", () => ({
  gpt4oRerank: vi.fn(async () => ({
    doc_ids: [],
    degraded: false,
    degraded_reason: null,
    rerank_ms: 0,
    source: "passthrough",
  })),
}));

vi.mock("@/lib/db/actor", () => ({
  runWithActor: vi.fn(async (_ctx: unknown, fn: () => Promise<unknown>) => fn()),
  withActor: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => {
    const stubTx = {
      execute: vi.fn(async () => ({ rows: [] })),
      insert: vi.fn(() => ({
        values: vi.fn(() => Promise.resolve()),
      })),
    };
    return fn(stubTx);
  }),
  db: {
    execute: vi.fn(async () => ({ rows: [] })),
  },
}));

import { GET } from "@/app/api/search/route";
import { getSessionActor } from "@/lib/auth-session";
import { isGuestRequest } from "@/lib/auth-guest";
import { __resetInMemoryForTests } from "@/lib/ratelimit";

const AUTHED_ACTOR = {
  userId: "00000000-0000-0000-0000-000000000aaa",
  tenantId: "00000000-0000-0000-0000-000000000bbb",
  email: "test@example.invalid",
};

function searchReq(q = "AI triage tools"): Request {
  return new Request(`http://localhost/api/search?q=${encodeURIComponent(q)}`, {
    method: "GET",
  });
}

beforeEach(() => {
  vi.mocked(getSessionActor).mockResolvedValue(AUTHED_ACTOR);
  vi.mocked(isGuestRequest).mockResolvedValue(false);
  __resetInMemoryForTests();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/search — rate limit (S1)", () => {
  it("SRL-1: 21st request in 24h returns 429 with retry_after field", async () => {
    // 20 successful requests
    for (let i = 0; i < 20; i++) {
      const r = await GET(searchReq(`query ${i}`));
      expect(r.status).toBe(200);
    }

    // 21st should be rate-limited
    const r21 = await GET(searchReq("one too many"));
    expect(r21.status).toBe(429);
    const body = await r21.json();
    expect(body.error).toBe("rate_limited");
    expect(typeof body.retry_after).toBe("number");
    expect(body.retry_after).toBeGreaterThan(0);
    expect(body.resetAt).toBeTruthy();
  });

  it("SRL-2: authed user has cap of 20; first request succeeds and shows remaining", async () => {
    const r1 = await GET(searchReq("AI tool for admin"));
    expect(r1.status).toBe(200);
    // The rate-limit result is consumed inside the route; we can't directly
    // inspect `remaining` from outside. Verify that the 2nd–20th also succeed
    // and only the 21st fails — proving cap = 20.
    for (let i = 0; i < 19; i++) {
      const r = await GET(searchReq(`q${i}`));
      expect(r.status).toBe(200);
    }
    const rOver = await GET(searchReq("over limit"));
    expect(rOver.status).toBe(429);
  });
});
