// PRD §F-06 — Decision history list (RLS-enforced).

import Link from "next/link";
import { runWithActor, withActor } from "@/lib/db/actor";
import { decisions } from "@/lib/db/schema";
import { desc, eq } from "drizzle-orm";
import { getActorSession } from "@/lib/session";
import { redirect } from "next/navigation";

export default async function HistoryPage() {
  const session = await getActorSession();
  if (!session) redirect("/sign-in");

  const rows = await runWithActor(
    { userId: session.userId, tenantId: session.tenantId },
    async () =>
      withActor(async (tx) => {
        return tx
          .select({
            id: decisions.id,
            templateId: decisions.templateId,
            createdAt: decisions.createdAt,
            recommendation: decisions.recommendation,
            status: decisions.status,
          })
          .from(decisions)
          .where(eq(decisions.userId, session.userId))
          .orderBy(desc(decisions.createdAt))
          .limit(50);
      }),
  );

  return (
    <main className="px-4 sm:px-6 py-6 max-w-3xl">
      <h1 className="text-2xl font-semibold">Your decisions</h1>
      <p className="mt-2 text-sm text-ink-subtle">
        Most recent first. Tap to re-read the math.
      </p>
      {rows.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-dashed border-slate-300 p-6 text-center text-ink-muted">
          You haven't made a decision yet.
          <div className="mt-3">
            <Link
              href="/app"
              className="inline-flex items-center justify-center px-4 py-2 rounded-xl bg-ink text-white text-sm"
            >
              Pick a template
            </Link>
          </div>
        </div>
      ) : (
        <ul className="mt-6 divide-y divide-slate-200 rounded-2xl border border-slate-200 bg-canvas-raised">
          {rows.map((d) => {
            const rec = d.recommendation as { option?: string } | null;
            return (
              <li key={d.id}>
                <Link
                  href={`/app/decisions/${d.id}`}
                  className="block p-4 hover:bg-slate-50"
                >
                  <div className="text-xs text-ink-muted uppercase tracking-wide">
                    {d.templateId}
                  </div>
                  <div className="mt-1 text-base font-medium">
                    {rec?.option ?? "Pending"}
                  </div>
                  <div className="mt-1 text-xs text-ink-muted">
                    {new Date(d.createdAt).toLocaleString()}
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
