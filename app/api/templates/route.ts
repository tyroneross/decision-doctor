// PRD §F-01 — public templates listing. Cached by the PWA service worker.
// No auth needed; templates are static.

import { listTemplates } from "@/lib/engine/templates";

export const runtime = "nodejs";

export async function GET() {
  const templates = listTemplates().map((t) => ({
    id: t.id,
    title: t.title,
    oneLine: t.oneLine,
    intentVerb: t.intentVerb,
    estimatedMinutes: t.estimatedMinutes,
    fieldCount: t.fields.length,
  }));
  return Response.json(
    { templates },
    {
      headers: {
        "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=86400",
      },
    },
  );
}
