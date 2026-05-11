import { redirect } from "next/navigation";
import Link from "next/link";
import { headers } from "next/headers";
import { desc } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { isGuestRequest } from "@/lib/auth-guest";
import { decisions } from "@/lib/db/schema";
import { runWithActor, withActor } from "@/lib/db/actor";
import { getSessionActor } from "@/lib/auth-session";
import { Card } from "@/components/ui/Card";
import { PainCardGrid } from "@/components/pain-cards/PainCardGrid";
import { HomeComposer } from "./_components/HomeComposer";

/**
 * V2 U1 — Hybrid first screen.
 *
 * Layout per PRD Screen 1 + UX doc §"Screen 1 — Hybrid First Screen":
 *   1. Brand + tagline header
 *   2. Multiline PillSearchBar composer (chat-first path)
 *   3. "or pick a path" divider
 *   4. 6 pain cards (5 guided + custom) — 2-col mobile, 3-col desktop
 *   5. Secondary nav: library link + Ask DD link
 *   6. V1 fallback: structured decisions
 *
 * Recent recommendations tile: SSR fetch top 3 from decisions table
 * (recommendations table ships in E3; graceful no-op until then).
 *
 * SSR-gated by auth. No per-pain colors. Theme tokens throughout.
 */
export default async function HomePage() {
  const session = await auth.api.getSession({ headers: await headers() });
  const guest = !session?.user && (await isGuestRequest());
  if (!session?.user && !guest) redirect("/sign-in");

  // Recent activity — best-effort, silent degrade. Skipped in guest mode.
  // TODO: Iteration E3 — swap decisions fetch for recommendations table once
  //       /api/recommendations route ships (E3 chunk). Top 3 most recent.
  let recent: { id: string; title: string; templateId: string | null }[] = [];
  try {
    const actor = guest ? null : await getSessionActor();
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
        title: r.title ?? "(untitled)",
        templateId: r.templateId,
      }));
    }
  } catch {
    // Silent degrade — recent tile hides.
  }

  return (
    <div className="max-w-2xl mx-auto px-5 py-10 space-y-8">
      {/* Brand + tagline */}
      <header className="space-y-1">
        <h1 className="text-[32px] font-bold leading-none text-ink">
          decision doctor
        </h1>
        <p className="text-[14px] font-normal text-mute">
          AI deployment strategist for your practice
        </p>
      </header>

      {/* Composer — chat-first entry path */}
      <section aria-label="Describe your challenge">
        <HomeComposer />
      </section>

      {/* Or-pick-a-path divider */}
      <div className="flex items-center gap-3" aria-hidden>
        <div className="flex-1 border-t border-line" />
        <span className="text-[13px] text-mute shrink-0">or pick a path</span>
        <div className="flex-1 border-t border-line" />
      </div>

      {/* Pain card grid — 2-col mobile, 3-col desktop */}
      <section aria-label="Guided pain paths">
        <PainCardGrid />
      </section>

      {/* Secondary nav row */}
      <nav
        className="flex flex-wrap gap-x-6 gap-y-2 text-[13px]"
        aria-label="Secondary navigation"
      >
        <Link
          href="/app/library"
          className="text-ink font-medium hover:underline underline-offset-2"
        >
          Browse the library →
        </Link>
        {/* TODO: Iteration Q1 — /app/ask route ships in Q1 chunk. */}
        <Link
          href="/app/ask"
          className="text-ink font-medium hover:underline underline-offset-2"
        >
          Ask Decision Doctor →
        </Link>
      </nav>

      {/* V1 fallback — structured decisions */}
      <p className="text-[12px] text-mute">
        Need capacity, pricing, or hiring math?{" "}
        <Link
          href="/app/history/new"
          className="font-medium text-ink hover:underline underline-offset-2"
        >
          Use the structured decisions →
        </Link>
      </p>

      {/* Recent activity tile — best-effort SSR, hides if empty or on error */}
      {recent.length > 0 && (
        <section aria-label="Recent activity">
          <Card flat className="w-full">
            <h2 className="text-[12px] font-semibold uppercase tracking-wider text-mute mb-3">
              Recent decisions
            </h2>
            <ul className="divide-y divide-line">
              {recent.map((d) => (
                <li key={d.id}>
                  <Link
                    href={`/app/history/${d.id}`}
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
        </section>
      )}
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
