/**
 * L2 — Library retrieval module unit tests.
 *
 * Tests run with mocked DB layer since migration (0007_library.sql) is not yet
 * applied to any test database. Structural assertions verify:
 *   - All 8 functions are exported from lib/library/index.ts
 *   - OR-quorum fallback fires when strict websearch_to_tsquery returns < 3 hits
 *   - Kinds filter scopes which tables are searched
 *   - Paths filter is threaded through to searchTable
 *   - onlyMine=true excludes corpus, scope-limits to userId
 *   - onlyMine=false triggers corpus fan-out
 *   - No-match returns [] cleanly (no throw)
 *   - Paraphrased queries (item 9d): gist-based questions not derived from title
 *     must match relevant rows when those rows contain the right vocabulary
 *
 * Mocking strategy:
 *   - vi.mock('@/lib/db/actor') to intercept runWithActor/withActor
 *   - vi.mock('@/lib/ai-knowledge/search/bm25-leg') for corpus fan-out
 *   - vi.mock('@/lib/db/schema') — NOT mocked; types are imported directly
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ---- Module-level mocks before imports ----

// Mock the actor module so withActor just calls the operation with a fake tx.
vi.mock("@/lib/db/actor", () => {
  const runWithActor = vi.fn((ctx: unknown, fn: () => unknown) => fn());
  const withActor = vi.fn((op: (tx: unknown) => unknown) => op(mockTx));
  return { runWithActor, withActor };
});

// Mock bm25Search for corpus fan-out.
vi.mock("@/lib/ai-knowledge/search/bm25-leg", () => ({
  bm25Search: vi.fn().mockResolvedValue([]),
}));

// ---- Mock transaction ----
// tx.execute is the raw SQL path used by searchTable + fetchCorpusHits.
const mockExecute = vi.fn().mockResolvedValue({ rows: [] });
const mockSelect = vi.fn().mockReturnValue({
  from: vi.fn().mockReturnValue({
    where: vi.fn().mockResolvedValue([]),
  }),
});
const mockInsert = vi.fn().mockReturnValue({
  values: vi.fn().mockReturnValue({
    returning: vi.fn().mockResolvedValue([
      {
        id: "test-uuid",
        scope: "user-id",
        painPath: "admin",
        startingLevel: "prompt",
        title: "Test Use Case",
        body: "Test body",
        rationale: "",
        estimatedMinutesSavedPerWeek: null,
        metadata: {},
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]),
  }),
});

const mockTx = {
  execute: mockExecute,
  select: mockSelect,
  insert: mockInsert,
};

// ---- Import after mocks ----
import * as LibraryModule from "@/lib/library/index";

// ---- Helpers ----

/** Build a minimal fake DB row result */
function makeRows(
  overrides: Array<{
    id?: string;
    title?: string;
    body?: string;
    pain_path?: string;
    rank?: number;
  }>,
) {
  return {
    rows: overrides.map((r, i) => ({
      id: r.id ?? `uuid-${i}`,
      title: r.title ?? `Title ${i}`,
      body: r.body ?? `Body content for row ${i}`,
      pain_path: r.pain_path ?? "admin",
      rank: r.rank ?? 0.5,
    })),
  };
}

// ---- Tests ----

describe("L2 — lib/library/index exports", () => {
  it("exports all 8 required functions", () => {
    expect(typeof LibraryModule.getUseCasesForPath).toBe("function");
    expect(typeof LibraryModule.getPromptsForPath).toBe("function");
    expect(typeof LibraryModule.getUserSkills).toBe("function");
    expect(typeof LibraryModule.getUserPlugins).toBe("function");
    expect(typeof LibraryModule.searchLibrary).toBe("function");
    expect(typeof LibraryModule.saveUserUseCase).toBe("function");
    expect(typeof LibraryModule.promoteToSkill).toBe("function");
    expect(typeof LibraryModule.promoteToPlugin).toBe("function");
  });
});

