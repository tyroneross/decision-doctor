// GET /api/plugins/:id/download — streamed ZIP of all asset_files under the plugin
//                                  plus a manifest.json describing the bundle.

import "server-only";
import { type NextRequest } from "next/server";
import { runWithActor } from "@/lib/db/actor";
import { getPluginById, getSkillById } from "@/lib/plugin-lib";
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
    () => getPluginById(id, actor.userId),
  );
  if (!detail) return notFound();

  // Hydrate attached skills (each as its own folder under skills/<skillSlug>/)
  const attachedSkills = await runWithActor(
    { userId: actor.userId, tenantId: actor.tenantId },
    async () => {
      const out = [];
      for (const skillId of detail.skillIds) {
        const s = await getSkillById(skillId, actor.userId);
        if (s) out.push(s);
      }
      return out;
    },
  );

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
          skills: attachedSkills.map((s) => ({
            id: s.id,
            slug: s.slug,
            title: s.title,
            version: s.version,
          })),
        },
        null,
        2,
      ),
    },
    ...detail.files.map((f) => ({
      path: `${slug}/${f.path}`,
      content: f.content,
    })),
    ...attachedSkills.flatMap((s) => {
      const skillSlug = sanitizeSlug(s.slug);
      return s.files.map((f) => ({
        path: `${slug}/skills/${skillSlug}/${f.path}`,
        content: f.content,
      }));
    }),
  ];

  const buf = buildZip(entries);
  writeAudit(actor, "plugin.download", id, {
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
