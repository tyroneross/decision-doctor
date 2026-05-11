/**
 * L1 — RLS isolation across the four library_* tables.
 *
 * Pattern mirrors tests/rls-isolation.test.ts (T-08). For each library table:
 *   1. Insert a row under user A's GUC scope (user-scoped, not global).
 *   2. SELECT under user B's GUC scope → must return zero rows.
 *   3. SELECT under user A's GUC scope → must return the row (sanity check).
 *   4. Global rows must be visible to both A and B (one shared assertion).
 *
 * Plus one WITH CHECK cross-user insert attempt (analogous to the T-08 tenant
 * cross-claim test) to verify the WITH CHECK clause rejects forging another
 * user's scope.
 *
 * Setup/teardown use the OWNER pool (DATABASE_URL_UNPOOLED) to bypass RLS for
 * fixture management. App-side RLS is exercised via runWithActor/withActor.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import { eq, inArray } from "drizzle-orm";
import {
  users,
  tenants,
  libraryUseCases,
  libraryPrompts,
  librarySkills,
  libraryPlugins,
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
  useCaseIds: [] as string[],
  promptIds: [] as string[],
  skillIds: [] as string[],
  pluginIds: [] as string[],
};

beforeAll(async () => {
  const stamp = Date.now();
  userAId = randomUUID();
  userBId = randomUUID();
  await setupDb.insert(users).values([
    {
      id: userAId,
      email: `rls-library-A-${stamp}@example.invalid`,
      name: "RLS Library A",
      emailVerified: false,
    },
    {
      id: userBId,
      email: `rls-library-B-${stamp}@example.invalid`,
      name: "RLS Library B",
      emailVerified: false,
    },
  ]);
  const [tA] = await setupDb
    .insert(tenants)
    .values({ ownerUserId: userAId, name: "RLS-LIB A Personal" })
    .returning();
  const [tB] = await setupDb
    .insert(tenants)
    .values({ ownerUserId: userBId, name: "RLS-LIB B Personal" })
    .returning();
  tenantAId = tA!.id;
  tenantBId = tB!.id;
});

afterAll(async () => {
  // Owner role bypasses RLS — straight deletes work without setting GUCs.
  if (cleanup.useCaseIds.length > 0) {
    await setupDb
      .delete(libraryUseCases)
      .where(inArray(libraryUseCases.id, cleanup.useCaseIds));
  }
  if (cleanup.promptIds.length > 0) {
    await setupDb
      .delete(libraryPrompts)
      .where(inArray(libraryPrompts.id, cleanup.promptIds));
  }
  if (cleanup.skillIds.length > 0) {
    await setupDb
      .delete(librarySkills)
      .where(inArray(librarySkills.id, cleanup.skillIds));
  }
  if (cleanup.pluginIds.length > 0) {
    await setupDb
      .delete(libraryPlugins)
      .where(inArray(libraryPlugins.id, cleanup.pluginIds));
  }
  await setupDb
    .delete(tenants)
    .where(inArray(tenants.id, [tenantAId, tenantBId]));
  await setupDb.delete(users).where(inArray(users.id, [userAId, userBId]));
});

describe("L1 — library_* RLS scope isolation", () => {
  it("user B cannot read library_use_cases scoped to user A", async () => {
    const id = await runWithActor(
      { userId: userAId, tenantId: tenantAId },
      async () =>
        withActor(async (tx) => {
          const [row] = await tx
            .insert(libraryUseCases)
            .values({
              scope: userAId, // user-scoped row
              painPath: "admin",
              startingLevel: "prompt",
              title: "RLS-LIB use-case",
              body: "User A's private use case",
            })
            .returning();
          return row!.id;
        }),
    );
    cleanup.useCaseIds.push(id);

    const visibleToB = await runWithActor(
      { userId: userBId, tenantId: tenantBId },
      async () =>
        withActor(async (tx) =>
          tx
            .select()
            .from(libraryUseCases)
            .where(eq(libraryUseCases.id, id)),
        ),
    );
    expect(visibleToB).toHaveLength(0);

    const visibleToA = await runWithActor(
      { userId: userAId, tenantId: tenantAId },
      async () =>
        withActor(async (tx) =>
          tx
            .select()
            .from(libraryUseCases)
            .where(eq(libraryUseCases.id, id)),
        ),
    );
    expect(visibleToA).toHaveLength(1);
    expect(visibleToA[0]!.scope).toBe(userAId);
  });

  it("user B cannot read library_prompts scoped to user A", async () => {
    const id = await runWithActor(
      { userId: userAId, tenantId: tenantAId },
      async () =>
        withActor(async (tx) => {
          const [row] = await tx
            .insert(libraryPrompts)
            .values({
              scope: userAId,
              painPath: "research",
              title: "RLS-LIB prompt",
              body: "User A's private prompt template",
            })
            .returning();
          return row!.id;
        }),
    );
    cleanup.promptIds.push(id);

    const visibleToB = await runWithActor(
      { userId: userBId, tenantId: tenantBId },
      async () =>
        withActor(async (tx) =>
          tx
            .select()
            .from(libraryPrompts)
            .where(eq(libraryPrompts.id, id)),
        ),
    );
    expect(visibleToB).toHaveLength(0);
  });

  it("user B cannot read library_skills scoped to user A", async () => {
    const id = await runWithActor(
      { userId: userAId, tenantId: tenantAId },
      async () =>
        withActor(async (tx) => {
          const [row] = await tx
            .insert(librarySkills)
            .values({
              scope: userAId,
              painPath: "referrals",
              title: "RLS-LIB skill",
              body: "User A's promoted skill",
            })
            .returning();
          return row!.id;
        }),
    );
    cleanup.skillIds.push(id);

    const visibleToB = await runWithActor(
      { userId: userBId, tenantId: tenantBId },
      async () =>
        withActor(async (tx) =>
          tx
            .select()
            .from(librarySkills)
            .where(eq(librarySkills.id, id)),
        ),
    );
    expect(visibleToB).toHaveLength(0);
  });

  it("user B cannot read library_plugins scoped to user A", async () => {
    const id = await runWithActor(
      { userId: userAId, tenantId: tenantAId },
      async () =>
        withActor(async (tx) => {
          const [row] = await tx
            .insert(libraryPlugins)
            .values({
              scope: userAId,
              painPath: "follow_up",
              title: "RLS-LIB plugin",
              body: "User A's promoted plugin",
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
          tx
            .select()
            .from(libraryPlugins)
            .where(eq(libraryPlugins.id, id)),
        ),
    );
    expect(visibleToB).toHaveLength(0);
  });

  it("global rows are visible to both users (sanity check)", async () => {
    // Insert a global row (scope='global') as user A. Per the RLS policy, this
    // is allowed because the WITH CHECK clause permits scope='global' for any
    // actor. Both users must then be able to SELECT it.
    const id = await runWithActor(
      { userId: userAId, tenantId: tenantAId },
      async () =>
        withActor(async (tx) => {
          const [row] = await tx
            .insert(libraryUseCases)
            .values({
              scope: "global",
              painPath: "capacity_growth",
              startingLevel: "prompt",
              title: "RLS-LIB global use-case",
              body: "Shared global content",
            })
            .returning();
          return row!.id;
        }),
    );
    cleanup.useCaseIds.push(id);

    for (const [uId, tId] of [
      [userAId, tenantAId],
      [userBId, tenantBId],
    ] as const) {
      const rows = await runWithActor(
        { userId: uId, tenantId: tId },
        async () =>
          withActor(async (tx) =>
            tx
              .select()
              .from(libraryUseCases)
              .where(eq(libraryUseCases.id, id)),
          ),
      );
      expect(rows).toHaveLength(1);
      expect(rows[0]!.scope).toBe("global");
    }
  });

  it("user B cannot INSERT a library_use_case claiming user A's scope (WITH CHECK)", async () => {
    let caught: unknown = null;
    try {
      await runWithActor(
        { userId: userBId, tenantId: tenantBId },
        async () =>
          withActor(async (tx) => {
            await tx.insert(libraryUseCases).values({
              scope: userAId, // forging user A's scope while acting as B
              painPath: "admin",
              startingLevel: "prompt",
              title: "Should be rejected",
              body: "WITH CHECK should block this",
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
