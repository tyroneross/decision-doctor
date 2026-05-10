// PRD §F-04 — Recommendation view (authenticated). Reads the row via RLS.

import { notFound } from "next/navigation";
import { runWithActor, withActor } from "@/lib/db/actor";
import { decisions } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getActorSession } from "@/lib/session";
import { redirect } from "next/navigation";
import { DecisionOutputSchema, type DecisionOutput } from "@/shared/schema";
import { RecommendationView } from "@/components/recommendation/recommendation-view";
import { loadTemplate } from "@/lib/engine/templates";

export default async function DecisionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getActorSession();
  if (!session) redirect("/sign-in");
  const { id } = await params;

  const row = await runWithActor(
    { userId: session.userId, tenantId: session.tenantId },
    async () =>
      withActor(async (tx) => {
        const rows = await tx.select().from(decisions).where(eq(decisions.id, id)).limit(1);
        return rows[0] ?? null;
      }),
  );
  if (!row) notFound();

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

  const validIds = ["capacity", "pricing", "admin-hire"] as const;
  const tplId = (validIds as readonly string[]).includes(row.templateId)
    ? (row.templateId as (typeof validIds)[number])
    : null;
  const tplTitle = tplId ? loadTemplate(tplId).title : row.templateId;
  return (
    <main className="px-4 sm:px-6 py-6 max-w-3xl mx-auto">
      {/* Lightweight breadcrumb only — the RecommendationView owns the H1 */}
      <div className="text-xs text-ink-muted">
        <span className="uppercase tracking-wide">{tplTitle}</span>
        <span className="mx-2">·</span>
        <span>{new Date(row.createdAt).toLocaleDateString()}</span>
      </div>
      <div className="mt-3">
        <RecommendationView decision={decision} shareToken={row.shareToken} />
      </div>
    </main>
  );
}
