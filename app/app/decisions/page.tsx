import { desc } from "drizzle-orm";
import { decisions } from "@/lib/db/schema";
import { runWithActor, withActor } from "@/lib/db/actor";
import { getSessionActor } from "@/lib/auth-session";
import { totalHoursSaved, streakWeeks } from "@/lib/decision-display";
import {
  DecisionsListClient,
  type DecisionRow,
  type ListSummary,
} from "@/components/decisions/DecisionsListClient";
import { EmptyState } from "@/components/decisions/EmptyState";

// SSR — RLS-enforced. Loads the user's prior decisions, projects to a
// shape the list client can render, and computes the hero-ledger
// aggregates server-side so the client gets serialized primitives.
export default async function DecisionsHistoryPage() {
  const actor = await getSessionActor();
  if (!actor) return null; // layout redirects; defensive

  const rows = await runWithActor(
    { userId: actor.userId, tenantId: actor.tenantId },
    async () =>
      withActor(async (tx) =>
        tx
          .select({
            id: decisions.id,
            title: decisions.title,
            templateId: decisions.templateId,
            status: decisions.status,
            createdAt: decisions.createdAt,
            recommendation: decisions.recommendation,
            workloadReducers: decisions.workloadReducers,
          })
          .from(decisions)
          .orderBy(desc(decisions.createdAt))
          .limit(50),
      ),
  );

  if (rows.length === 0) {
    return <EmptyState />;
  }

  // Defensive projection — JSON columns come back as `unknown`.
  const projected: DecisionRow[] = rows.map((r) => {
    const rec =
      r.recommendation && typeof r.recommendation === "object"
        ? (r.recommendation as {
            option?: string;
            confidence?: number;
          })
        : null;
    const reducerArr = Array.isArray(r.workloadReducers) ? r.workloadReducers : [];
    return {
      id: r.id,
      title: r.title,
      templateId: r.templateId,
      status: r.status,
      createdAt: r.createdAt.toISOString(),
      recommendationOption: rec?.option ?? null,
      recommendationConfidence:
        typeof rec?.confidence === "number" ? rec.confidence : null,
      hoursSaved: totalHoursSaved(reducerArr),
      reducerCount: reducerArr.length,
    };
  });

  const summary: ListSummary = {
    totalHoursPerWeek: projected.reduce((s, r) => s + r.hoursSaved, 0),
    decisions: projected.length,
    skillsShipped: projected.reduce((s, r) => s + r.reducerCount, 0),
    streakWeeks: streakWeeks(rows.map((r) => r.createdAt)),
  };

  return <DecisionsListClient rows={projected} summary={summary} />;
}
