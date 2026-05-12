import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth-session", () => ({
  getSessionActor: vi.fn(),
}));

vi.mock("@/lib/auth-guest", () => ({
  isGuestRequest: vi.fn(),
}));

vi.mock("@/lib/ratelimit", () => ({
  checkRateLimit: vi.fn(),
}));

import { POST as NEXT_POST } from "@/app/api/recommendations/intake/next/route";
import { POST as ANSWER_POST } from "@/app/api/recommendations/intake/answer/route";
import { getSessionActor } from "@/lib/auth-session";
import { isGuestRequest } from "@/lib/auth-guest";
import { checkRateLimit } from "@/lib/ratelimit";

const ACTOR = {
  userId: "a0000000-0000-4000-8000-000000000001",
  tenantId: "a0000000-0000-4000-8000-000000000002",
  email: "user-a@example.invalid",
};

const challenge =
  "Prior authorization paperwork eats every Monday morning and slows down new referrals.";

function req(body: unknown, url: string): Request {
  return new Request(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.mocked(getSessionActor).mockResolvedValue(ACTOR);
  vi.mocked(isGuestRequest).mockResolvedValue(false);
  vi.mocked(checkRateLimit).mockResolvedValue({
    ok: true,
    remaining: 19,
    resetAt: Date.now() + 86_400_000,
  });
});

describe("adaptive recommendation intake API", () => {
  it("POST /intake/next returns the next server-owned question", async () => {
    const res = await NEXT_POST(
      req(
        { challengeText: challenge, painPath: "admin" },
        "http://localhost/api/recommendations/intake/next",
      ) as never,
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.action).toBe("ask");
    expect(body.question.topic).toBe("frequency");
    expect(body.state.challengeText).toBe(challenge);
  });

  it("POST /intake/next rejects an empty first-turn payload", async () => {
    const res = await NEXT_POST(
      req({}, "http://localhost/api/recommendations/intake/next") as never,
    );

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Invalid input");
  });

  it("POST /intake/next blocks unauthenticated non-guests", async () => {
    vi.mocked(getSessionActor).mockResolvedValue(null);
    vi.mocked(isGuestRequest).mockResolvedValue(false);

    const res = await NEXT_POST(
      req(
        { challengeText: challenge, painPath: "admin" },
        "http://localhost/api/recommendations/intake/next",
      ) as never,
    );

    expect(res.status).toBe(401);
  });

  it("POST /intake/next blocks PHI before controller work", async () => {
    const res = await NEXT_POST(
      req(
        {
          challengeText:
            "Patient John Smith needs prior authorization and DOB 01/02/1970.",
          painPath: "admin",
        },
        "http://localhost/api/recommendations/intake/next",
      ) as never,
    );

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.phiBlocked).toBe(true);
  });

  it("POST /intake/answer returns updated state with promoted scoring value", async () => {
    const nextRes = await NEXT_POST(
      req(
        { challengeText: challenge, painPath: "admin" },
        "http://localhost/api/recommendations/intake/next",
      ) as never,
    );
    const nextBody = await nextRes.json();

    const answerRes = await ANSWER_POST(
      req(
        {
          state: nextBody.state,
          question: nextBody.question,
          display: "Daily",
          raw: "1",
        },
        "http://localhost/api/recommendations/intake/answer",
      ) as never,
    );

    expect(answerRes.status).toBe(200);
    const answerBody = await answerRes.json();
    expect(answerBody.state.scoringInput.frequency).toBe(1);
    expect(answerBody.state.answers).toHaveLength(1);
    expect(answerBody.state.askedTopics).toContain("frequency");
  });
});
