// PRD §F-05 / T-05 — Public share-by-token. Verifies HMAC then fetches the
// row WITHOUT actor context (server-side admin read), redacting userId/tenantId.

import "server-only";
import { db } from "@/lib/db/actor";
import { decisions } from "@/lib/db/schema";
import { sql } from "drizzle-orm";
import { eq } from "drizzle-orm";
import { verifyShareToken } from "@/lib/share";

export const runtime = "nodejs";

export async function GET(_req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const payload = verifyShareToken(token);
  if (!payload) return Response.json({ error: "Invalid token" }, { status: 404 });

  // To bypass RLS for public-share reads we set a dedicated "share" GUC and
  // fall back to a row-level lookup matched on (id, share_token). Since the
  // share_token comes from a signed payload the bypass is safe.
  return db.transaction(async (tx) => {
    // Set a GUC that no policy uses — RLS will block unless we also satisfy
    // a tenant_id check. We provide a permissive GUC by using the row's own
    // tenant after the row is read; do the read without an actor context by
    // selecting via shareToken which is unique across the table. The select
    // still fails RLS, so we use a SECURITY DEFINER-style escape via raw SQL
    // that explicitly disables policy enforcement for the duration.
    await tx.execute(sql`SET LOCAL row_security = off`);
    const rows = await tx
      .select()
      .from(decisions)
      .where(eq(decisions.shareToken, token))
      .limit(1);
    const row = rows[0];
    if (!row || row.id !== payload.decisionId) {
      return Response.json({ error: "Not found" }, { status: 404 });
    }
    // Redact owner identity AND raw intake data from the public payload.
    // (Maya persona retest 2026-05-10: shared link's underlying API was
    // exposing the user's stated hours / budget / specialty — fine for the
    // user, not appropriate for the accountant/spouse the link is shared with.
    // The rendered share page already only shows the recommendation, but
    // anyone curling the API was getting the raw intake. Now they don't.)
    const { userId: _u, tenantId: _t, intake: _i, transcript: _tr, ...publicRow } = row;
    return Response.json({ decision: publicRow });
  });
}
