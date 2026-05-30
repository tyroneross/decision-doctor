import { redirect } from "next/navigation";
import { headers } from "next/headers";
import Image from "next/image";
import Link from "next/link";
import { Suspense } from "react";
import { auth } from "@/lib/auth";
import { isGuestRequest, GUEST_USER } from "@/lib/auth-guest";
import { decisions } from "@/lib/db/schema";
import { runWithActor, withActor } from "@/lib/db/actor";
import { getSessionActor } from "@/lib/auth-session";
import { totalHoursSaved } from "@/lib/decision-display";
import { ServiceWorkerRegister } from "./_components/sw-register";
import { MobileBottomNav } from "./_components/MobileBottomNav";
import { DesktopSidebar } from "./_components/DesktopSidebar";
import { SkillPanel, type SkillSummary } from "./_components/SkillPanel";
import { BackToParent } from "./_components/BackToParent";
import { PersistentTopBar } from "./_components/PersistentTopBar";
import { CommandPalette } from "@/components/ui/CommandPalette";
import { GuestBanner } from "@/components/GuestBanner";
import { desc } from "drizzle-orm";

/**
 * Pick a human-readable title for a recent-decision row, in order of preference:
 *   1. r.title (set by the engine after Stage 1 — the happy path)
 *   2. recommendation.option (the recommended task name)
 *   3. first non-empty string field in intake.fields (the user's input)
 *   4. literal fallback "Decision draft"
 *
 * All branches truncate to 60 chars to keep the sidebar tidy. Defensive on
 * jsonb shape — fields can be null / arrays / nested objects, so we narrow
 * before dereferencing.
 */
function smartDecisionTitle(
  title: string | null,
  recommendation: unknown,
  intake: unknown,
): string {
  const trim = (s: string) =>
    s.length > 60 ? s.slice(0, 57).trimEnd() + "…" : s;

  if (typeof title === "string" && title.trim().length > 0) {
    return trim(title.trim());
  }

  if (recommendation && typeof recommendation === "object") {
    const opt = (recommendation as Record<string, unknown>).option;
    if (typeof opt === "string" && opt.trim().length > 0) {
      return trim(opt.trim());
    }
  }

  if (intake && typeof intake === "object") {
    const fields = (intake as Record<string, unknown>).fields;
    if (fields && typeof fields === "object") {
      for (const v of Object.values(fields as Record<string, unknown>)) {
        if (typeof v === "string" && v.trim().length > 0) {
          return trim(v.trim());
        }
      }
    }
  }

  return "Decision draft";
}

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
  const guest = !session?.user && (await isGuestRequest());
  if (!session?.user && !guest) redirect("/sign-in");

  const email = session?.user?.email ?? GUEST_USER.email;
  const initials = guest
    ? GUEST_USER.initials
    : email
        .split("@")[0]!
        .split(/[._-]/)
        .map((p) => p[0]?.toUpperCase() ?? "")
        .join("")
        .slice(0, 2) || "?";

  // Best-effort sidebar + skill-panel data. Failure here must NOT block
  // layout render (auth gate above is the load-bearing piece). Skipped
  // entirely in guest mode — no DB queries, empty state.
  let totalHrs = 0;
  let skillCount = 0;
  let recent: { id: string; title: string }[] = [];
  let skills: SkillSummary[] = [];
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
                workloadReducers: decisions.workloadReducers,
                recommendation: decisions.recommendation,
                intake: decisions.intake,
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
        title: smartDecisionTitle(r.title, r.recommendation, r.intake),
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
            decisionTitle: smartDecisionTitle(r.title, r.recommendation, r.intake),
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
        guest={guest}
      />

      {/* Mobile-only top brand header */}
      <header className="lg:hidden no-print border-b border-line bg-paper sticky top-0 z-30">
        <div className="px-4 h-12 flex items-center">
          <Link
            href="/app"
            aria-label="Aida — home"
            className="inline-flex items-center"
          >
            <Image
              src="/aida-wordmark.png"
              alt="Aida"
              width={980}
              height={420}
              priority
              className="h-7 w-auto"
            />
          </Link>
        </div>
      </header>

      {/* Main column. Padding-bottom on mobile reserves space for the
          fixed 52px bottom nav. Desktop expands to fill the grid cell.
          PersistentTopBar is the workspace-wide "Ask Aida" entry — sticky
          at the top of every page except /app/chat (which owns its own
          bottom-of-thread composer). BackToParent renders a subtle
          "← <Parent>" affordance that hides itself on /app. */}
      <main className="flex-1 min-w-0 pb-[60px] lg:pb-0">
        <Suspense fallback={null}>
          <PersistentTopBar />
        </Suspense>
        <BackToParent />
        {children}
      </main>

      {/* Desktop F3 right rail (360px). SSR-rendered with bounded skill
          summaries; client reads ?skill=<decisionId>:<index> to pick the
          active one. Hidden on mobile (< lg). Suspense boundary required
          because SkillPanel uses useSearchParams (Next.js 16 contract). */}
      <Suspense fallback={null}>
        <SkillPanel skills={skills} />
      </Suspense>

      <MobileBottomNav guest={guest} />
      <ServiceWorkerRegister />
      {/* ⌘K palette hits /api/search. Backend accepts guests via
          GUEST_USER_ID + RLS-narrowed global scope — palette is available
          to everyone; guests get global-corpus results only. */}
      <CommandPalette />
      {guest && <GuestBanner />}
    </div>
  );
}
