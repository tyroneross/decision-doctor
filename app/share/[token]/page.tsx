// PRD §F-05 — Public share page. Verifies HMAC, renders without auth.

import { notFound } from "next/navigation";
import { db } from "@/lib/db/actor";
import { decisions } from "@/lib/db/schema";
import { eq, sql } from "drizzle-orm";
import { verifyShareToken } from "@/lib/share";
import { DecisionOutputSchema, type DecisionOutput } from "@/shared/schema";
import { RecommendationView } from "@/components/recommendation/recommendation-view";

export const runtime = "nodejs";

export default async function SharePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const payload = verifyShareToken(token);
  if (!payload) notFound();

  const row = await db.transaction(async (tx) => {
    await tx.execute(sql`SET LOCAL row_security = off`);
    const rows = await tx
      .select()
      .from(decisions)
      .where(eq(decisions.shareToken, token))
      .limit(1);
    return rows[0] ?? null;
  });
  if (!row || row.id !== payload.decisionId) notFound();

  const candidate: DecisionOutput = {
    decisionId: row.id,
    decidedAt: row.createdAt,
    recommendation: row.recommendation as DecisionOutput["recommendation"],
    alternatives: row.alternatives as DecisionOutput["alternatives"],
    robustAlternative: row.robustAlternative as DecisionOutput["robustAlternative"],
    methodTrace: row.methodTrace as DecisionOutput["methodTrace"],
    workloadReducers: row.workloadReducers as DecisionOutput["workloadReducers"],
    destinations: (row.destinations as DecisionOutput["destinations"]) ?? [],
  };
  const parsed = DecisionOutputSchema.safeParse(candidate);
  const decision = parsed.success ? parsed.data : candidate;

  return (
    <main className="min-h-screen px-4 sm:px-6 py-6 max-w-3xl mx-auto">
      <div className="text-xs text-ink-muted uppercase tracking-wide">Shared decision</div>
      <h1 className="mt-1 text-2xl font-semibold">{decision.recommendation.option}</h1>
      <div className="mt-1 text-xs text-ink-muted">
        {new Date(row.createdAt).toLocaleString()} · view-only
      </div>
      <div className="mt-5">
        <RecommendationView decision={decision} publicView />
      </div>
    </main>
  );
}
