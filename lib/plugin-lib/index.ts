// lib/plugin-lib/index.ts — C3: DB-backed helpers for the Plugin & Skill Library.
//
// All reads/writes flow through runWithActor + withActor so RLS applies
// transparently. Helpers stay narrow — route handlers handle auth, audit,
// rate limiting, and HTTP shape.

import "server-only";
import { and, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import {
  plugins,
  skills,
  pluginSkills,
  assetFiles,
  userDismissals,
  type Plugin,
  type Skill,
  type AssetFile,
} from "@/lib/db/schema";
import { withActor } from "@/lib/db/actor";

export type Kind = "plugin" | "skill";

export interface ListOptions {
  scope?: "all" | "global" | "mine";
  q?: string;
  includeHidden?: boolean;
  /** Only used for skills: include nested-plugin skills or filter them. */
  attached?: "all" | "nested" | "standalone";
  userId: string;
  limit?: number;
}

export interface PluginListItem extends Plugin {
  isMine: boolean;
  isDismissed: boolean;
  skillCount: number;
}

export interface SkillListItem extends Skill {
  isMine: boolean;
  isDismissed: boolean;
  pluginIds: string[];
}

// --------------- LIST ------------------------------------------------------

export async function listPlugins(
  opts: ListOptions,
): Promise<PluginListItem[]> {
  const limit = opts.limit ?? 200;
  return withActor(async (tx) => {
    const where = [];
    if (opts.scope === "global") where.push(eq(plugins.scope, "global"));
    else if (opts.scope === "mine") where.push(eq(plugins.scope, opts.userId));
    // "all" → both global + user-scoped are already RLS-visible; no extra filter.

    if (opts.q && opts.q.trim().length > 0) {
      const pattern = `%${opts.q.trim()}%`;
      const qExpr = or(
        ilike(plugins.title, pattern),
        ilike(plugins.description, pattern),
        ilike(plugins.slug, pattern),
      );
      if (qExpr) where.push(qExpr);
    }

    const baseRows = await tx
      .select()
      .from(plugins)
      .where(where.length ? and(...where) : sql`true`)
      .orderBy(desc(plugins.updatedAt))
      .limit(limit);

    if (baseRows.length === 0) return [];

    // dismissed lookup
    const dismissedIds = new Set(
      (
        await tx
          .select({ id: userDismissals.assetId })
          .from(userDismissals)
          .where(
            and(
              eq(userDismissals.userId, opts.userId),
              eq(userDismissals.assetKind, "plugin"),
              inArray(
                userDismissals.assetId,
                baseRows.map((r) => r.id),
              ),
            ),
          )
      ).map((r) => r.id),
    );

    // skill counts per plugin
    const countRows = (await tx.execute(sql`
      SELECT plugin_id, COUNT(*)::int AS c
      FROM plugin_skills
      WHERE plugin_id IN (${sql.join(
        baseRows.map((r) => sql`${r.id}::uuid`),
        sql`, `,
      )})
      GROUP BY plugin_id
    `)) as unknown as { rows: { plugin_id: string; c: number }[] };
    const skillCountByPlugin = new Map(
      countRows.rows.map((r) => [r.plugin_id, r.c]),
    );

    const hydrated: PluginListItem[] = baseRows.map((r) => ({
      ...r,
      isMine: r.scope === opts.userId,
      isDismissed: dismissedIds.has(r.id),
      skillCount: skillCountByPlugin.get(r.id) ?? 0,
    }));

    if (opts.includeHidden) return hydrated;
    return hydrated.filter((p) => !p.isDismissed);
  });
}

export async function listSkills(
  opts: ListOptions,
): Promise<SkillListItem[]> {
  const limit = opts.limit ?? 200;
  return withActor(async (tx) => {
    const where = [];
    if (opts.scope === "global") where.push(eq(skills.scope, "global"));
    else if (opts.scope === "mine") where.push(eq(skills.scope, opts.userId));

    if (opts.q && opts.q.trim().length > 0) {
      const pattern = `%${opts.q.trim()}%`;
      const qExpr = or(
        ilike(skills.title, pattern),
        ilike(skills.description, pattern),
        ilike(skills.slug, pattern),
      );
      if (qExpr) where.push(qExpr);
    }

    const baseRows = await tx
      .select()
      .from(skills)
      .where(where.length ? and(...where) : sql`true`)
      .orderBy(desc(skills.updatedAt))
      .limit(limit);

    if (baseRows.length === 0) return [];

    const dismissedIds = new Set(
      (
        await tx
          .select({ id: userDismissals.assetId })
          .from(userDismissals)
          .where(
            and(
              eq(userDismissals.userId, opts.userId),
              eq(userDismissals.assetKind, "skill"),
              inArray(
                userDismissals.assetId,
                baseRows.map((r) => r.id),
              ),
            ),
          )
      ).map((r) => r.id),
    );

    // Parent plugin lookups via plugin_skills
    const linkRows = await tx
      .select({
        pluginId: pluginSkills.pluginId,
        skillId: pluginSkills.skillId,
      })
      .from(pluginSkills)
      .where(
        inArray(
          pluginSkills.skillId,
          baseRows.map((r) => r.id),
        ),
      );
    const pluginIdsBySkill = new Map<string, string[]>();
    for (const lr of linkRows) {
      const arr = pluginIdsBySkill.get(lr.skillId) ?? [];
      arr.push(lr.pluginId);
      pluginIdsBySkill.set(lr.skillId, arr);
    }

    let hydrated: SkillListItem[] = baseRows.map((r) => ({
      ...r,
      isMine: r.scope === opts.userId,
      isDismissed: dismissedIds.has(r.id),
      pluginIds: pluginIdsBySkill.get(r.id) ?? [],
    }));

    if (opts.attached === "nested") {
      hydrated = hydrated.filter((s) => s.pluginIds.length > 0);
    } else if (opts.attached === "standalone") {
      hydrated = hydrated.filter((s) => s.pluginIds.length === 0);
    }

    if (!opts.includeHidden) {
      hydrated = hydrated.filter((s) => !s.isDismissed);
    }

    return hydrated;
  });
}

// --------------- DETAIL ----------------------------------------------------

export interface PluginDetail extends Plugin {
  isMine: boolean;
  isDismissed: boolean;
  files: AssetFile[];
  skillIds: string[];
}

export interface SkillDetail extends Skill {
  isMine: boolean;
  isDismissed: boolean;
  files: AssetFile[];
  pluginIds: string[];
}

export async function getPluginById(
  id: string,
  userId: string,
): Promise<PluginDetail | null> {
  return withActor(async (tx) => {
    const [row] = await tx.select().from(plugins).where(eq(plugins.id, id));
    if (!row) return null;
    const files = await tx
      .select()
      .from(assetFiles)
      .where(eq(assetFiles.pluginId, id));
    const linkRows = await tx
      .select({ skillId: pluginSkills.skillId })
      .from(pluginSkills)
      .where(eq(pluginSkills.pluginId, id));
    const dismissedRow = await tx
      .select({ id: userDismissals.assetId })
      .from(userDismissals)
      .where(
        and(
          eq(userDismissals.userId, userId),
          eq(userDismissals.assetKind, "plugin"),
          eq(userDismissals.assetId, id),
        ),
      )
      .limit(1);
    return {
      ...row,
      isMine: row.scope === userId,
      isDismissed: dismissedRow.length > 0,
      files: files.sort((a, b) => a.path.localeCompare(b.path)),
      skillIds: linkRows.map((r) => r.skillId),
    };
  });
}

export async function getSkillById(
  id: string,
  userId: string,
): Promise<SkillDetail | null> {
  return withActor(async (tx) => {
    const [row] = await tx.select().from(skills).where(eq(skills.id, id));
    if (!row) return null;
    const files = await tx
      .select()
      .from(assetFiles)
      .where(eq(assetFiles.skillId, id));
    const linkRows = await tx
      .select({ pluginId: pluginSkills.pluginId })
      .from(pluginSkills)
      .where(eq(pluginSkills.skillId, id));
    const dismissedRow = await tx
      .select({ id: userDismissals.assetId })
      .from(userDismissals)
      .where(
        and(
          eq(userDismissals.userId, userId),
          eq(userDismissals.assetKind, "skill"),
          eq(userDismissals.assetId, id),
        ),
      )
      .limit(1);
    return {
      ...row,
      isMine: row.scope === userId,
      isDismissed: dismissedRow.length > 0,
      files: files.sort((a, b) => a.path.localeCompare(b.path)),
      pluginIds: linkRows.map((r) => r.pluginId),
    };
  });
}

// --------------- FORK ------------------------------------------------------

export async function forkPlugin(
  sourceId: string,
  userId: string,
): Promise<{ id: string; slug: string }> {
  return withActor(async (tx) => {
    const [source] = await tx
      .select()
      .from(plugins)
      .where(eq(plugins.id, sourceId));
    if (!source) {
      throw new Error("not_found");
    }
    // Generate a unique slug under user scope
    const baseSlug = `${source.slug}--fork`;
    let candidate = baseSlug;
    let n = 2;
    while (true) {
      const [existing] = await tx
        .select({ id: plugins.id })
        .from(plugins)
        .where(and(eq(plugins.scope, userId), eq(plugins.slug, candidate)));
      if (!existing) break;
      candidate = `${baseSlug}-${n++}`;
      if (n > 50) throw new Error("fork_slug_exhausted");
    }
    const now = new Date();
    const [forked] = await tx
      .insert(plugins)
      .values({
        scope: userId,
        ownerUserId: userId,
        slug: candidate,
        title: source.title,
        description: source.description,
        version: source.version,
        sourceUrl: source.sourceUrl,
        forkedFromId: source.id,
        forkedAt: now,
        upstreamVersion: source.version,
        metadata: source.metadata,
      })
      .returning();

    // Copy asset_files (path/content/sha256/etc.)
    const sourceFiles = await tx
      .select()
      .from(assetFiles)
      .where(eq(assetFiles.pluginId, source.id));
    if (sourceFiles.length > 0) {
      await tx.insert(assetFiles).values(
        sourceFiles.map((f) => ({
          pluginId: forked!.id,
          path: f.path,
          content: f.content,
          contentType: f.contentType,
          sha256: f.sha256,
          sizeBytes: f.sizeBytes,
          storageKind: f.storageKind,
          r2Key: f.r2Key,
        })),
      );
    }

    // Copy plugin_skills join — note: skills themselves are NOT forked. The
    // user's fork points at the same skill rows. Forking a skill is a separate
    // explicit action.
    const sourceJoins = await tx
      .select()
      .from(pluginSkills)
      .where(eq(pluginSkills.pluginId, source.id));
    if (sourceJoins.length > 0) {
      await tx.insert(pluginSkills).values(
        sourceJoins.map((j) => ({
          pluginId: forked!.id,
          skillId: j.skillId,
          position: j.position,
        })),
      );
    }

    return { id: forked!.id, slug: forked!.slug };
  });
}

export async function forkSkill(
  sourceId: string,
  userId: string,
): Promise<{ id: string; slug: string }> {
  return withActor(async (tx) => {
    const [source] = await tx
      .select()
      .from(skills)
      .where(eq(skills.id, sourceId));
    if (!source) throw new Error("not_found");
    const baseSlug = `${source.slug}--fork`;
    let candidate = baseSlug;
    let n = 2;
    while (true) {
      const [existing] = await tx
        .select({ id: skills.id })
        .from(skills)
        .where(and(eq(skills.scope, userId), eq(skills.slug, candidate)));
      if (!existing) break;
      candidate = `${baseSlug}-${n++}`;
      if (n > 50) throw new Error("fork_slug_exhausted");
    }
    const now = new Date();
    const [forked] = await tx
      .insert(skills)
      .values({
        scope: userId,
        ownerUserId: userId,
        slug: candidate,
        title: source.title,
        description: source.description,
        version: source.version,
        sourceUrl: source.sourceUrl,
        forkedFromId: source.id,
        forkedAt: now,
        upstreamVersion: source.version,
        metadata: source.metadata,
      })
      .returning();
    const sourceFiles = await tx
      .select()
      .from(assetFiles)
      .where(eq(assetFiles.skillId, source.id));
    if (sourceFiles.length > 0) {
      await tx.insert(assetFiles).values(
        sourceFiles.map((f) => ({
          skillId: forked!.id,
          path: f.path,
          content: f.content,
          contentType: f.contentType,
          sha256: f.sha256,
          sizeBytes: f.sizeBytes,
          storageKind: f.storageKind,
          r2Key: f.r2Key,
        })),
      );
    }
    return { id: forked!.id, slug: forked!.slug };
  });
}

// --------------- PATCH (user-scoped only) ----------------------------------

export type PatchableFields = {
  title?: string;
  description?: string;
  version?: string;
  metadata?: Record<string, unknown>;
};

export async function patchPlugin(
  id: string,
  userId: string,
  patch: PatchableFields,
): Promise<{ ok: true } | { ok: false; reason: "not_found" | "forbidden" }> {
  return withActor(async (tx) => {
    const [row] = await tx.select().from(plugins).where(eq(plugins.id, id));
    if (!row) return { ok: false, reason: "not_found" };
    if (row.scope !== userId) return { ok: false, reason: "forbidden" };
    await tx
      .update(plugins)
      .set({
        ...(patch.title !== undefined ? { title: patch.title } : {}),
        ...(patch.description !== undefined ? { description: patch.description } : {}),
        ...(patch.version !== undefined ? { version: patch.version } : {}),
        ...(patch.metadata !== undefined ? { metadata: patch.metadata } : {}),
        updatedAt: new Date(),
      })
      .where(eq(plugins.id, id));
    return { ok: true };
  });
}

export async function patchSkill(
  id: string,
  userId: string,
  patch: PatchableFields,
): Promise<{ ok: true } | { ok: false; reason: "not_found" | "forbidden" }> {
  return withActor(async (tx) => {
    const [row] = await tx.select().from(skills).where(eq(skills.id, id));
    if (!row) return { ok: false, reason: "not_found" };
    if (row.scope !== userId) return { ok: false, reason: "forbidden" };
    await tx
      .update(skills)
      .set({
        ...(patch.title !== undefined ? { title: patch.title } : {}),
        ...(patch.description !== undefined ? { description: patch.description } : {}),
        ...(patch.version !== undefined ? { version: patch.version } : {}),
        ...(patch.metadata !== undefined ? { metadata: patch.metadata } : {}),
        updatedAt: new Date(),
      })
      .where(eq(skills.id, id));
    return { ok: true };
  });
}

// --------------- DELETE (user-scoped only) ---------------------------------

export async function deletePlugin(
  id: string,
  userId: string,
): Promise<{ ok: true } | { ok: false; reason: "not_found" | "forbidden" }> {
  return withActor(async (tx) => {
    const [row] = await tx.select().from(plugins).where(eq(plugins.id, id));
    if (!row) return { ok: false, reason: "not_found" };
    if (row.scope !== userId) return { ok: false, reason: "forbidden" };
    await tx.delete(plugins).where(eq(plugins.id, id));
    return { ok: true };
  });
}

export async function deleteSkill(
  id: string,
  userId: string,
): Promise<{ ok: true } | { ok: false; reason: "not_found" | "forbidden" }> {
  return withActor(async (tx) => {
    const [row] = await tx.select().from(skills).where(eq(skills.id, id));
    if (!row) return { ok: false, reason: "not_found" };
    if (row.scope !== userId) return { ok: false, reason: "forbidden" };
    await tx.delete(skills).where(eq(skills.id, id));
    return { ok: true };
  });
}

// --------------- DISMISS / UNHIDE ------------------------------------------

export async function dismissAsset(
  kind: Kind,
  assetId: string,
  userId: string,
): Promise<void> {
  await withActor(async (tx) => {
    // Verify the asset is visible to this user (RLS will enforce — empty result = no row).
    if (kind === "plugin") {
      const [exists] = await tx
        .select({ id: plugins.id })
        .from(plugins)
        .where(eq(plugins.id, assetId));
      if (!exists) throw new Error("not_found");
    } else {
      const [exists] = await tx
        .select({ id: skills.id })
        .from(skills)
        .where(eq(skills.id, assetId));
      if (!exists) throw new Error("not_found");
    }
    // Upsert dismissal
    await tx
      .insert(userDismissals)
      .values({ userId, assetKind: kind, assetId })
      .onConflictDoNothing();
  });
}

export async function undismissAsset(
  kind: Kind,
  assetId: string,
  userId: string,
): Promise<void> {
  await withActor(async (tx) => {
    await tx
      .delete(userDismissals)
      .where(
        and(
          eq(userDismissals.userId, userId),
          eq(userDismissals.assetKind, kind),
          eq(userDismissals.assetId, assetId),
        ),
      );
  });
}
