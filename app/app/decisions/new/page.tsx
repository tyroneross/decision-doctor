import Link from "next/link";
import { listTemplates } from "@/lib/engine/templates";

// F-01 — template selector.
export default function NewDecisionPage() {
  const templates = listTemplates();
  return (
    <section className="space-y-6">
      <header>
        <h1 className="text-xl font-semibold">Pick a decision template</h1>
        <p className="text-sm text-ink-500">
          The engine ranks options against criteria you can see and adjust.
          Three templates ship today.
        </p>
      </header>

      <ul className="grid gap-3 sm:grid-cols-1">
        {templates.map((t) => (
          <li key={t.id}>
            <Link
              href={`/app/decisions/new/${t.id}`}
              className="block rounded-lg border border-ink-100 p-5 hover:border-ink-300 hover:bg-ink-100/40"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-base font-medium text-ink-900">
                    {t.label}
                  </h2>
                  <p className="mt-1 text-sm text-ink-500">{t.description}</p>
                </div>
                <span aria-hidden className="text-ink-300">
                  →
                </span>
              </div>
            </Link>
          </li>
        ))}
      </ul>

      <p className="text-xs text-ink-500">
        First-run hint: the form rejects free-form long text. Keep field values
        short. We never store names of clients or patients.
      </p>
    </section>
  );
}
