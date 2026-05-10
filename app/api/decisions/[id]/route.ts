import "server-only";

import { and, eq } from "drizzle-orm";
import { getSessionActor } from "@/lib/auth";
import { runWithActor, withActor } from "@/lib/db/actor";
import { decisions } from "@/lib/db/schema";

export const runtime = "nodejs";

function jsonError(error: string, status: number) {
  return Response.json({ error }, { status });
}

function serializeDecision(row: typeof decisions.$inferSelect) {
  return {
    id: row.id,
    decisionId: row.id,
    decidedAt: row.createdAt,
    templateId: row.templateId,
    intake: row.intake,
    recommendation: row.recommendation,
    alternatives: row.alternatives,
    robustAlternative: row.robustAlternative,
    methodTrace: row.methodTrace,
    workloadReducers: row.workloadReducers,
    destinations: row.destinations,
    status: row.status,
    shareToken: row.shareToken,
    createdAt: row.createdAt,
  };
}

export async function GET(
  req: Request,
  context: { params: Promise<{ id: string }> },
) {
  const actor = await getSessionActor(req);
  if (!actor) {
    return jsonError("Unauthorized", 401);
  }

  const { id } = await context.params;
  return runWithActor(actor, async () => {
    return withActor(async (tx) => {
      const rows = await tx
        .select()
        .from(decisions)
        .where(and(eq(decisions.id, id), eq(decisions.userId, actor.userId)))
        .limit(1);

      if (!rows[0]) {
        return jsonError("Not found", 404);
      }

      return Response.json(serializeDecision(rows[0]));
    });
  });
}
