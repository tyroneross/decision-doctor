// T-08: cross-tenant RLS. User A's runWithActor query for User B's row returns empty.
// Hits the LIVE shared Neon DB. Cleans up after itself.

import { describe, it, expect, afterAll } from "vitest";
import { Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import { sql, eq } from "drizzle-orm";
import { users, tenants, decisions } from "@/lib/db/schema";

const skip = !process.env.DATABASE_URL;

describe.skipIf(skip)("RLS cross-tenant isolation (T-08)", () => {
  // Use a fresh pool so the actor.ts singleton's GUCs don't leak.
  const pool = new Pool({ connectionString: process.env.DATABASE_URL!, max: 4 });
  const db = drizzle(pool);

  const created: { userIds: string[]; tenantIds: string[]; decisionIds: string[] } = {
    userIds: [],
    tenantIds: [],
    decisionIds: [],
  };

  async function withGuc<T>(userId: string, tenantId: string, fn: (tx: typeof db) => Promise<T>): Promise<T> {
    return db.transaction(async (tx) => {
      // Match production actor.ts behavior — SET LOCAL ROLE app_user so RLS is enforced.
      await tx.execute(sql`SET LOCAL ROLE app_user`);
      await tx.execute(sql`
        SELECT
          set_config('app.current_user_id', ${userId}, true),
          set_config('app.current_tenant_id', ${tenantId}, true)
      `);
      return fn(tx as unknown as typeof db);
    });
  }

  async function adminInsert(userId: string, tenantId: string, decisionId: string, email: string) {
    return db.transaction(async (tx) => {
      await tx.execute(sql`SET LOCAL row_security = off`);
      await tx.insert(users).values({
        id: userId,
        email,
        name: "test",
      });
      await tx.insert(tenants).values({
        id: tenantId,
        ownerUserId: userId,
        name: "Personal",
      });
      await tx.insert(decisions).values({
        id: decisionId,
        userId,
        tenantId,
        templateId: "capacity",
        intake: { test: true },
        recommendation: { option: "test", confidence: 80, rationale: "test" },
        alternatives: [],
        robustAlternative: { option: "test", why: "test" },
        methodTrace: [],
        workloadReducers: [],
        destinations: [],
        status: "complete",
      });
    });
  }

  it("a User A query for User B's decision returns no rows (effectively 404)", async () => {
    const stamp = Date.now();
    const stampHex = stamp.toString(16).padStart(12, "0").slice(-12);
    // user.id is uuid PK now (Branch A convention) — generate fresh uuids.
    const userA = "10000000-0000-0000-0000-" + stampHex;
    const userB = "20000000-0000-0000-0000-" + stampHex;
    const tenantA = "30000000-0000-0000-0000-" + stampHex;
    const tenantB = "40000000-0000-0000-0000-" + stampHex;
    const decisionA = "50000000-0000-0000-0000-" + stampHex;
    const decisionB = "60000000-0000-0000-0000-" + stampHex;

    created.userIds.push(userA, userB);
    created.tenantIds.push(tenantA, tenantB);
    created.decisionIds.push(decisionA, decisionB);

    await adminInsert(userA, tenantA, decisionA, `bl-A-${stamp}@buildloop.test`);
    await adminInsert(userB, tenantB, decisionB, `bl-B-${stamp}@buildloop.test`);

    // User A in their tenant: should see exactly their own row.
    const aRows = await withGuc(userA, tenantA, (tx) => tx.select().from(decisions));
    expect(aRows.map((r) => r.id)).toContain(decisionA);
    expect(aRows.map((r) => r.id)).not.toContain(decisionB);

    // User A trying to fetch User B's row by id: empty result (not "row hidden", not 403).
    const aLookB = await withGuc(userA, tenantA, (tx) =>
      tx.select().from(decisions).where(eq(decisions.id, decisionB)),
    );
    expect(aLookB).toEqual([]);

    // Sanity: User B sees their own row.
    const bRows = await withGuc(userB, tenantB, (tx) =>
      tx.select().from(decisions).where(eq(decisions.id, decisionB)),
    );
    expect(bRows.map((r) => r.id)).toEqual([decisionB]);
  });

  afterAll(async () => {
    // Clean up our test rows so we don't leave state in shared DB.
    await db.transaction(async (tx) => {
      await tx.execute(sql`SET LOCAL row_security = off`);
      for (const id of created.decisionIds) {
        await tx.delete(decisions).where(eq(decisions.id, id));
      }
      for (const id of created.tenantIds) {
        await tx.delete(tenants).where(eq(tenants.id, id));
      }
      for (const id of created.userIds) {
        await tx.delete(users).where(eq(users.id, id));
      }
    });
    await pool.end();
  });
});
