// GET /api/kb/articles/[slug]
//
// Returns one KB article with full body. 404 if slug not visible in actor's scope.

import "server-only";
import { NextResponse } from "next/server";
import { getSessionActor } from "@/lib/auth-session";
import { isGuestRequest } from "@/lib/auth-guest";
import { GUEST_TENANT_ID, GUEST_USER_ID } from "@/lib/guest-identity";
import { getKbArticleBySlug } from "@/lib/kb";

export const runtime = "nodejs";

const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,128}$/;

export async function GET(
  _req: Request,
  context: { params: Promise<{ slug: string }> },
) {
  const { slug } = await context.params;
  if (!SLUG_RE.test(slug)) {
    return NextResponse.json({ error: "bad_slug" }, { status: 400 });
  }

  const actor = await getSessionActor();
  const guest = !actor && (await isGuestRequest());
  if (!actor && !guest) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = actor?.userId ?? GUEST_USER_ID;
  const tenantId = actor?.tenantId ?? GUEST_TENANT_ID;

  try {
    const article = await getKbArticleBySlug({ userId, tenantId }, slug);
    if (!article) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    return NextResponse.json({ article });
  } catch (err) {
    console.error(`[/api/kb/articles/${slug}] failed:`, err);
    return NextResponse.json({ error: "kb_article_failed" }, { status: 500 });
  }
}
