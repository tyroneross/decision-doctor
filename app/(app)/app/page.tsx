// PRD §F-01 — Decision template selector. T-01 = ≤3 taps to intake form.

import Link from "next/link";
import { listTemplates } from "@/lib/engine/templates";

export default function TemplateSelectorPage() {
  const templates = listTemplates();
  return (
    <main className="px-4 sm:px-6 py-6 max-w-3xl">
      <h1 className="text-2xl font-semibold">What are you deciding?</h1>
      <p className="mt-2 text-ink-subtle text-sm">
        Pick a template. ~5 minutes of structured input. One recommendation with
        the math made visible.
      </p>
      <ul className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-3">
        {templates.map((t) => (
          <li key={t.id}>
            <Link
              href={`/app/decisions/new/${t.id}`}
              className="block rounded-2xl border border-slate-200 bg-canvas-raised p-5 hover:border-ink min-h-[120px]"
            >
              <div className="text-base font-semibold">{t.title}</div>
              <div className="mt-1 text-sm text-ink-subtle">{t.oneLine}</div>
              <div className="mt-3 text-xs text-ink-muted">~{t.estimatedMinutes} min · {t.fields.length} questions</div>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
