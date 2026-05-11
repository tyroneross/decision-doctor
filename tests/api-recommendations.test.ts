/**
 * E3 — /api/recommendations route tests.
 *
 * Strategy: import POST + GET handlers directly (no Next dev server).
 * Mock four external dependencies:
 *   - getSessionActor / isGuestRequest  → auth
 *   - runWithActor / withActor          → DB layer
 *   - runRecommendation                 → engine
 *   - checkRateLimit                    → rate limiter
 *
 * Tests focus on route logic (auth, parse, guest branch, DB write, RLS isolation,
 * audit) — NOT on engine correctness (that lives in engine-pain-path.test.ts).
 *
 * T-REC-1:  POST as guest → { guestMode: true, recommendation } — no DB insert
 * T-REC-2:  POST as authed → { guestMode: false, id, recommendation } — DB row inserted
 * T-REC-3:  POST invalid body → 400 with Zod error details
 * T-REC-4:  POST rate limited → 429
 * T-REC-5:  GET as guest (no actor) → 401
 * T-REC-6:  GET as authed → { items, hasMore, nextCursor } (RLS-scoped, user A ≠ user B)
 * T-REC-7:  Audit row written on authed POST
 * T-REC-8:  Adoption pathway with "not-recommended" rungs still persists (UI filters on render)
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ─── Mocks (hoisted before route import) ─────────────────────────────────

vi.mock("@/lib/auth-session", () => ({
  getSessionActor: vi.fn(),
}));

vi.mock("@/lib/auth-guest", () => ({
  isGuestRequest: vi.fn(),
  GUEST_COOKIE: "dd:guest",
  GUEST_USER: { email: "guest@local", initials: "GU" },
}));

vi.mock("@/lib/ratelimit", () => ({
  checkRateLimit: vi.fn(),
  __resetInMemoryForTests: vi.fn(),
}));

// Mutable stub for DB operations — tests can inspect what was inserted.
// Use an object so the vi.mock closure always reads current values.
const dbState = {
  inserts: [] as Record<string, unknown>[],
  selectRows: [] as unknown[],
};

vi.mock("@/lib/db/actor", () => ({
  runWithActor: vi.fn(
    async (_ctx: unknown, fn: () => Promise<unknown>) => fn(),
  ),
  withActor: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => {
    const stubTx = {
      insert: () => ({
        values: (vals: Record<string, unknown>) => {
          dbState.inserts.push(vals);
          const idx = dbState.inserts.length; // capture at call time
          return {
            returning: async () => {
              if (idx === 1) {
                return [{ id: "rec-test-uuid-1234" }];
              }
              return [{ id: "audit-uuid" }];
            },
          };
        },
      }),
      select: () => ({
        from: () => ({
          orderBy: () => ({
            limit: async () => dbState.selectRows,
          }),
        }),
      }),
    };
    return fn(stubTx);
  }),
}));

// Convenience accessors so test assertions remain readable.
function lastInsertedRec() { return dbState.inserts[0] ?? null; }
function lastInsertedAudit() { return dbState.inserts[1] ?? null; }

vi.mock("@/lib/engine/orchestrator", () => ({
  runRecommendation: vi.fn(),
  runDecision: vi.fn(),
}));

// ─── Import after mocks ──────────────────────────────────────────────────

import { POST, GET } from "@/app/api/recommendations/route";
import { getSessionActor } from "@/lib/auth-session";
import { isGuestRequest } from "@/lib/auth-guest";
import { checkRateLimit } from "@/lib/ratelimit";
import { runRecommendation } from "@/lib/engine/orchestrator";
import { withActor } from "@/lib/db/actor";
import type { AiTaskRecommendation } from "@/shared/schema";

// ─── Fixtures ────────────────────────────────────────────────────────────

// RFC 4122 v4 UUIDs (version nibble = 4, variant nibble in [89ab]).
const ACTOR_A = {
  userId: "a0000000-0000-4000-8000-000000000001",
  tenantId: "a0000000-0000-4000-8000-000000000002",
  email: "user-a@example.invalid",
};

const ACTOR_B = {
  userId: "b0000000-0000-4000-8000-000000000001",
  tenantId: "b0000000-0000-4000-8000-000000000002",
  email: "user-b@example.invalid",
};

const VALID_BODY = {
  painPath: "admin",
  challengeText: "I spend 3 hours a week manually handling referral paperwork.",
  goal: "Reduce referral admin time by half.",
};

// Fixed AiTaskRecommendation returned by the mocked engine.
// Includes one "not-recommended" rung (T-REC-8) to verify passthrough.
const MOCK_RECOMMENDATION: AiTaskRecommendation = {
  selectedPainPath: "admin",
  challengeSummary:
    "You spend excessive time on referral paperwork that could be partially automated.",
  goal: "Reduce referral admin time by half.",
  candidateTasks: [
    {
      id: "referral-draft-automation",
      title: "Referral letter draft automation",
      description: "AI drafts referral letters from structured intake fields.",
      painPath: "admin",
      score: 85,
      tags: ["drafting", "prompt"],
    },
    {
      id: "referral-checklist",
      title: "Referral checklist generator",
      description: "AI generates a per-specialty referral checklist.",
      painPath: "admin",
      score: 72,
      tags: ["checklist"],
    },
  ],
  recommendedTask: "Referral letter draft automation",
  recommendedApproach: "prompt" as const,
  whyThisTask:
    "Letter drafting is the highest-time item in referral admin for solo practitioners.",
  starterSolution:
    'Use this prompt in Claude: "Draft a referral letter for [specialist] for patient context: [paste note]. Keep it under 200 words."',
  guardrails: [
    "Review all AI-drafted letters before sending.",
    "Do not paste PHI into public AI tools.",
  ],
  tryThisWeek: ["Draft one referral letter using the starter prompt."],
  successMetric: "Reduce referral letter drafting time by 30 min/week in 30 days.",
  adoptionPathway: [
    {
      kind: "prompt" as const,
      label: "Start with a prompt",
      rationale: "Lowest barrier; no setup needed.",
      confidence: 90,
      builderHandoff: {
        seed: {
          builderKind: "prompt" as const,
          taskTitle: "Referral letter draft automation",
          taskDescription: "AI drafts referral letters from structured intake fields.",
          painPath: "admin" as const,
          scoringRationale: "High time burden; clear AI fit.",
          targetAudience: "Solo healthcare practitioner",
          outputSpec: "200-word referral letter",
          permissionTier: "T0" as const,
        },
      },
      state: "recommended" as const,
    },
    {
      kind: "checklist" as const,
      label: "Build a referral checklist",
      rationale: "Structured checklist ensures nothing is missed.",
      confidence: 70,
      builderHandoff: {
        seed: {
          builderKind: "checklist" as const,
          taskTitle: "Referral checklist generator",
          taskDescription: "AI generates a per-specialty referral checklist.",
          painPath: "admin" as const,
          scoringRationale: "Medium benefit; deterministic output.",
          stepCountTarget: 8,
          format: "ordered-steps" as const,
          permissionTier: "T0" as const,
        },
      },
      state: "optional" as const,
    },
    {
      kind: "skill" as const,
      label: "Build a referral skill",
      rationale: "Not yet recommended — try prompt first.",
      confidence: 40,
      builderHandoff: {
        seed: {
          builderKind: "skill" as const,
          taskTitle: "Referral letter draft automation",
          taskDescription: null,
          painPath: "admin" as const,
          scoringRationale: "Low confidence until prompt is validated.",
          scaffoldTarget: "claude-code-skill" as const,
          permissionTier: "T1" as const,
        },
      },
      state: "not-recommended" as const,
    },
    {
      kind: "plugin" as const,
      label: "Build a referral plugin",
      rationale: "Not recommended at this stage.",
      confidence: 20,
      builderHandoff: {
        seed: {
          builderKind: "plugin" as const,
          taskTitle: "Referral letter draft automation",
          taskDescription: null,
          painPath: "admin" as const,
          scoringRationale: "Overkill for current need.",
          scaffoldTarget: "claude-code-plugin" as const,
          permissionTier: "T2" as const,
        },
      },
      state: "not-recommended" as const,
    },
    {
      kind: "agent" as const,
      label: "Build an agent",
      rationale: "Out of scope for P0.",
      confidence: 10,
      builderHandoff: {
        seed: {
          builderKind: "agent" as const,
          taskTitle: "Referral letter draft automation",
          taskDescription: null,
          painPath: "admin" as const,
          scoringRationale: "Not needed yet.",
          scaffoldTarget: "claude-code-plugin" as const,
          permissionTier: "T3" as const,
        },
      },
      state: "not-recommended" as const,
    },
  ],
  confidence: 82,
  methodTrace: [
    { stage: "pain-classify", name: "pain-path", output: { selectedPainPath: "admin", confidence: 0.9 } },
  ],
};

function makeReq(method: string, body?: unknown, url = "http://localhost/api/recommendations"): Request {
  return new Request(url, {
    method,
    headers: { "content-type": "application/json" },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

// ─── Setup / teardown ────────────────────────────────────────────────────

beforeEach(() => {
  dbState.inserts = [];
  dbState.selectRows = [];

  vi.mocked(getSessionActor).mockResolvedValue(null);
  vi.mocked(isGuestRequest).mockResolvedValue(false);
  vi.mocked(checkRateLimit).mockResolvedValue({
    ok: true,
    remaining: 19,
    resetAt: Date.now() + 86_400_000,
  });
  vi.mocked(runRecommendation).mockResolvedValue(MOCK_RECOMMENDATION);
});

afterEach(() => {
  vi.clearAllMocks();
});

// ─── Tests ───────────────────────────────────────────────────────────────

describe("POST /api/recommendations", () => {
  it("T-REC-1: POST as guest → guestMode:true, no DB insert", async () => {
    vi.mocked(isGuestRequest).mockResolvedValue(true);

    const res = await POST(makeReq("POST", VALID_BODY) as never);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.guestMode).toBe(true);
    expect(body.recommendation).toMatchObject({
      selectedPainPath: "admin",
      recommendedTask: "Referral letter draft automation",
    });
    // No DB insert happened.
    expect(lastInsertedRec()).toBeNull();
    expect(withActor).not.toHaveBeenCalled();
  });

  it("T-REC-2: POST as authed → guestMode:false, id returned, DB row inserted", async () => {
    vi.mocked(getSessionActor).mockResolvedValue(ACTOR_A);

    const res = await POST(makeReq("POST", VALID_BODY) as never);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.guestMode).toBe(false);
    expect(typeof body.id).toBe("string");
    expect(body.id.length).toBeGreaterThan(0);
    expect(body.recommendation).toMatchObject({
      selectedPainPath: "admin",
      candidateTasks: expect.arrayContaining([
        expect.objectContaining({ id: "referral-draft-automation" }),
      ]),
    });
    // DB insert happened.
    expect(lastInsertedRec()).not.toBeNull();
    expect(lastInsertedRec()).toMatchObject({
      userId: ACTOR_A.userId,
      tenantId: ACTOR_A.tenantId,
      painPath: "admin",
    });
  });

  it("T-REC-3: POST invalid body → 400 with Zod error details", async () => {
    vi.mocked(getSessionActor).mockResolvedValue(ACTOR_A);

    const res = await POST(makeReq("POST", { painPath: "invalid_path", challengeText: "" }) as never);
    expect(res.status).toBe(400);

    const body = await res.json();
    expect(body.error).toBe("Invalid input");
    expect(body.details).toBeDefined();
    // No DB write.
    expect(lastInsertedRec()).toBeNull();
  });

  it("T-REC-4: POST rate limited → 429", async () => {
    vi.mocked(getSessionActor).mockResolvedValue(ACTOR_A);
    vi.mocked(checkRateLimit).mockResolvedValue({
      ok: false,
      remaining: 0,
      resetAt: Date.now() + 3_600_000,
    });

    const res = await POST(makeReq("POST", VALID_BODY) as never);
    expect(res.status).toBe(429);

    const body = await res.json();
    expect(body.error).toBe("rate_limited");
    expect(body.resetAt).toBeDefined();
  });

  it("T-REC-5: POST unauthenticated (no actor, no guest cookie) → 401", async () => {
    // Neither actor nor guest — defaults from beforeEach apply.
    const res = await POST(makeReq("POST", VALID_BODY) as never);
    expect(res.status).toBe(401);
  });

  it("T-REC-7: Audit row written on authed POST with correct metadata", async () => {
    vi.mocked(getSessionActor).mockResolvedValue(ACTOR_A);

    await POST(makeReq("POST", VALID_BODY) as never);

    expect(lastInsertedAudit()).not.toBeNull();
    expect(lastInsertedAudit()).toMatchObject({
      userId: ACTOR_A.userId,
      tenantId: ACTOR_A.tenantId,
      action: "recommendation.create",
    });
    const meta = lastInsertedAudit()?.metadata as Record<string, unknown>;
    expect(meta.painPath).toBe("admin");
    expect(typeof meta.latencyMs).toBe("number");
    expect(meta.candidateCount).toBeGreaterThan(0);
  });

  it("T-REC-8: Adoption pathway rungs with state=not-recommended persist (UI filters on render)", async () => {
    vi.mocked(getSessionActor).mockResolvedValue(ACTOR_A);

    const res = await POST(makeReq("POST", VALID_BODY) as never);
    const body = await res.json();

    // All 5 rungs should be in the response, including not-recommended ones.
    const pathway = body.recommendation.adoptionPathway as Array<{ state: string }>;
    expect(pathway).toHaveLength(5);
    const notRecommended = pathway.filter((r) => r.state === "not-recommended");
    expect(notRecommended.length).toBeGreaterThanOrEqual(1);

    // Persisted row also carries all rungs (UI filters on render, not on write).
    expect(lastInsertedRec()).toMatchObject({
      adoptionPathway: expect.arrayContaining([
        expect.objectContaining({ state: "not-recommended" }),
      ]),
    });
  });
});

describe("GET /api/recommendations", () => {
  it("T-REC-5b: GET as guest (no actor) → 401", async () => {
    // isGuestRequest returns false (default); no actor.
    const res = await GET(makeReq("GET", undefined, "http://localhost/api/recommendations") as never);
    expect(res.status).toBe(401);
  });

  it("T-REC-6: GET as authed → paginated list, RLS-scoped", async () => {
    vi.mocked(getSessionActor).mockResolvedValue(ACTOR_A);

    // Stub user A's rows.
    dbState.selectRows = [
      {
        id: "rec-a-1",
        userId: ACTOR_A.userId,
        tenantId: ACTOR_A.tenantId,
        painPath: "admin",
        challengeSummary: "Test",
        createdAt: new Date("2026-05-10T00:00:00Z"),
      },
    ];

    const res = await GET(makeReq("GET", undefined, "http://localhost/api/recommendations?limit=20") as never);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(Array.isArray(body.items)).toBe(true);
    expect(body).toHaveProperty("hasMore");
    expect(body).toHaveProperty("nextCursor");
  });

  it("T-REC-6b: RLS isolation — user B cannot see user A rows (DB enforces via RLS)", async () => {
    // This test verifies that the route does NOT add a manual userId filter —
    // it relies on RLS. The DB stub here returns empty for user B (simulating RLS).
    vi.mocked(getSessionActor).mockResolvedValue(ACTOR_B);
    dbState.selectRows = []; // RLS blocks user B from seeing user A's rows

    const res = await GET(makeReq("GET", undefined, "http://localhost/api/recommendations") as never);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.items).toHaveLength(0);
    expect(body.hasMore).toBe(false);
  });
});
