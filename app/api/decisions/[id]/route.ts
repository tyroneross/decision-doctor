// GET /api/decisions/[id] — fetch the user's own decision (RLS-enforced).
// Returns 404 even when the row exists in another tenant (T-08).

import "server-only";
import { runWithActor, withActor } from "@/lib/db/actor";
import { decisions } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getActorSession } from "@/lib/session";

export const runtime = "nodejs";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getActorSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  return runWithActor({ userId: session.userId, tenantId: session.tenantId }, async () => {
    return withActor(async (tx) => {
      const rows = await tx
        .select()
        .from(decisions)
        .where(eq(decisions.id, id))
        .limit(1);
      const row = rows[0];
      if (!row) return Response.json({ error: "Not found" }, { status: 404 });
      return Response.json({ decision: row });
    });
  });
}
