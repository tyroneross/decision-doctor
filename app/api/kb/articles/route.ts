// GET /api/kb/articles?search=<q>
//
// Guest-friendly: guests see scope='global' rows only (RLS enforces via
// synthetic UUID matching /api/library/use-cases pattern).
// Authed users see global + their own user-scoped rows (future-extensible).

import "server-only";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionActor } from "@/lib/auth-session";
import { isGuestRequest } from "@/lib/auth-guest";
import { GUEST_TENANT_ID, GUEST_USER_ID } from "@/lib/guest-identity";
import { listKbArticles, searchKbArticles } from "@/lib/kb";

// Hardening item 7: nodejs runtime required for Neon WebSocket pool + RLS.
export const runtime = "nodejs";

const QuerySchema = z.object({
  search: z.string().min(1).max(500).optional(),
});

export async function GET(req: Request) {
  const actor = await getSessionActor();
  const guest = !actor && (await isGuestRequest());
  if (!actor && !guest) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const parsed = QuerySchema.safeParse({
    search: searchParams.get("search") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json(
      { error: "bad_request", detail: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const userId = actor?.userId ?? GUEST_USER_ID;
  const tenantId = actor?.tenantId ?? GUEST_TENANT_ID;

  try {
    if (parsed.data.search) {
      const results = await searchKbArticles({ userId, tenantId }, parsed.data.search);
      return NextResponse.json({ articles: results, query: parsed.data.search });
    }
    const articles = await listKbArticles({ userId, tenantId });
    return NextResponse.json({ articles });
  } catch (err) {
    console.error("[/api/kb/articles] failed:", err);
    return NextResponse.json({ error: "kb_articles_failed" }, { status: 500 });
  }
}