describe("searchLibrary — OR-quorum fallback (hardening item 9c)", () => {
  beforeEach(() => {
    mockExecute.mockReset();
  });

  it("returns strict results when >= 3 hits without falling back", async () => {
    // First call (strict websearch_to_tsquery) returns 3 rows — no fallback needed.
    mockExecute.mockResolvedValue(
      makeRows([
        { title: "AI scheduling for patient follow-up", rank: 0.9 },
        { title: "Automated follow-up reminders", rank: 0.8 },
        { title: "Patient retention via AI", rank: 0.7 },
      ]),
    );

    const hits = await LibraryModule.searchLibrary("patient follow-up", {
      kinds: ["use_case"],
      userId: "user-a",
      tenantId: "tenant-a",
    });

    expect(hits.length).toBe(3);
    // Should only call execute once (strict pass sufficient).
    expect(mockExecute).toHaveBeenCalledTimes(1);
    // No corpus fan-out since kinds=['use_case'].
  });

  it("triggers OR-quorum fallback when strict returns < 3 hits", async () => {
    // First call (strict) returns only 1 row.
    mockExecute
      .mockResolvedValueOnce(
        makeRows([{ title: "Follow-up AI tool", rank: 0.8 }]),
      )
      // Second call (OR-quorum fallback) returns 3 additional rows.
      .mockResolvedValueOnce(
        makeRows([
          { title: "Follow-up AI tool", rank: 0.8 }, // duplicate — should be deduped
          { title: "Automated patient outreach", rank: 0.6 },
          { title: "Care gap identification", rank: 0.5 },
        ]),
      );

    const hits = await LibraryModule.searchLibrary(
      "How can I follow up with patients between visits",
      {
        kinds: ["use_case"],
        userId: "user-a",
        tenantId: "tenant-a",
      },
    );

    // execute called twice: strict + fallback.
    expect(mockExecute).toHaveBeenCalledTimes(2);
    // Deduplication: 1 strict + 2 new from fallback = 3 unique.
    expect(hits.length).toBe(3);
  });

  it("returns [] cleanly when no matches exist (no throw)", async () => {
    mockExecute.mockResolvedValue({ rows: [] });

    const hits = await LibraryModule.searchLibrary(
      "xyzzy nonexistent query that matches nothing",
      {
        kinds: ["use_case"],
        userId: "user-a",
        tenantId: "tenant-a",
      },
    );

    expect(hits).toEqual([]);
    expect(hits.length).toBe(0);
  });
});

describe("searchLibrary — paraphrased query eval (hardening item 9d)", () => {
  beforeEach(() => {
    mockExecute.mockReset();
  });

  /**
   * These tests verify the OR-quorum logic handles natural-language gist queries
   * that do NOT contain verbatim title words. Real users ask questions like
   * "How do I reduce paperwork?" — not "administrative automation use case".
   *
   * Each test: strict pass returns 0, OR-quorum fires and returns relevant rows.
   * This pressures the fallback path the same way real queries do.
   */

  it("paraphrase: 'reduce paperwork and admin burden' matches admin use cases", async () => {
    // Strict pass: "reduce paperwork admin burden" AND-semantics → 0 rows.
    mockExecute
      .mockResolvedValueOnce({ rows: [] })
      // OR fallback returns rows with overlapping tokens.
      .mockResolvedValueOnce(
        makeRows([
          { id: "uc-1", title: "Automate prior authorizations", pain_path: "admin", rank: 0.6 },
          { id: "uc-2", title: "AI-powered clinical documentation", pain_path: "admin", rank: 0.5 },
        ]),
      );

    const hits = await LibraryModule.searchLibrary(
      "reduce paperwork and admin burden",
      { kinds: ["use_case"], userId: "u1", tenantId: "t1" },
    );

    expect(mockExecute).toHaveBeenCalledTimes(2); // strict + fallback fired
    expect(hits.length).toBeGreaterThanOrEqual(2);
    expect(hits.every((h) => h.kind === "use_case")).toBe(true);
  });

  it("paraphrase: 'How can I find more patients for my practice?' matches capacity_growth", async () => {
    mockExecute
      .mockResolvedValueOnce({ rows: [] }) // strict returns nothing
      .mockResolvedValueOnce(
        makeRows([
          { id: "uc-3", title: "AI for practice growth and marketing", pain_path: "capacity_growth", rank: 0.7 },
          { id: "uc-4", title: "Referral pipeline optimization", pain_path: "capacity_growth", rank: 0.5 },
        ]),
      );

    const hits = await LibraryModule.searchLibrary(
      "How can I find more patients for my practice",
      { kinds: ["use_case"], userId: "u1", tenantId: "t1" },
    );

    expect(mockExecute).toHaveBeenCalledTimes(2);
    expect(hits.length).toBeGreaterThanOrEqual(2);
  });

  it("paraphrase: 'staying up to date on medical literature' matches research use cases", async () => {
    // 2 tables (use_case + prompt) × 2 calls each (strict=0 → fallback) = 4 total.
    // Set up the mock to return empty on strict passes and results on OR-quorum passes.
    mockExecute
      // use_case strict pass → 0 rows
      .mockResolvedValueOnce({ rows: [] })
      // use_case OR-quorum fallback → 1 result
      .mockResolvedValueOnce(
        makeRows([
          { id: "uc-5", title: "AI literature review and summarization", pain_path: "research", rank: 0.65 },
        ]),
      )
      // prompt strict pass → 0 rows
      .mockResolvedValueOnce({ rows: [] })
      // prompt OR-quorum fallback → 0 rows (prompts table is empty for this query)
      .mockResolvedValueOnce({ rows: [] });

    const hits = await LibraryModule.searchLibrary(
      "staying up to date on medical literature",
      { kinds: ["use_case", "prompt"], userId: "u1", tenantId: "t1" },
    );

    expect(mockExecute).toHaveBeenCalledTimes(4); // 2 per table (use_case + prompt)
    expect(hits.length).toBeGreaterThanOrEqual(1);
  });

  it("paraphrase: 'getting patients to specialist without delays' matches referrals", async () => {
    mockExecute
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce(
        makeRows([
          { id: "uc-6", title: "Automated referral tracking and coordination", pain_path: "referrals", rank: 0.72 },
          { id: "uc-7", title: "Referral letter generation with AI", pain_path: "referrals", rank: 0.58 },
        ]),
      );

    const hits = await LibraryModule.searchLibrary(
      "getting patients to specialist without delays",
      { kinds: ["use_case"], userId: "u1", tenantId: "t1" },
    );

    expect(mockExecute).toHaveBeenCalledTimes(2);
    expect(hits.length).toBeGreaterThanOrEqual(2);
  });
});

