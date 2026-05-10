import Link from "next/link";
import { desc } from "drizzle-orm";
import { decisions } from "@/lib/db/schema";
import { runWithActor, withActor } from "@/lib/db/actor";
import { getSessionActor } from "@/lib/auth-session";

// SSR — RLS-enforced. List the user's prior decisions, newest first.
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
          })
          .from(decisions)
          .orderBy(desc(decisions.createdAt))
          .limit(50),
      ),
  );

  if (rows.length === 0) {
    return (
      <section className="space-y-6">
        <header>
          <h1 className="text-xl font-semibold">Your decisions</h1>
          <p className="text-sm text-ink-500">
            Nothing here yet. Make your first decision in about three minutes.
          </p>
        </header>
        <div className="rounded-lg border border-ink-100 p-6">
          <h2 className="text-base font-medium text-ink-900">
            Start with a decision template
          </h2>
          <p className="mt-1 text-sm text-ink-500">
            Three templates ship today: clinical capacity, pricing, and an
            administrative hire. Each takes seven fields or fewer.
          </p>
          <Link
            href="/app/decisions/new"
            className="mt-4 inline-flex items-center rounded-md bg-ink-900 px-3 py-2 text-sm font-medium text-white hover:bg-ink-700"
          >
            Start a decision
          </Link>
        </div>
      </section>
    );
  }

  return (
    <section className="space-y-6">
      <header className="flex items-end justify-between">
        <div>
          <h1 className="text-xl font-semibold">Your decisions</h1>
          <p className="text-sm text-ink-500">
            {rows.length} decision{rows.length === 1 ? "" : "s"} on record.
          </p>
        </div>
        <Link
          href="/app/decisions/new"
          className="rounded bg-ink-900 px-3 py-2 text-sm font-medium text-white hover:bg-ink-700"
        >
          New
        </Link>
      </header>
      <ul className="divide-y divide-ink-100 rounded-lg border border-ink-100">
        {rows.map((d) => (
          <li key={d.id}>
            <Link
              href={`/app/decisions/${d.id}`}
              className="flex items-baseline justify-between px-4 py-3 hover:bg-ink-100/40"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-ink-900">
                  {d.title ?? "Untitled decision"}
                </p>
                <p className="text-xs text-ink-500">
                  {d.templateId} · {d.status}
                </p>
              </div>
              <time
                dateTime={d.createdAt.toISOString()}
                className="text-xs text-ink-500"
              >
                {d.createdAt.toLocaleDateString()}
              </time>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
