import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { decisions } from "@/lib/db/schema";
import { runWithActor, withActor } from "@/lib/db/actor";
import { getSessionActor } from "@/lib/auth-session";
import { RecommendationView } from "@/components/recommendation/RecommendationView";

type Props = { params: Promise<{ id: string }> };

export default async function DecisionDetailPage({ params }: Props) {
  const { id } = await params;
  const actor = await getSessionActor();
  if (!actor) return null;

  // RLS auto-enforces — cross-tenant returns empty.
  const rows = await runWithActor(
    { userId: actor.userId, tenantId: actor.tenantId },
    async () =>
      withActor(async (tx) =>
        tx.select().from(decisions).where(eq(decisions.id, id)).limit(1),
      ),
  );
  const row = rows[0];
  if (!row) notFound();

  return <RecommendationView row={row} />;
}
