// GET /api/skills/:id/download — streamed ZIP of all asset_files under the skill.

import "server-only";
import { type NextRequest } from "next/server";
import { runWithActor } from "@/lib/db/actor";
import { getSkillById } from "@/lib/plugin-lib";
import { buildZip } from "@/lib/plugin-lib/zip";
import {
  UUID_RE,
  badRequest,
  gateRateLimit,
  notFound,
  requireActor,
  writeAudit,
} from "@/lib/plugin-lib/route-helpers";

export const runtime = "nodejs";

interface Ctx {
  params: Promise<{ id: string }>;
}

function sanitizeSlug(slug: string): string {
  return slug.replace(/[^A-Za-z0-9._-]+/g, "_");
}

export async function GET(_req: NextRequest, ctx: Ctx) {
  const actor = await requireActor();
  if (actor instanceof Response) return actor;
  const rl = await gateRateLimit(actor.userId);
  if (rl) return rl;
  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return badRequest({ id: "invalid_uuid" });

  const detail = await runWithActor(
    { userId: actor.userId, tenantId: actor.tenantId },
    () => getSkillById(id, actor.userId),
  );
  if (!detail) return notFound();

  const slug = sanitizeSlug(detail.slug);
  const entries = [
    {
      path: `${slug}/manifest.json`,
      content: JSON.stringify(
        {
          slug: detail.slug,
          title: detail.title,
          description: detail.description,
          version: detail.version,
          scope: detail.scope,
          source_url: detail.sourceUrl ?? null,
          forked_from_id: detail.forkedFromId ?? null,
          forked_at: detail.forkedAt ?? null,
          upstream_version: detail.upstreamVersion ?? null,
          metadata: detail.metadata,
          plugin_ids: detail.pluginIds,
        },
        null,
        2,
      ),
    },
    ...detail.files.map((f) => ({
      path: `${slug}/${f.path}`,
      content: f.content,
    })),
  ];

  const buf = buildZip(entries);
  writeAudit(actor, "skill.download", id, {
    file_count: entries.length,
    bytes: buf.length,
  });

  return new Response(new Uint8Array(buf), {
    status: 200,
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${slug}.zip"`,
      "Content-Length": String(buf.length),
      "Cache-Control": "no-store",
    },
  });
}
