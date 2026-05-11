// tests/search-library-leg.test.ts — S1: library-leg unit tests.
//
// Tests the librarySearch() function directly. Uses mocked DB to avoid
// needing a live Postgres connection for unit tests.
//
// SLL-1: Authed user search returns use_case hits with correct kind badge.
// SLL-2: Guest (synthetic UUID) only sees scope='global' rows (enforced by RLS mock).
// SLL-3: Library hits appear in fused results with correct kind badge when wired via route.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// --- Mocks ---

// Mock runWithActor + withActor to simulate RLS scoping.
// The stub checks actor.userId to simulate RLS: 'global' rows always visible,
// user-scoped rows visible only to matching actor.

const GLOBAL_ROW = {
  doc_id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
  title: "AI for Patient Follow-Up (Global)",
  body: "Use AI to send automated follow-up messages to patients after appointments.",
  pain_path: "follow_up",
  rank: 0.9,
};

const USER_SCOPED_ROW = {
  doc_id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
  title: "My Custom Referral Workflow",
  body: "A custom prompt I saved for referral coordination.",
  pain_path: "referrals",
  rank: 0.8,
};

const TEST_USER_ID = "cccccccc-cccc-cccc-cccc-cccccccccccc";
const GUEST_USER_ID = "00000000-0000-0000-0000-000000000000";

vi.mock("@/lib/db/actor", () => ({
  runWithActor: vi.fn(async (ctx: { userId: string }, fn: () => Promise<unknown>) => {
    // Store actor for withActor to read.
    (globalThis as Record<string, unknown>).__testActorUserId = ctx.userId;
    return fn();
  }),
  withActor: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => {
    const userId = (globalThis as Record<string, unknown>).__testActorUserId as string;
    const isGuest = userId === GUEST_USER_ID;

    // Simulate RLS-scoped results: guests see only global; authed see global + their rows.
    const stubTx = {
      execute: vi.fn(async () => {
        // All table searches return global row; user-scoped row only for authed.
        const rows = isGuest
          ? [GLOBAL_ROW]
          : [GLOBAL_ROW, ...(userId === TEST_USER_ID ? [USER_SCOPED_ROW] : [])];
        return { rows };
      }),
    };
    return fn(stubTx);
  }),
}));

import { librarySearch } from "@/lib/ai-knowledge/search/library-leg";

beforeEach(() => {
  (globalThis as Record<string, unknown>).__testActorUserId = undefined;
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("librarySearch (library-leg)", () => {
  it("SLL-1: authed user sees global library rows with correct kind badge", async () => {
    const hits = await librarySearch("follow-up AI", {
      actor: { userId: TEST_USER_ID, tenantId: "tttttttt-tttt-tttt-tttt-tttttttttttt" },
    });

    expect(hits.length).toBeGreaterThan(0);
    // Every hit has a kind field starting with 'library:'
    for (const hit of hits) {
      expect(hit.kind).toMatch(/^library:/);
      expect(typeof hit.doc_id).toBe("string");
      expect(typeof hit.title).toBe("string");
      expect(typeof hit.snippet).toBe("string");
      expect(typeof hit.rank).toBe("number");
    }
  });

  it("SLL-2: guest actor (synthetic UUID) does not see user-scoped rows", async () => {
    const hits = await librarySearch("referral workflow", {
      actor: { userId: GUEST_USER_ID, tenantId: GUEST_USER_ID },
    });

    // Guest should only see GLOBAL_ROW, not USER_SCOPED_ROW
    const docIds = hits.map((h) => h.doc_id);
    expect(docIds).not.toContain(USER_SCOPED_ROW.doc_id);
  });

  it("SLL-3: authed user sees user-scoped rows that guest cannot", async () => {
    const authedHits = await librarySearch("referral", {
      actor: { userId: TEST_USER_ID, tenantId: "tttttttt-tttt-tttt-tttt-tttttttttttt" },
    });
    const guestHits = await librarySearch("referral", {
      actor: { userId: GUEST_USER_ID, tenantId: GUEST_USER_ID },
    });

    const authedDocIds = authedHits.map((h) => h.doc_id);
    const guestDocIds = guestHits.map((h) => h.doc_id);

    // USER_SCOPED_ROW should appear for authed user but not guest
    expect(authedDocIds).toContain(USER_SCOPED_ROW.doc_id);
    expect(guestDocIds).not.toContain(USER_SCOPED_ROW.doc_id);
  });

  it("SLL-4: empty query returns empty array", async () => {
    const hits = await librarySearch("", {
      actor: { userId: TEST_USER_ID, tenantId: "tttttttt-tttt-tttt-tttt-tttttttttttt" },
    });
    expect(hits).toHaveLength(0);
  });

  it("SLL-5: hits are sorted by rank descending", async () => {
    const hits = await librarySearch("AI patient", {
      actor: { userId: TEST_USER_ID, tenantId: "tttttttt-tttt-tttt-tttt-tttttttttttt" },
    });
    for (let i = 1; i < hits.length; i++) {
      expect(hits[i - 1]!.rank).toBeGreaterThanOrEqual(hits[i]!.rank);
    }
  });
});
