import { desc } from "drizzle-orm";
import { cookies } from "next/headers";
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

// Demo data for guest mode
const DEMO_ROWS: DecisionRow[] = [
  {
    id: "demo-1",
    title: "Deploy this stack: AI clinical scribe + SimplePractice",
    templateId: "capacity",
    status: "complete",
    createdAt: new Date().toISOString(),
    recommendationOption: "AI clinical scribe + SimplePractice integration",
    recommendationConfidence: 94,
    hoursSaved: 4.5,
    reducerCount: 4,
  },
  {
    id: "demo-2",
    title: "Automate billing with Headway / Alma integration",
    templateId: "capacity",
    status: "complete",
    createdAt: new Date(Date.now() - 86400000).toISOString(),
    recommendationOption: "Headway billing automation",
    recommendationConfidence: 88,
    hoursSaved: 3.0,
    reducerCount: 2,
  },
  {
    id: "demo-3",
    title: "Should I raise session rates by 15%?",
    templateId: "pricing",
    status: "complete",
    createdAt: new Date(Date.now() - 172800000).toISOString(),
    recommendationOption: "Raise rates 15% for new clients only",
    recommendationConfidence: 76,
    hoursSaved: 0,
    reducerCount: 1,
  },
  {
    id: "demo-4",
    title: "Hire a virtual assistant for intake calls",
    templateId: "admin-hire",
    status: "complete",
    createdAt: new Date(Date.now() - 259200000).toISOString(),
    recommendationOption: "Part-time VA, 10 hrs/week",
    recommendationConfidence: 82,
    hoursSaved: 5.0,
    reducerCount: 3,
  },
];

const DEMO_SUMMARY: ListSummary = {
  totalHoursPerWeek: 12.5,
  decisions: 4,
  skillsShipped: 10,
  streakWeeks: 2,
};

// SSR — RLS-enforced. Loads the user's prior decisions, projects to a
// shape the list client can render, and computes the hero-ledger
// aggregates server-side so the client gets serialized primitives.
// Guest mode: returns demo data for UI preview.
export default async function DecisionsHistoryPage() {
  const cookieStore = await cookies();
  const isGuest = cookieStore.get("dd_guest")?.value === "true";

  // Guest mode: return demo data
  if (isGuest) {
    return <DecisionsListClient rows={DEMO_ROWS} summary={DEMO_SUMMARY} isGuest />;
  }

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
