// PRD §5 D-01 — list available decision templates.
// Public route; no auth required (templates are static metadata).
// CacheFirst-friendly per next.config CSP allowlist.

import "server-only";
import { listTemplates, loadTemplate } from "@/lib/engine/templates";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (id) {
    try {
      const t = loadTemplate(id as Parameters<typeof loadTemplate>[0]);
      // Return the public-facing slice (don't expose candidate scores —
      // we want users to see them in the methodTrace post-decision, not
      // pre-decision where they could game the form).
      return Response.json({
        id: t.id,
        label: t.label,
        description: t.description,
        fields: t.fields,
      });
    } catch {
      return Response.json({ error: "Unknown template" }, { status: 404 });
    }
  }
  return Response.json({ templates: listTemplates() });
}
