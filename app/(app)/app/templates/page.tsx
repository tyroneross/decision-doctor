// /app/templates — structured-form fast-path for repeat users who know the template.
// The chat at /app/chat is the primary entry; this page is reachable from chat
// when the user picks a template chip, or directly via this URL for power users.

import Link from "next/link";
import { listTemplates } from "@/lib/engine/templates";

export const metadata = { title: "Templates · Decision Doctor" };

export default function TemplateSelectorPage() {
  const templates = listTemplates();
  return (
    <main className="px-4 sm:px-6 py-6 max-w-3xl mx-auto">
      <Link href="/app/chat" className="text-sm text-ink-muted underline">
        ← Back to chat
      </Link>
      <h1 className="mt-4 text-2xl font-semibold">Pick a template</h1>
      <p className="mt-2 text-ink-subtle text-sm">
        Skip the chat and answer 7 short questions. ~5 minutes; gives you the
        same recommendation page.
      </p>
      <ul className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-3">
        {templates.map((t) => (
          <li key={t.id}>
            <Link
              href={`/app/decisions/new/${t.id}`}
              className="block rounded-2xl border border-border bg-canvas-raised p-5 hover:border-ink min-h-[120px]"
            >
              <div className="text-base font-semibold">{t.title}</div>
              <div className="mt-1 text-sm text-ink-subtle">{t.oneLine}</div>
              <div className="mt-3 text-xs text-ink-muted">
                ~{t.estimatedMinutes} min · {t.fields.length} questions
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
