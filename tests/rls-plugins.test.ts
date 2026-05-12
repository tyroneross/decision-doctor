/**
 * C1 — RLS isolation across the four new plugin-library tables + user_dismissals.
 *
 * Mirrors tests/rls-library.test.ts (T-L1) but covers the new surface from
 * drizzle/0009_plugins_skills.sql: plugins, skills, plugin_skills, asset_files,
 * user_dismissals. Setup/teardown use the OWNER pool to bypass RLS for fixture
 * management; app reads/writes go through runWithActor + withActor.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import { eq, inArray, and } from "drizzle-orm";
import {
  users,
  tenants,
  plugins,
  skills,
  pluginSkills,
  assetFiles,
  userDismissals,
} from "@/lib/db/schema";
import { runWithActor, withActor } from "@/lib/db/actor";

const setupPool = new Pool({
  connectionString:
    process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL!,
  max: 2,
});
const setupDb = drizzle(setupPool);

let userAId: string;
let userBId: string;
let tenantAId: string;
let tenantBId: string;

const cleanup = {
  pluginIds: [] as string[],
  skillIds: [] as string[],
};

beforeAll(async () => {
  const stamp = Date.now();
  userAId = randomUUID();
  userBId = randomUUID();
  await setupDb.insert(users).values([
    {
      id: userAId,
      email: `rls-plugins-A-${stamp}@example.invalid`,
      name: "RLS Plugins A",
      emailVerified: false,
    },
    {
      id: userBId,
      email: `rls-plugins-B-${stamp}@example.invalid`,
      name: "RLS Plugins B",
      emailVerified: false,
    },
  ]);
  const [tA] = await setupDb
    .insert(tenants)
    .values({ ownerUserId: userAId, name: "RLS-PL A Personal" })
    .returning();
  const [tB] = await setupDb
    .insert(tenants)
    .values({ ownerUserId: userBId, name: "RLS-PL B Personal" })
    .returning();
  tenantAId = tA!.id;
  tenantBId = tB!.id;
});

afterAll(async () => {
  // Owner role bypasses RLS — straight deletes work without setting GUCs.
  // Cascades take care of asset_files and plugin_skills.
  if (cleanup.pluginIds.length > 0) {
    await setupDb.delete(plugins).where(inArray(plugins.id, cleanup.pluginIds));
  }
  if (cleanup.skillIds.length > 0) {
    await setupDb.delete(skills).where(inArray(skills.id, cleanup.skillIds));
  }
  await setupDb
    .delete(userDismissals)
    .where(inArray(userDismissals.userId, [userAId, userBId]));
  await setupDb
    .delete(tenants)
    .where(inArray(tenants.id, [tenantAId, tenantBId]));
  await setupDb.delete(users).where(inArray(users.id, [userAId, userBId]));
});

describe("C1 — plugins/skills/plugin_skills/asset_files RLS scope isolation", () => {
  it("user B cannot read a plugin scoped to user A", async () => {
    const slug = `rls-pl-uA-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const id = await runWithActor(
      { userId: userAId, tenantId: tenantAId },
      async () =>
        withActor(async (tx) => {
          const [row] = await tx
            .insert(plugins)
            .values({
              scope: userAId,
              ownerUserId: userAId,
              slug,
              title: "User A private plugin",
            })
            .returning();
          return row!.id;
        }),
    );
    cleanup.pluginIds.push(id);

    const visibleToB = await runWithActor(
      { userId: userBId, tenantId: tenantBId },
      async () =>
        withActor(async (tx) =>
          tx.select().from(plugins).where(eq(plugins.id, id)),
        ),
    );
    expect(visibleToB).toHaveLength(0);

    const visibleToA = await runWithActor(
      { userId: userAId, tenantId: tenantAId },
      async () =>
        withActor(async (tx) =>
          tx.select().from(plugins).where(eq(plugins.id, id)),
        ),
    );
    expect(visibleToA).toHaveLength(1);
    expect(visibleToA[0]!.scope).toBe(userAId);
  });

  it("user B cannot read a skill scoped to user A", async () => {
    const slug = `rls-sk-uA-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const id = await runWithActor(
      { userId: userAId, tenantId: tenantAId },
      async () =>
        withActor(async (tx) => {
          const [row] = await tx
            .insert(skills)
            .values({
              scope: userAId,
              ownerUserId: userAId,
              slug,
              title: "User A private skill",
            })
            .returning();
          return row!.id;
        }),
    );
    cleanup.skillIds.push(id);

    const rows = await runWithActor(
      { userId: userBId, tenantId: tenantBId },
      async () =>
        withActor(async (tx) =>
          tx.select().from(skills).where(eq(skills.id, id)),
        ),
    );
    expect(rows).toHaveLength(0);
  });

  it("global plugin is visible to both users", async () => {
    const slug = `rls-pl-global-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const id = await runWithActor(
      { userId: userAId, tenantId: tenantAId },
      async () =>
        withActor(async (tx) => {
          const [row] = await tx
            .insert(plugins)
            .values({ scope: "global", slug, title: "Shared global plugin" })
            .returning();
          return row!.id;
        }),
    );
    cleanup.pluginIds.push(id);

    for (const [uId, tId] of [
      [userAId, tenantAId],
      [userBId, tenantBId],
    ] as const) {
      const rows = await runWithActor(
        { userId: uId, tenantId: tId },
        async () =>
          withActor(async (tx) =>
            tx.select().from(plugins).where(eq(plugins.id, id)),
          ),
      );
      expect(rows).toHaveLength(1);
      expect(rows[0]!.scope).toBe("global");
    }
  });

  it("user B cannot INSERT a plugin claiming user A's scope (WITH CHECK)", async () => {
    let caught: unknown = null;
    try {
      await runWithActor(
        { userId: userBId, tenantId: tenantBId },
        async () =>
          withActor(async (tx) => {
            await tx.insert(plugins).values({
              scope: userAId, // forging user A's scope
              ownerUserId: userAId,
              slug: `rls-forge-${Date.now()}`,
              title: "Should be rejected",
            });
          }),
      );
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeTruthy();
    let msg = caught instanceof Error ? caught.message : String(caught);
    let cur = caught as { cause?: unknown } | undefined;
    while (cur && (cur as { cause?: unknown }).cause) {
      cur = (cur as { cause?: unknown }).cause as { cause?: unknown };
      if (cur instanceof Error) msg += " | " + cur.message;
    }
    expect(msg).toMatch(/row[- ]level security|policy|violates/i);
  });

  it("asset_files attached to user A's plugin are hidden from user B", async () => {
    const slug = `rls-pl-files-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const { pluginId, fileId } = await runWithActor(
      { userId: userAId, tenantId: tenantAId },
      async () =>
        withActor(async (tx) => {
          const [p] = await tx
            .insert(plugins)
            .values({
              scope: userAId,
              ownerUserId: userAId,
              slug,
              title: "User A plugin w/ files",
            })
            .returning();
          const [f] = await tx
            .insert(assetFiles)
            .values({
              pluginId: p!.id,
              path: "SKILL.md",
              content: "hello",
              sha256: "deadbeef",
              sizeBytes: 5,
            })
            .returning();
          return { pluginId: p!.id, fileId: f!.id };
        }),
    );
    cleanup.pluginIds.push(pluginId);

    const visibleToB = await runWithActor(
      { userId: userBId, tenantId: tenantBId },
      async () =>
        withActor(async (tx) =>
          tx.select().from(assetFiles).where(eq(assetFiles.id, fileId)),
        ),
    );
    expect(visibleToB).toHaveLength(0);

    const visibleToA = await runWithActor(
      { userId: userAId, tenantId: tenantAId },
      async () =>
        withActor(async (tx) =>
          tx.select().from(assetFiles).where(eq(assetFiles.id, fileId)),
        ),
    );
    expect(visibleToA).toHaveLength(1);
  });

  it("plugin_skills join is hidden when the plugin is hidden", async () => {
    const slug = `rls-pl-join-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const skSlug = `rls-sk-join-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const { pluginId, skillId } = await runWithActor(
      { userId: userAId, tenantId: tenantAId },
      async () =>
        withActor(async (tx) => {
          const [p] = await tx
            .insert(plugins)
            .values({
              scope: userAId,
              ownerUserId: userAId,
              slug,
              title: "User A plugin w/ skill",
            })
            .returning();
          const [s] = await tx
            .insert(skills)
            .values({
              scope: userAId,
              ownerUserId: userAId,
              slug: skSlug,
              title: "User A skill",
            })
            .returning();
          await tx
            .insert(pluginSkills)
            .values({ pluginId: p!.id, skillId: s!.id });
          return { pluginId: p!.id, skillId: s!.id };
        }),
    );
    cleanup.pluginIds.push(pluginId);
    cleanup.skillIds.push(skillId);

    const rows = await runWithActor(
      { userId: userBId, tenantId: tenantBId },
      async () =>
        withActor(async (tx) =>
          tx
            .select()
            .from(pluginSkills)
            .where(eq(pluginSkills.pluginId, pluginId)),
        ),
    );
    expect(rows).toHaveLength(0);
  });

  it("user_dismissals are user-scoped (B cannot read A's dismissal rows)", async () => {
    // Use the GLOBAL plugin from the earlier test pattern (insert a fresh one).
    const slug = `rls-dismiss-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const pluginId = await runWithActor(
      { userId: userAId, tenantId: tenantAId },
      async () =>
        withActor(async (tx) => {
          const [p] = await tx
            .insert(plugins)
            .values({
              scope: "global",
              slug,
              title: "Global, then dismissed by A",
            })
            .returning();
          await tx.insert(userDismissals).values({
            userId: userAId,
            assetKind: "plugin",
            assetId: p!.id,
          });
          return p!.id;
        }),
    );
    cleanup.pluginIds.push(pluginId);

    const seenByA = await runWithActor(
      { userId: userAId, tenantId: tenantAId },
      async () =>
        withActor(async (tx) =>
          tx
            .select()
            .from(userDismissals)
            .where(
              and(
                eq(userDismissals.userId, userAId),
                eq(userDismissals.assetId, pluginId),
              ),
            ),
        ),
    );
    expect(seenByA).toHaveLength(1);

    const seenByB = await runWithActor(
      { userId: userBId, tenantId: tenantBId },
      async () =>
        withActor(async (tx) =>
          tx
            .select()
            .from(userDismissals)
            .where(eq(userDismissals.assetId, pluginId)),
        ),
    );
    expect(seenByB).toHaveLength(0);
  });

  it("user B cannot INSERT a dismissal claiming user A's user_id (WITH CHECK)", async () => {
    const fakePluginId = randomUUID(); // doesn't need to exist for the policy check to fire
    let caught: unknown = null;
    try {
      await runWithActor(
        { userId: userBId, tenantId: tenantBId },
        async () =>
          withActor(async (tx) => {
            await tx.insert(userDismissals).values({
              userId: userAId, // forging A's user_id
              assetKind: "plugin",
              assetId: fakePluginId,
            });
          }),
      );
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeTruthy();
    let msg = caught instanceof Error ? caught.message : String(caught);
    let cur = caught as { cause?: unknown } | undefined;
    while (cur && (cur as { cause?: unknown }).cause) {
      cur = (cur as { cause?: unknown }).cause as { cause?: unknown };
      if (cur instanceof Error) msg += " | " + cur.message;
    }
    expect(msg).toMatch(/row[- ]level security|policy|violates/i);
  });
});
