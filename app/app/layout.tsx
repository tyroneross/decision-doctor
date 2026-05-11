import { redirect } from "next/navigation";
import { headers } from "next/headers";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { decisions } from "@/lib/db/schema";
import { runWithActor, withActor } from "@/lib/db/actor";
import { getSessionActor } from "@/lib/auth-session";
import { totalHoursSaved } from "@/lib/decision-display";
import { ServiceWorkerRegister } from "./_components/sw-register";
import { MobileBottomNav } from "./_components/MobileBottomNav";
import { DesktopSidebar } from "./_components/DesktopSidebar";
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

  // Best-effort sidebar data. Failure here must NOT block layout render
  // (auth gate above is the load-bearing piece).
  let totalHrs = 0;
  let skillCount = 0;
  let recent: { id: string; title: string }[] = [];
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

      <MobileBottomNav />
      <ServiceWorkerRegister />
    </div>
  );
}
