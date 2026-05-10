import Link from "next/link";
import { listTemplates } from "@/lib/engine/templates";
import { categoryFor } from "@/lib/decision-display";

// F-01 — template selector. Sunrise treatment to match chat / list / detail.
// Reachable from the EmptyState secondary link AND from the chat-hero
// "skip the conversation" affordance.
export default function NewDecisionPage() {
  const templates = listTemplates();
  return (
    <section className="space-y-6">
      <header className="space-y-1">
        <p className="grad-coral-text text-[12px] font-semibold uppercase tracking-[.14em]">
          Skip the conversation
        </p>
        <h1 className="text-[26px] font-semibold leading-tight tracking-tight sm:text-[30px]">
          Pick a decision template
        </h1>
        <p className="max-w-xl text-[14.5px] leading-snug text-ink-700">
          For when you already know which kind of decision you're making. The
          chat flow is faster for most folks — but if you've done this before,
          here's the direct path.
        </p>
      </header>

      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-1">
        {templates.map((t) => {
          const cat = categoryFor(t.id);
          return (
            <li key={t.id}>
              <Link
                href={`/app/decisions/new/${t.id}`}
                className="ease-soft lift relative block overflow-hidden rounded-2xl border border-rule bg-white p-5 hover:shadow-lift focus:outline-none focus-visible:ring-2 focus-visible:ring-coral focus-visible:ring-offset-2"
              >
                <span
                  aria-hidden
                  className={`absolute inset-y-0 left-0 w-1.5 ${cat.stripe}`}
                />
                <div className="flex items-start justify-between gap-4 pl-3">
                  <div>
                    <span
                      className={`inline-flex h-6 items-center gap-1 rounded-full px-2 text-[11px] font-semibold uppercase tracking-wider ${cat.bg} ${cat.fg}`}
                    >
                      <span
                        aria-hidden
                        className={`h-1.5 w-1.5 rounded-full ${cat.stripe}`}
                      />
                      {cat.label}
                    </span>
                    <h2 className="mt-2 text-[17px] font-semibold leading-snug">
                      {t.label}
                    </h2>
                    <p className="mt-1 text-[13.5px] leading-relaxed text-ink-500">
                      {t.description}
                    </p>
                  </div>
                  <span
                    aria-hidden
                    className="grad-coral inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-[12.5px] font-semibold text-white shadow-sm"
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

      <div className="rounded-2xl border border-rule bg-cream-2/60 p-4">
        <p className="text-[13px] leading-relaxed text-ink-700">
          Or{" "}
          <Link
            href="/app/chat"
            className="font-semibold text-coral underline-offset-2 hover:underline"
          >
            describe it conversationally
          </Link>{" "}
          — usually faster, and you don't have to know which template fits.
        </p>
      </div>

      <p className="text-[12px] text-ink-500">
        Privacy: we never store names of clients or patients. Field values are
        short and Zod-validated server-side.
      </p>
    </section>
  );
}
