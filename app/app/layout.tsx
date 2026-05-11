import { redirect } from "next/navigation";
import { headers } from "next/headers";
import Link from "next/link";
import { Suspense } from "react";
import { auth } from "@/lib/auth";
import { decisions } from "@/lib/db/schema";
import { runWithActor, withActor } from "@/lib/db/actor";
import { getSessionActor } from "@/lib/auth-session";
import { totalHoursSaved } from "@/lib/decision-display";
import { ServiceWorkerRegister } from "./_components/sw-register";
import { MobileBottomNav } from "./_components/MobileBottomNav";
import { DesktopSidebar } from "./_components/DesktopSidebar";
import { SkillPanel, type SkillSummary } from "./_components/SkillPanel";
import { CommandPalette } from "@/components/ui/CommandPalette";
import { desc } from "drizzle-orm";

// Auth gate for everything under /app/*. SSR redirect — no client flash.
//
// UI Guidelines v0.1 shell (split by viewport):
//
//   Mobile (< lg): brand-only top header + bottom 5-tab nav (Search ·
//   Decisions · Skills · Audit · Account). Ledger chip removed from
//   header — it now lives inside /app/decisions hero (D2).
//
//   Desktop (≥ lg): F3 left sidebar (210px) — brand + ledger summary +
//   WORKSPACE section + OPEN CASE section + user footer. C10 will graft
//   the right 360px skill panel onto this same grid.
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) redirect("/sign-in");

  const email = session.user.email ?? "";
  const initials =
    email
      .split("@")[0]!
      .split(/[._-]/)
      .map((p) => p[0]?.toUpperCase() ?? "")
      .join("")
      .slice(0, 2) || "?";

  // Best-effort sidebar + skill-panel data. Failure here must NOT block
  // layout render (auth gate above is the load-bearing piece).
  let totalHrs = 0;
  let skillCount = 0;
  let recent: { id: string; title: string }[] = [];
  let skills: SkillSummary[] = [];
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
                workloadReducers: decisions.workloadReducers,
              })
              .from(decisions)
              .orderBy(desc(decisions.createdAt))
              .limit(50)
          )
      );
      totalHrs = Math.round(
        rows.reduce<number>(
          (sum, r) => sum + totalHoursSaved(r.workloadReducers),
          0
        )
      );
      skillCount = rows.filter(
        (r) => totalHoursSaved(r.workloadReducers) > 0
      ).length;
      recent = rows.slice(0, 5).map((r) => ({
        id: r.id,
        title: r.title ?? "(untitled decision)",
      }));
      // Project bounded skill summaries for the desktop F3 right rail.
      // We cap at ~25 across the recent 50 decisions to keep the prop
      // payload small and to avoid bloating the layout's HTML size.
      const projected: SkillSummary[] = [];
      for (const r of rows) {
        const reducers = Array.isArray(r.workloadReducers)
          ? (r.workloadReducers as Array<Record<string, unknown>>)
          : [];
        for (let i = 0; i < reducers.length; i++) {
          const red = reducers[i] ?? {};
          const title =
            typeof red.title === "string" && red.title.trim()
              ? red.title.trim()
              : `Skill ${i + 1}`;
          const description =
            typeof red.description === "string" ? red.description : "";
          const hrs =
            typeof red.estTimeSavingHrsPerWeek === "number"
              ? red.estTimeSavingHrsPerWeek
              : 0;
          projected.push({
            decisionId: r.id,
            decisionTitle: r.title ?? "(untitled decision)",
            index: i,
            title,
            description,
            estTimeSavingHrsPerWeek: hrs,
          });
          if (projected.length >= 25) break;
        }
        if (projected.length >= 25) break;
      }
      skills = projected;
    }
  } catch {
    // Silent degrade. Sidebar still renders; numbers just hide.
  }

  return (
    <div className="min-h-screen bg-bg text-text lg:flex">
      <DesktopSidebar
        email={email}
        initials={initials}
        totalHrs={totalHrs}
        skillCount={skillCount}
        recentDecisions={recent}
        openCase={null}
      />

      {/* Mobile-only top brand header */}
      <header className="lg:hidden no-print border-b border-line bg-paper sticky top-0 z-30">
        <div className="px-4 h-12 flex items-center">
          <Link
            href="/app"
            className="text-[16px] font-bold text-ink leading-none"
          >
            decision doctor
          </Link>
        </div>
      </header>

      {/* Main column. Padding-bottom on mobile reserves space for the
          fixed 52px bottom nav. Desktop expands to fill the grid cell. */}
      <main className="flex-1 min-w-0 pb-[60px] lg:pb-0">{children}</main>

      {/* Desktop F3 right rail (360px). SSR-rendered with bounded skill
          summaries; client reads ?skill=<decisionId>:<index> to pick the
          active one. Hidden on mobile (< lg). Suspense boundary required
          because SkillPanel uses useSearchParams (Next.js 16 contract). */}
      <Suspense fallback={null}>
        <SkillPanel skills={skills} />
      </Suspense>

      <MobileBottomNav />
      <ServiceWorkerRegister />
      <CommandPalette />
    </div>
  );
}