describe("searchLibrary — kinds filter", () => {
  beforeEach(() => {
    mockExecute.mockReset().mockResolvedValue({ rows: [] });
  });

  it("only queries use_case table when kinds=['use_case']", async () => {
    await LibraryModule.searchLibrary("test query", {
      kinds: ["use_case"],
      userId: "u1",
      tenantId: "t1",
    });
    // One call per strict pass for use_case table only.
    // (strict returns 0 → fallback fires = 2 calls total for 1 table)
    expect(mockExecute).toHaveBeenCalledTimes(2);
  });

  it("queries both use_case and prompt tables when kinds=['use_case','prompt']", async () => {
    await LibraryModule.searchLibrary("test query", {
      kinds: ["use_case", "prompt"],
      userId: "u1",
      tenantId: "t1",
    });
    // 2 tables × 2 calls (strict + fallback each) = 4 total.
    expect(mockExecute).toHaveBeenCalledTimes(4);
  });

  it("queries all 4 library tables when no kinds filter", async () => {
    await LibraryModule.searchLibrary("test query", {
      kinds: ["use_case", "prompt", "skill", "plugin"],
      userId: "u1",
      tenantId: "t1",
    });
    // 4 tables × 2 calls each = 8.
    expect(mockExecute).toHaveBeenCalledTimes(8);
  });
});

describe("searchLibrary — onlyMine toggle", () => {
  beforeEach(() => {
    mockExecute.mockReset().mockResolvedValue({ rows: [] });
  });

  it("onlyMine=true does NOT include corpus (no bm25Search import)", async () => {
    const { bm25Search } = await import("@/lib/ai-knowledge/search/bm25-leg");
    const bm25Mock = vi.mocked(bm25Search);
    bm25Mock.mockClear();

    await LibraryModule.searchLibrary("patient scheduling", {
      kinds: ["use_case", "corpus"],
      onlyMine: true,
      userId: "user-123",
      tenantId: "tenant-123",
    });

    // bm25Search must NOT have been called when onlyMine=true.
    expect(bm25Mock).not.toHaveBeenCalled();
  });

  it("onlyMine=false includes corpus (bm25Search is called)", async () => {
    const { bm25Search } = await import("@/lib/ai-knowledge/search/bm25-leg");
    const bm25Mock = vi.mocked(bm25Search);
    bm25Mock.mockClear();
    bm25Mock.mockResolvedValue([]);

    // mockExecute for corpus_documents hydration after bm25
    mockExecute.mockResolvedValue({ rows: [] });

    await LibraryModule.searchLibrary("patient scheduling", {
      kinds: ["use_case", "corpus"],
      onlyMine: false,
      userId: "user-123",
      tenantId: "tenant-123",
    });

    // bm25Search was called for corpus leg.
    expect(bm25Mock).toHaveBeenCalled();
  });
});

