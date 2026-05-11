import { redirect } from "next/navigation";
import Link from "next/link";
import { headers } from "next/headers";
import { desc } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { decisions } from "@/lib/db/schema";
import { runWithActor, withActor } from "@/lib/db/actor";
import { getSessionActor } from "@/lib/auth-session";
import { Card } from "@/components/ui/Card";
import { F1HomeSearch } from "./_components/F1HomeSearch";

/**
 * F1 — Home (search-first).
 *
 * UI Guidelines v0.1, line 207-215. Bottom-anchored pill search is the
 * primary affordance; "Recent decisions" tile sits above the prompt.
 *
 * Submit creates a chat thread seeded with the typed text — routes to
 * /app/chat?seed=<encoded>. C6a will wire seed-handling into Chat.tsx;
 * until then, the param is ignored cleanly (chat opens empty).
 */
export default async function HomePage() {
  // Auth gate is in app/app/layout.tsx, but layout.tsx no longer
  // SSR-redirects — confirm here too. (Belt-and-suspenders: layout
  // does redirect, so this is defensive.)
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) redirect("/sign-in");

  // Recent decisions — best-effort, silent degrade.
  let recent: { id: string; title: string; templateId: string | null }[] = [];
  try {
    const actor = await getSessionActor();
    if (actor) {
      const rows = await runWithActor(
        { userId: actor.userId, tenantId: actor.tenantId },
        async () =>
          withActor(async (tx) =>
            tx
              .select({
                id: decisions.id,
                title: decisions.title,
                templateId: decisions.templateId,
              })
              .from(decisions)
              .orderBy(desc(decisions.createdAt))
              .limit(3)
          )
      );
      recent = rows.map((r) => ({
        id: r.id,
        title: r.title ?? "(untitled decision)",
        templateId: r.templateId,
      }));
    }
  } catch {
    // Silent degrade. Recent tile just hides.
  }

  return (
    <div className="relative min-h-[calc(100vh-3rem)] lg:min-h-screen flex flex-col">
      {/* Center stack: prompt + recent tile */}
      <div className="flex-1 flex flex-col items-center justify-center px-5 pt-10 pb-32 lg:pb-40 max-w-2xl mx-auto w-full">
        <p className="text-[14px] text-mute mb-8 text-center">
          describe a decision you&rsquo;re stuck on…
        </p>

        {recent.length > 0 && (
          <Card flat className="w-full max-w-xl">
            <h2 className="text-[12px] font-semibold uppercase tracking-wider text-mute mb-3">
              Recent decisions
            </h2>
            <ul className="divide-y divide-line">
              {recent.map((d) => (
                <li key={d.id}>
                  <Link
                    href={`/app/decisions/${d.id}`}
                    className="block py-2.5 hover:bg-line/30 -mx-4 px-4 rounded transition-colors"
                  >
                    <p className="text-[14px] font-medium text-text leading-snug line-clamp-1">
                      {d.title}
                    </p>
                    {d.templateId && (
                      <p className="text-[12px] text-mute mt-0.5">
                        {labelForTemplate(d.templateId)}
                      </p>
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>

      {/* Bottom-anchored pill search */}
      <div
        className={
          "fixed bottom-[60px] inset-x-0 px-4 z-30 " +
          "lg:absolute lg:bottom-6 lg:max-w-xl lg:left-1/2 lg:-translate-x-1/2 lg:px-0"
        }
      >
        <F1HomeSearch />
      </div>
    </div>
  );
}

function labelForTemplate(id: string): string {
  switch (id) {
    case "capacity":
      return "Capacity";
    case "pricing":
      return "Pricing";
    case "admin-hire":
      return "Admin / hire";
    default:
      return id;
  }
}
