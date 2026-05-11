import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { Pill } from "@/components/ui/Pill";

// Empty state — ink-only hero card, single primary CTA to F1 home (/app).
// Per UI Guidelines v0.1: terracotta-on-bone, no gradient, no coral shadow,
// no color-as-decoration. Visual containment via Card primitive (single
// border, single shadow). Color carries meaning only on the hours-saved
// pill (`ok` tone) reserved for capacity drains.
//
// Note: primary CTA renders as a styled <Link>, not <Button>, because
// Next/Link wants its child to be the anchor itself. The class string
// mirrors Button "primary" variant (bg-ink text-paper border-ink) for
// visual parity with the rest of the system.
export function EmptyState() {
  return (
    <section className="space-y-6">
      <Card flush className="dd-fade-up p-7 sm:p-9">
        <Pill tone="mute" className="uppercase tracking-[.14em]">
          Your decisions · empty for now
        </Pill>
        <h1 className="mt-3 text-[28px] font-semibold leading-[1.1] tracking-tight text-ink sm:text-[34px]">
          No decisions yet — tell me where your hours go.
        </h1>
        <p className="mt-3 max-w-xl text-[15px] leading-snug text-mute sm:text-[16px]">
          Five-minute conversation. You get a ranked list of capacity drains,
          an AI-feasibility score for each, and a paste-ready skill or
          playbook for the top one. Time comes back this week, not "someday."
        </p>
        <div className="mt-5">
          {/* Single dominant CTA — Hick's law / NN/g first-run pattern.
              Target F1 home (search-first entry), NOT chat. */}
          <Link
            href="/app"
            className={
              "inline-flex h-12 items-center gap-2 rounded-[10px] " +
              "bg-ink px-6 text-[15px] font-semibold text-paper " +
              "border border-ink shadow-card transition-colors " +
              "hover:bg-ink/90 focus-visible:outline-none " +
              "focus-visible:ring-[3px] focus-visible:ring-ink/20"
            }
          >
            <svg
              viewBox="0 0 24 24"
              className="h-5 w-5"
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
          <p className="mt-2.5 text-[12.5px] text-mute">
            Already know the shape of it?{" "}
            <Link
              href="/app/decisions/new"
              className="font-semibold text-ink underline-offset-2 hover:underline"
            >
              Pick a template instead →
            </Link>
          </p>
        </div>
      </Card>

      {/* Three-card preview of what gets shipped. Card primitive flat
          variant — no shadow inside the parent hero context. */}
      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <li>
          <Card flat className="p-5">
            <span className="text-[20px]" aria-hidden>
              🕐
            </span>
            <h3 className="mt-2 text-[14px] font-semibold text-ink">
              A time-back number
            </h3>
            <p className="mt-1 text-[12.5px] leading-relaxed text-mute">
              Estimated weekly hours we expect to put back on your calendar.
            </p>
          </Card>
        </li>
        <li>
          <Card flat className="p-5">
            <span className="text-[20px]" aria-hidden>
              🛠️
            </span>
            <h3 className="mt-2 text-[14px] font-semibold text-ink">
              A starter skill
            </h3>
            <p className="mt-1 text-[12.5px] leading-relaxed text-mute">
              One paste-ready prompt or playbook. ~1 minute to ship.
            </p>
          </Card>
        </li>
        <li>
          <Card flat className="p-5">
            <span className="text-[20px]" aria-hidden>
              🛡️
            </span>
            <h3 className="mt-2 text-[14px] font-semibold text-ink">
              A safety path
            </h3>
            <p className="mt-1 text-[12.5px] leading-relaxed text-mute">
              What to do if the recommendation stops working. No regret.
            </p>
          </Card>
        </li>
      </ul>
    </section>
  );
}
