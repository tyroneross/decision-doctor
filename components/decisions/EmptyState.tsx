import Link from "next/link";

// Empty state — friendly hero card, single primary CTA into chat.
// Replaces the previous "Pick a template" generic empty state with
// language that ladders directly into the primary product framing
// (Find where AI saves you time).
export function EmptyState() {
  return (
    <section className="space-y-6">
      <article className="dd-fade-up relative overflow-hidden rounded-3xl border border-rule bg-white p-7 shadow-soft sm:p-9">
        <div
          aria-hidden
          className="grad-coral absolute -right-12 -top-12 h-48 w-48 rounded-full opacity-20 blur-2xl"
        />
        <div
          aria-hidden
          className="grad-coral absolute -bottom-16 -left-10 h-40 w-40 rounded-full opacity-15 blur-2xl"
        />
        <div className="relative">
          <p className="grad-coral-text text-[12px] font-semibold uppercase tracking-[.14em]">
            Your decisions · empty for now
          </p>
          <h1 className="mt-2 text-[28px] font-semibold leading-[1.1] tracking-tight sm:text-[34px]">
            No decisions yet — tell me where your hours go.
          </h1>
          <p className="mt-3 max-w-xl text-[15px] leading-snug text-ink-700 sm:text-[16px]">
            Five-minute conversation. You get a ranked list of capacity drains,
            an AI-feasibility score for each, and a paste-ready skill or
            playbook for the top one. Time comes back this week, not "someday."
          </p>
          <div className="mt-5 flex flex-wrap gap-2.5">
            <Link
              href="/app/chat"
              className="ease-soft grad-coral inline-flex h-11 items-center gap-1.5 rounded-full px-5 text-[14px] font-medium text-white shadow-coral-press hover:-translate-y-0.5 hover:shadow-coral-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-coral focus-visible:ring-offset-2"
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
              Start a decision
            </Link>
            <Link
              href="/app/decisions/new"
              className="ease-soft inline-flex h-11 items-center rounded-full border border-rule bg-white px-4 text-[14px] font-medium text-ink-700 hover:border-coral hover:text-coral"
            >
              Or pick a template
            </Link>
          </div>
        </div>
      </article>

      {/* Three-card preview of what gets shipped */}
      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <li className="rounded-2xl border border-rule bg-white p-5">
          <span className="text-[20px]" aria-hidden>
            🕐
          </span>
          <h3 className="mt-2 text-[14px] font-semibold">A time-back number</h3>
          <p className="mt-1 text-[12.5px] leading-relaxed text-ink-500">
            Estimated weekly hours we expect to put back on your calendar.
          </p>
        </li>
        <li className="rounded-2xl border border-rule bg-white p-5">
          <span className="text-[20px]" aria-hidden>
            🛠️
          </span>
          <h3 className="mt-2 text-[14px] font-semibold">A starter skill</h3>
          <p className="mt-1 text-[12.5px] leading-relaxed text-ink-500">
            One paste-ready prompt or playbook. ~1 minute to ship.
          </p>
        </li>
        <li className="rounded-2xl border border-rule bg-white p-5">
          <span className="text-[20px]" aria-hidden>
            🛡️
          </span>
          <h3 className="mt-2 text-[14px] font-semibold">A safety path</h3>
          <p className="mt-1 text-[12.5px] leading-relaxed text-ink-500">
            What to do if the recommendation stops working. No regret.
          </p>
        </li>
      </ul>
    </section>
  );
}
