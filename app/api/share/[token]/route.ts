import "server-only";

import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db/actor";
import { decisions } from "@/lib/db/schema";

export const runtime = "nodejs";

function jsonError(error: string, status: number) {
  return Response.json({ error }, { status });
}

export async function GET(
  _req: Request,
  context: { params: Promise<{ token: string }> },
) {
  const { token } = await context.params;
  const rows = await getDb()
    .select({
      id: decisions.id,
      decidedAt: decisions.createdAt,
      templateId: decisions.templateId,
      recommendation: decisions.recommendation,
      alternatives: decisions.alternatives,
      robustAlternative: decisions.robustAlternative,
      methodTrace: decisions.methodTrace,
      workloadReducers: decisions.workloadReducers,
      destinations: decisions.destinations,
    })
    .from(decisions)
    .where(eq(decisions.shareToken, token))
    .limit(1);

  if (!rows[0]) {
    return jsonError("Not found", 404);
  }

  return Response.json(rows[0]);
}
