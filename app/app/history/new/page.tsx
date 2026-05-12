import Link from "next/link";
import { listTemplates } from "@/lib/engine/templates";
import { categoryFor } from "@/lib/decision-display";
import { Card } from "@/components/ui/Card";
import { Pill } from "@/components/ui/Pill";
import { NoPhiNotice } from "@/components/ui/NoPhiNotice";

// F-01 — template selector. UI Guidelines v0.1 ink-only treatment.
// Reachable from EmptyState secondary link and the chat-hero "skip the
// conversation" affordance. No category color stripe; category label
// renders as a neutral mute pill.
export default function NewDecisionPage() {
  const templates = listTemplates();
  return (
    <section className="space-y-6 px-5 py-8 lg:px-8 lg:py-10 max-w-2xl mx-auto">
      <header className="space-y-1">
        <p className="text-[12px] font-semibold uppercase tracking-[.14em] text-mute">
          Skip the conversation
        </p>
        <h1 className="text-h1 sm:text-h1-lg tracking-tight text-ink">
          Pick a decision template
        </h1>
        <p className="max-w-xl text-[14.5px] leading-snug text-mute">
          For when you already know which kind of decision you're making. The
          chat flow is faster for most folks, but if you've done this before,
          here's the direct path.
        </p>
      </header>

      <NoPhiNotice />

      <ul className="grid grid-cols-1 gap-3">
        {templates.map((t) => {
          const cat = categoryFor(t.id);
          return (
            <li key={t.id}>
              <Link
                href={`/app/history/new/${t.id}`}
                className="block rounded-xl border border-line bg-paper p-5 shadow-card transition-colors hover:border-ink focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ink/20"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <Pill tone="mute">{cat.label}</Pill>
                    <h2 className="mt-2 text-[17px] font-semibold leading-snug text-ink">
                      {t.label}
                    </h2>
                    <p className="mt-1 text-[13.5px] leading-relaxed text-mute">
                      {t.description}
                    </p>
                  </div>
                  <span
                    aria-hidden
                    className="inline-flex h-9 shrink-0 items-center gap-1 rounded-[10px] border border-ink bg-ink px-3 text-[12.5px] font-semibold text-paper shadow-card"
                  >
                    Start
                    <svg
                      viewBox="0 0 24 24"
                      className="h-3.5 w-3.5"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                    >
                      <polyline points="9 18 15 12 9 6" />
                    </svg>
                  </span>
                </div>
              </Link>
            </li>
          );
        })}
      </ul>

      <Card flat>
        <p className="text-[13px] leading-relaxed text-text">
          Or{" "}
          <Link
            href="/app/chat"
            className="font-semibold text-ink underline-offset-2 hover:underline"
          >
            describe it conversationally
          </Link>{" "}
          (usually faster, and you don't have to know which template fits).
        </p>
      </Card>

      <p className="text-[12px] text-mute">
        Privacy: we never store names of clients or patients. Field values are
        short and Zod-validated server-side.
      </p>
    </section>
  );
}
