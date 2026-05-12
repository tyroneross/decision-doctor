/**
 * tests/api-library-saved-search.test.ts — saved-search API unit tests.
 *
 * Mirrors tests/api-library-promote.test.ts mocking shape. Verifies:
 *   - GET unauthed → 401
 *   - GET authed → returns list
 *   - POST unauthed → 401
 *   - POST bad body → 400
 *   - POST valid → 201 with payload echoed
 *   - PATCH unauthed → 401
 *   - PATCH bad id → 400
 *   - PATCH unknown id → 404
 *   - PATCH valid → 200
 *   - DELETE unauthed → 401
 *   - DELETE unknown id → 404
 *   - DELETE valid → 200
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth-session", () => ({
  getSessionActor: vi.fn(),
}));

vi.mock("@/lib/library", () => ({
  listSavedSearches: vi.fn(),
  createSavedSearch: vi.fn(),
  renameSavedSearch: vi.fn(),
  deleteSavedSearch: vi.fn(),
}));

// server-only is shimmed via vitest config alias.

import { getSessionActor } from "@/lib/auth-session";
import {
  listSavedSearches,
  createSavedSearch,
  renameSavedSearch,
  deleteSavedSearch,
} from "@/lib/library";

import { GET, POST } from "@/app/api/library/saved-searches/route";
import {
  PATCH,
  DELETE,
} from "@/app/api/library/saved-searches/[id]/route";

const mockActor = {
  userId: "00000000-0000-0000-0000-000000000001",
  tenantId: "00000000-0000-0000-0000-000000000002",
  email: "u@example.com",
};
// Real v4 UUID (third group starts with 4, fourth with 8/9/a/b per RFC 4122).
// Zod 4's z.string().uuid() enforces the strict RFC 4122 format.
const VALID_UUID = "11111111-1111-4111-8111-111111111111";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/library/saved-searches", () => {
  it("returns 401 when unauthenticated", async () => {
    vi.mocked(getSessionActor).mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("returns the list when authed", async () => {
    vi.mocked(getSessionActor).mockResolvedValue(mockActor);
    vi.mocked(listSavedSearches).mockResolvedValue([
      // @ts-expect-error — partial fixture, only fields we care about.
      { id: "a", scope: mockActor.userId, query: "q1", name: null },
    ]);
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.saved_searches).toHaveLength(1);
    expect(body.saved_searches[0].query).toBe("q1");
  });
});

describe("POST /api/library/saved-searches", () => {
  it("returns 401 when unauthenticated", async () => {
    vi.mocked(getSessionActor).mockResolvedValue(null);
    const req = new Request("http://x/api/library/saved-searches", {
      method: "POST",
      body: JSON.stringify({ query: "x" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("returns 400 on invalid body", async () => {
    vi.mocked(getSessionActor).mockResolvedValue(mockActor);
    const req = new Request("http://x/api/library/saved-searches", {
      method: "POST",
      body: JSON.stringify({ kindFilter: "not-an-array" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("creates and returns 201 on valid body", async () => {
    vi.mocked(getSessionActor).mockResolvedValue(mockActor);
    // @ts-expect-error — partial fixture for echo only.
    vi.mocked(createSavedSearch).mockResolvedValue({
      id: "new",
      query: "qq",
      name: "My pin",
      scope: mockActor.userId,
    });
    const req = new Request("http://x/api/library/saved-searches", {
      method: "POST",
      body: JSON.stringify({
        query: "qq",
        kindFilter: ["use_case"],
        pathFilter: ["all"],
        onlyMine: false,
        name: "My pin",
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.saved_search.id).toBe("new");
    expect(vi.mocked(createSavedSearch)).toHaveBeenCalledWith(
      mockActor.userId,
      mockActor.tenantId,
      expect.objectContaining({ query: "qq", name: "My pin" }),
    );
  });
});

describe("PATCH /api/library/saved-searches/[id]", () => {
  it("returns 401 when unauthenticated", async () => {
    vi.mocked(getSessionActor).mockResolvedValue(null);
    const req = new Request("http://x", {
      method: "PATCH",
      body: JSON.stringify({ name: "x" }),
    });
    const res = await PATCH(req, { params: Promise.resolve({ id: VALID_UUID }) });
    expect(res.status).toBe(401);
  });

  it("returns 400 on malformed id", async () => {
    vi.mocked(getSessionActor).mockResolvedValue(mockActor);
    const req = new Request("http://x", {
      method: "PATCH",
      body: JSON.stringify({ name: "x" }),
    });
    const res = await PATCH(req, { params: Promise.resolve({ id: "nope" }) });
    expect(res.status).toBe(400);
  });

  it("returns 404 when row not found", async () => {
    vi.mocked(getSessionActor).mockResolvedValue(mockActor);
    vi.mocked(renameSavedSearch).mockResolvedValue(null);
    const req = new Request("http://x", {
      method: "PATCH",
      body: JSON.stringify({ name: "x" }),
    });
    const res = await PATCH(req, { params: Promise.resolve({ id: VALID_UUID }) });
    expect(res.status).toBe(404);
  });

  it("returns 200 on successful rename", async () => {
    vi.mocked(getSessionActor).mockResolvedValue(mockActor);
    // @ts-expect-error — partial fixture.
    vi.mocked(renameSavedSearch).mockResolvedValue({ id: VALID_UUID, name: "new" });
    const req = new Request("http://x", {
      method: "PATCH",
      body: JSON.stringify({ name: "new" }),
    });
    const res = await PATCH(req, { params: Promise.resolve({ id: VALID_UUID }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.saved_search.name).toBe("new");
  });
});

describe("DELETE /api/library/saved-searches/[id]", () => {
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
    vi.mocked(deleteSavedSearch).mockResolvedValue(false);
    const req = new Request("http://x", { method: "DELETE" });
    const res = await DELETE(req, {
      params: Promise.resolve({ id: VALID_UUID }),
    });
    expect(res.status).toBe(404);
  });

  it("returns 200 on successful delete", async () => {
    vi.mocked(getSessionActor).mockResolvedValue(mockActor);
    vi.mocked(deleteSavedSearch).mockResolvedValue(true);
    const req = new Request("http://x", { method: "DELETE" });
    const res = await DELETE(req, {
      params: Promise.resolve({ id: VALID_UUID }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
  });
});
