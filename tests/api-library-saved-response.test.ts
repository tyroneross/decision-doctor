/**
 * tests/api-library-saved-response.test.ts — saved-response API unit tests.
 *
 * Verifies:
 *   - GET unauthed → 401
 *   - GET authed → returns list
 *   - POST unauthed → 401
 *   - POST bad body (missing question) → 400
 *   - POST valid → 201
 *   - DELETE unauthed → 401
 *   - DELETE unknown → 404
 *   - DELETE valid → 200
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth-session", () => ({
  getSessionActor: vi.fn(),
}));

vi.mock("@/lib/library", () => ({
  listSavedResponses: vi.fn(),
  createSavedResponse: vi.fn(),
  deleteSavedResponse: vi.fn(),
}));

import { getSessionActor } from "@/lib/auth-session";
import {
  listSavedResponses,
  createSavedResponse,
  deleteSavedResponse,
} from "@/lib/library";

import { GET, POST } from "@/app/api/library/saved-responses/route";
import { DELETE } from "@/app/api/library/saved-responses/[id]/route";

const mockActor = {
  userId: "00000000-0000-0000-0000-000000000001",
  tenantId: "00000000-0000-0000-0000-000000000002",
  email: "u@example.com",
};
// Real v4 UUID — Zod 4 strict-RFC requires `4xxx` and `[89ab]xxx` groups.
const VALID_UUID = "22222222-2222-4222-8222-222222222222";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/library/saved-responses", () => {
  it("returns 401 when unauthenticated", async () => {
    vi.mocked(getSessionActor).mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("returns the list when authed", async () => {
    vi.mocked(getSessionActor).mockResolvedValue(mockActor);
    vi.mocked(listSavedResponses).mockResolvedValue([
      // @ts-expect-error — partial fixture.
      { id: "a", scope: mockActor.userId, question: "Q?", answer: "A" },
    ]);
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.saved_responses).toHaveLength(1);
  });
});

describe("POST /api/library/saved-responses", () => {
  it("returns 401 when unauthenticated", async () => {
    vi.mocked(getSessionActor).mockResolvedValue(null);
    const req = new Request("http://x", {
      method: "POST",
      body: JSON.stringify({ question: "Q", answer: "A" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("returns 400 on bad body", async () => {
    vi.mocked(getSessionActor).mockResolvedValue(mockActor);
    const req = new Request("http://x", {
      method: "POST",
      body: JSON.stringify({ answer: "A" }), // missing question
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns 201 on valid body", async () => {
    vi.mocked(getSessionActor).mockResolvedValue(mockActor);
    // @ts-expect-error — partial fixture.
    vi.mocked(createSavedResponse).mockResolvedValue({
      id: "new",
      question: "Q",
      answer: "A",
    });
    const req = new Request("http://x", {
      method: "POST",
      body: JSON.stringify({
        question: "Q",
        answer: "A",
        citations: [{ uuid: "u1", kind: "corpus", title: "T" }],
        wasGrounded: true,
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.saved_response.id).toBe("new");
    expect(vi.mocked(createSavedResponse)).toHaveBeenCalledWith(
      mockActor.userId,
      mockActor.tenantId,
      expect.objectContaining({
        question: "Q",
        answer: "A",
        wasGrounded: true,
      }),
    );
  });
});

describe("DELETE /api/library/saved-responses/[id]", () => {
  it("returns 401 when unauthenticated", async () => {
    vi.mocked(getSessionActor).mockResolvedValue(null);
    const req = new Request("http://x", { method: "DELETE" });
    const res = await DELETE(req, {
      params: Promise.resolve({ id: VALID_UUID }),
    });
    expect(res.status).toBe(401);
  });

  it("returns 404 when row not found", async () => {
    vi.mocked(getSessionActor).mockResolvedValue(mockActor);
    vi.mocked(deleteSavedResponse).mockResolvedValue(false);
    const req = new Request("http://x", { method: "DELETE" });
    const res = await DELETE(req, {
      params: Promise.resolve({ id: VALID_UUID }),
    });
    expect(res.status).toBe(404);
  });

  it("returns 200 on successful delete", async () => {
    vi.mocked(getSessionActor).mockResolvedValue(mockActor);
    vi.mocked(deleteSavedResponse).mockResolvedValue(true);
    const req = new Request("http://x", { method: "DELETE" });
    const res = await DELETE(req, {
      params: Promise.resolve({ id: VALID_UUID }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
  });
});
