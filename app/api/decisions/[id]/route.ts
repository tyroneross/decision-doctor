// DELETE /api/decisions/[id]
// GET    /api/decisions/[id]   (placeholder — returns 410 Gone for now;
//                               read paths live under /app/history/[id] SSR.)
//
// Authed-only — guests have no DB rows to delete. Hard-deletes the row by
// (id, userId) under RLS via runWithActor/withActor. Cascading FK rows
// follow the schema's onDelete behavior; we don't manually fan out.
//
// LD-08: Edge runtime breaks the Neon WebSocket pool that RLS depends on,
// so we pin nodejs.

import "server-only";
import { eq, and } from "drizzle-orm";
import { runWithActor, withActor } from "@/lib/db/actor";
import { decisions, auditEvents } from "@/lib/db/schema";
import { getSessionActor } from "@/lib/auth-session";

export const runtime = "nodejs";

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const actor = await getSessionActor();
  if (!actor) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await ctx.params;
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) {
    return Response.json({ error: "bad_request" }, { status: 400 });
  }

  const userId = actor.userId;
  const tenantId = actor.tenantId;

  return runWithActor(
    { userId, tenantId },
    async () =>
      withActor(async (tx) => {
        // RLS already filters by tenant; we add userId for ownership clarity.
        const deleted = await tx
          .delete(decisions)
          .where(and(eq(decisions.id, id), eq(decisions.userId, userId)))
          .returning({ id: decisions.id });

        if (deleted.length === 0) {
          return Response.json({ error: "not_found" }, { status: 404 });
        }

        // Best-effort audit row. Failure here must NOT undo the delete.
        try {
          await tx.insert(auditEvents).values({
            userId,
            tenantId,
            action: "decision.delete",
            targetId: id,
            metadata: { source: "sidebar" },
          });
        } catch (err) {
          console.warn("[/api/decisions/:id] audit write failed:", err);
        }

        return new Response(null, { status: 204 });
      }),
  );
}
