/**
 * T-CHAT-1..4 — /api/chat route-handler integration tests.
 *
 * Strategy: import the POST handler directly (no Next dev server). Mock
 * the four external dependencies — Groq, getSessionActor, runWithActor,
 * the engine — so the test exercises only the route's own logic
 * (auth/parse/rate-limit/dispatch).
 *
 *   T-CHAT-1: insufficient context  → 200 status:asking
 *   T-CHAT-2: sufficient context    → 200 status:ready w/ valid DecisionPayload
 *   T-CHAT-3: 21st request in 24h   → 429 (in-memory rate-limit)
 *   T-CHAT-4: unauthenticated       → 401
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ─── Mocks (must be hoisted before the route import) ────────────────────

vi.mock("@/lib/auth-session", () => ({
  getSessionActor: vi.fn(),
}));

vi.mock("@/lib/auth-guest", () => ({
  isGuestRequest: vi.fn(),
}));

vi.mock("@/lib/groq", () => ({
  groq: {
    chat: {
      completions: {
        create: vi.fn(),
      },
    },
  },
  GROQ_MODEL: "test-model",
  callStage: vi.fn(async () => ({
    answer: JSON.stringify({}),
    reasoning: null,
    tokensIn: 0,
    tokensOut: 0,
  })),
}));

vi.mock("@/lib/db/actor", () => ({
  // Persist is best-effort — the route no-ops on persist failure. Bypass DB in tests.
  runWithActor: vi.fn(async (_ctx: unknown, fn: () => Promise<unknown>) => fn()),
  withActor: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => {
    const stubTx = {
      insert: () => ({
        values: () => ({
          returning: async () => [{ id: "test-decision-id" }],
        }),
      }),
    };
    return fn(stubTx);
  }),
}));

vi.mock("@/lib/engine/orchestrator", () => ({
  runDecision: vi.fn(async () => ({
    output: {
      recommendation: {
        option: "Hire a part-time VA",
        confidence: 78,
        rationale: "Adds clinical capacity without evening hours.",
      },
      alternatives: [
        { option: "Add evening hours", reason: "violates hard constraint" },
      ],
      robustAlternative: { option: "Cap intakes 8 wk", why: "Lower regret." },
      methodTrace: [
        { stage: 1, label: "Values", detail: "Captured 4 priorities" },
      ],
      workloadReducers: [
        {
          type: "prompt",
          title: "VA job description generator",
          description: "Paste-ready job post.",
          artifact: { promptText: "You are a hiring helper..." },
          permission_tier: "public",
          estTimeSavingHrsPerWeek: 4,
        },
        {
          type: "playbook",
          title: "Onboarding week 1",
          description: "Five steps for first week.",
          artifact: { playbookSteps: ["a", "b", "c", "d", "e"] },
          permission_tier: "public",
          estTimeSavingHrsPerWeek: 1,
        },
        {
          type: "skill",
          title: "Screening rubric",
          description: "Three-question phone screen.",
          artifact: { skillName: "va-screen" },
          permission_tier: "public",
          estTimeSavingHrsPerWeek: 1,
        },
      ],
      destinations: [],
    },
    llmCalls: [{ tokensIn: 500, tokensOut: 200 }],
  })),
}));

// Importing AFTER vi.mock so the mocks bind first.
import { POST } from "@/app/api/chat/route";
import { getSessionActor } from "@/lib/auth-session";
import { isGuestRequest } from "@/lib/auth-guest";
import { groq } from "@/lib/groq";
import { __resetInMemoryForTests } from "@/lib/ratelimit";

const TEST_ACTOR = {
  userId: "00000000-0000-0000-0000-000000000aaa",
  tenantId: "00000000-0000-0000-0000-000000000bbb",
  email: "test@example.invalid",
};

function reqWith(body: unknown): Request {
  return new Request("http://localhost/api/chat", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.mocked(getSessionActor).mockResolvedValue(TEST_ACTOR);
  vi.mocked(isGuestRequest).mockResolvedValue(false);
  __resetInMemoryForTests();
});

afterEach(() => {
  vi.clearAllMocks();
});

// ─── Tests ──────────────────────────────────────────────────────────────

describe("POST /api/chat", () => {
  it("T-CHAT-1: insufficient context → status:asking", async () => {
    vi.mocked(groq.chat.completions.create).mockResolvedValueOnce({
      choices: [
        {
          message: {
            content: JSON.stringify({
              status: "asking",
              reply: "Tell me more about your week — where do hours disappear?",
            }),
          },
        },
      ],
    } as unknown as Awaited<
      ReturnType<typeof groq.chat.completions.create>
    >);

    const res = await POST(
      reqWith({ messages: [{ role: "user", content: "I'm overwhelmed." }] }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("asking");
    expect(typeof body.reply).toBe("string");
    expect(body.reply.length).toBeGreaterThan(0);
    expect(body).not.toHaveProperty("decision");
  });

  it("T-CHAT-2: sufficient context → status:ready with valid DecisionPayload", async () => {
    vi.mocked(groq.chat.completions.create).mockResolvedValueOnce({
      choices: [
        {
          message: {
            content: JSON.stringify({
              status: "ready",
              reply: "I have what I need — here's your decision.",
              templateId: "admin-hire",
              fields: {
                weeklyAdminHours: 12,
                monthlyBudgetUSD: 1500,
                monthsSavingsRunway: 6,
                growthExpectation: "growing",
                adminTaskMix: "scheduling-billing",
                delegationComfort: "medium",
                horizonMonths: 12,
              },
              painPoints: ["pre-auth on Mondays", "patient intake forms"],
            }),
          },
        },
      ],
    } as unknown as Awaited<
      ReturnType<typeof groq.chat.completions.create>
    >);

    const res = await POST(
      reqWith({
        messages: [
          {
            role: "user",
            content:
              "Pre-auth eats Mondays. Intake forms 20 min each. I draft 6 letters/wk to PCPs. ~12 admin hrs/wk. Budget ~$1500/mo, 6 mo runway, growing.",
          },
        ],
      }),
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("ready");
    expect(body.decision).toBeDefined();
    expect(body.decision.recommendation.option).toBeTruthy();
    expect(typeof body.decision.recommendation.confidence).toBe("number");
    expect(body.decision.workloadReducers.length).toBeGreaterThanOrEqual(3);
    expect(Array.isArray(body.painPoints)).toBe(true);
  });

  it("T-CHAT-3: 21st request in 24h → 429", async () => {
    vi.mocked(groq.chat.completions.create).mockResolvedValue({
      choices: [
        {
          message: {
            content: JSON.stringify({
              status: "asking",
              reply: "Tell me more.",
            }),
          },
        },
      ],
    } as unknown as Awaited<
      ReturnType<typeof groq.chat.completions.create>
    >);

    // 20 successful asks
    for (let i = 0; i < 20; i++) {
      const r = await POST(
        reqWith({ messages: [{ role: "user", content: `q${i}` }] }),
      );
      expect(r.status).toBe(200);
    }

    // 21st should rate-limit
    const r21 = await POST(
      reqWith({ messages: [{ role: "user", content: "one too many" }] }),
    );
    expect(r21.status).toBe(429);
    const body = await r21.json();
    expect(body.error).toBe("rate_limited");
    expect(typeof body.message).toBe("string");
    expect(body.resetAt).toBeTruthy();
  });

  it("T-CHAT-4: unauthenticated → 401", async () => {
    vi.mocked(getSessionActor).mockResolvedValueOnce(null);
    const res = await POST(
      reqWith({ messages: [{ role: "user", content: "anything" }] }),
    );
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("unauthorized");
  });
});
