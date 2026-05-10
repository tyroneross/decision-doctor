import { redirect } from "next/navigation";
import { headers, cookies } from "next/headers";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { decisions } from "@/lib/db/schema";
import { runWithActor, withActor } from "@/lib/db/actor";
import { getSessionActor } from "@/lib/auth-session";
import { totalHoursSaved, formatHrs } from "@/lib/decision-display";
import { SignOutButton } from "./_components/sign-out";
import { ServiceWorkerRegister } from "./_components/sw-register";

// Auth gate for everything under /app/*. SSR redirect — no client flash.
// Guest mode: dd_guest cookie bypasses auth for UI preview (demo data shown).
//
// V2 sunrise nav: Logo (sun mark on coral gradient) → New decision (primary
// coral CTA, leftmost so it dominates) → History (ghost) → Account avatar.
// Per user feedback: "New decision" is the dominant action; "Chat" was
// removed from nav because chat IS the new-decision flow now.
export default async function AppLayout({ 
  children,
}: { 
  children: React.ReactNode;
}) {
  const cookieStore = await cookies();
  const isGuest = cookieStore.get("dd_guest")?.value === "true";
  
  let session = null;
  let email = "guest@demo.local";
  let initials = "G";
  
  if (!isGuest) {
    const hdrs = await headers();
    session = await auth.api.getSession({ headers: hdrs });
    if (!session?.user) redirect("/sign-in");
    email = session.user.email ?? "";
    initials = email
      .split("@")[0]!
      .split(/[._-]/)
      .map((p) => p[0]?.toUpperCase() ?? "")
      .join("")
      .slice(0, 2) || "?";
  }

  // Compute the cumulative time-back metric for the nav ledger chip.
  // Best-effort: failure here must NOT block layout render (auth gate
  // is the load-bearing piece). Wrap in try/catch to degrade silently.
  let totalHrs = 0;
  try {
    const actor = await getSessionActor();
    if (actor) {
      const rows = await runWithActor(
        { userId: actor.userId, tenantId: actor.tenantId },
        async () =>
          withActor(async (tx) =>
            tx
              .select({ workloadReducers: decisions.workloadReducers })
              .from(decisions)
              .limit(50),
          ),
      );
      totalHrs = rows.reduce<number>(
        (sum, r) => sum + totalHoursSaved(r.workloadReducers),
        0,
      );
    }
  } catch {
    // Silent degrade. Nav still renders; chip just hides.
  }

  return (
    <div className="min-h-screen flex flex-col bg-cream">
      <header className="no-print border-b border-rule bg-cream-2/60 backdrop-blur">
        <nav
          aria-label="Primary"
          className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-3 sm:max-w-4xl"
        >
          {/* Brand mark + ledger chip */}
          <div className="flex items-center gap-2 sm:gap-3">
            <Link
              href="/app/decisions"
              className="ease-soft inline-flex items-center gap-2.5 text-[16px] font-semibold text-ink-900 sm:text-[17px]"
            >
              <span
                aria-hidden
                className="grad-coral flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-white shadow-coral-press"
              >
                <svg
                  viewBox="0 0 24 24"
                  className="h-5 w-5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                >
                  <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
                </svg>
              </span>
              <span className="hidden sm:inline">Decision Doctor</span>
            </Link>
            {/* Time-back chip — only shows when there's something to celebrate */}
            {totalHrs > 0 && (
              <Link
                href="/app/decisions"
                title="Cumulative time saved across all your decisions"
                className="ease-soft hidden h-8 items-center gap-1.5 rounded-full bg-cat-cap-bg px-3 text-[12.5px] font-semibold text-cat-cap-deep hover:shadow-sm sm:inline-flex"
              >
                <span aria-hidden>🕐</span>
                {formatHrs(totalHrs)}/wk back
              </Link>
            )}
          </div>

          <div className="flex items-center gap-1.5 text-sm sm:gap-2">
            {/* PRIMARY CTA — leftmost in the action cluster, dominant weight */}
            <Link
              href="/app/chat"
              className="ease-soft grad-coral inline-flex min-h-11 items-center gap-1.5 rounded-full px-4 text-[14px] font-medium text-white shadow-coral-press hover:-translate-y-0.5 hover:shadow-coral-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-coral focus-visible:ring-offset-2 active:translate-y-0 active:scale-[0.98] sm:px-5 sm:text-[15px]"
            >
              <svg
                viewBox="0 0 24 24"
                className="h-4 w-4"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                aria-hidden
              >
                <path d="M12 5v14M5 12h14" />
              </svg>
              <span>New decision</span>
            </Link>

            {/* History — ghost */}
            <Link
              href="/app/decisions"
              className="ease-soft inline-flex min-h-11 items-center gap-1.5 rounded-full px-3 text-[14px] text-ink-700 hover:bg-cream-2 hover:text-ink-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-coral focus-visible:ring-offset-2 sm:text-[15px]"
            >
              <svg
                viewBox="0 0 24 24"
                className="h-4 w-4"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                aria-hidden
              >
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
              <span className="hidden sm:inline">History</span>
            </Link>

            {/* Account avatar — initials on coral gradient */}
            <div className="flex items-center gap-1.5">
              <span
                aria-hidden
                title={email}
                className="grad-coral hidden h-10 w-10 items-center justify-center rounded-full text-[13px] font-semibold text-white sm:flex"
              >
                {initials}
              </span>
              <SignOutButton />
            </div>
          </div>
        </nav>
      </header>
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6 sm:max-w-4xl sm:py-8">
        {children}
      </main>
      <ServiceWorkerRegister />
    </div>
  );
}