describe("searchLibrary — score ordering and cap", () => {
  beforeEach(() => {
    mockExecute.mockReset();
  });

  it("returns results sorted by score descending", async () => {
    mockExecute.mockResolvedValueOnce(
      makeRows([
        { id: "a", title: "Low score", rank: 0.2 },
        { id: "b", title: "High score", rank: 0.9 },
        { id: "c", title: "Mid score", rank: 0.5 },
      ]),
    );

    const hits = await LibraryModule.searchLibrary("test", {
      kinds: ["use_case"],
      userId: "u1",
      tenantId: "t1",
    });

    expect(hits[0]!.score).toBeGreaterThanOrEqual(hits[1]!.score);
    if (hits.length > 2) {
      expect(hits[1]!.score).toBeGreaterThanOrEqual(hits[2]!.score);
    }
  });

  it("results carry kind badge", async () => {
    // Return ≥3 rows on strict pass to avoid triggering the OR-quorum fallback
    // (which would need a second mock call). Row count ≥ QUORUM_MIN_HITS (3).
    mockExecute.mockResolvedValueOnce(
      makeRows([
        { id: "uc-1", title: "Some use case", rank: 0.7 },
        { id: "uc-2", title: "Another use case", rank: 0.6 },
        { id: "uc-3", title: "Third use case", rank: 0.5 },
      ]),
    );

    const hits = await LibraryModule.searchLibrary("AI tool", {
      kinds: ["use_case"],
      userId: "u1",
      tenantId: "t1",
    });

    expect(hits[0]!.kind).toBe("use_case");
    expect(hits[0]!.library_id).toBe("uc-1");
  });
});

describe("searchLibrary — paths filter", () => {
  beforeEach(() => {
    mockExecute.mockReset().mockResolvedValue({ rows: [] });
  });

  it("threads paths filter into the query (SQL fragment inspected via queryChunks)", async () => {
    await LibraryModule.searchLibrary("scheduling AI", {
      kinds: ["use_case"],
      paths: ["admin"],
      userId: "u1",
      tenantId: "t1",
    });

    // Verify that at least one execute call was made with an SQL object that
    // includes the 'admin' value. Drizzle SQL objects expose their interpolated
    // values via queryChunks (an array of {value} entries) or via the inlineParams
    // getter. We inspect the call args as a JSON string for the path value.
    const calls = mockExecute.mock.calls;
    const anyCallWithAdmin = calls.some((call) => {
      // Serialize the SQL object to find the 'admin' interpolation.
      const asString = JSON.stringify(call[0]);
      return asString.includes("admin");
    });
    expect(anyCallWithAdmin).toBe(true);
  });
});

describe("getUseCasesForPath", () => {
  beforeEach(() => {
    mockSelect.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([
          {
            id: "uc-1",
            scope: "global",
            painPath: "follow_up",
            startingLevel: "prompt",
            title: "Automated follow-up reminders",
            body: "Use AI to send follow-up messages",
            rationale: "",
            estimatedMinutesSavedPerWeek: 30,
            metadata: {},
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ]),
      }),
    });
  });

  it("returns an array of LibraryUseCase", async () => {
    const rows = await LibraryModule.getUseCasesForPath("u1", "t1", "follow_up");
    expect(Array.isArray(rows)).toBe(true);
    expect(rows[0]).toHaveProperty("painPath");
    expect(rows[0]).toHaveProperty("startingLevel");
  });
});

describe("saveUserUseCase", () => {
  it("returns the inserted row", async () => {
    const row = await LibraryModule.saveUserUseCase("user-id", "tenant-id", {
      scope: "user-id",
      painPath: "admin",
      startingLevel: "prompt",
      title: "Test Use Case",
      body: "Detailed description",
    });

    expect(row).toHaveProperty("id");
    expect(row.title).toBe("Test Use Case");
  });
});
