/**
 * T-08 — Cross-tenant RLS isolation (PRD §5 + §7.4)
 *
 * Verifies: a decision row created under tenant A is invisible to a SELECT issued
 * under tenant B's GUC scope. RLS uses USING (tenant_id::text = current_setting('app.current_tenant_id', true))
 * with FORCE ROW LEVEL SECURITY so the policy applies even to the table owner.
 *
 * Pass condition: tenant B's SELECT returns 0 rows for the row tenant A inserted.
 * (Per PRD T-08 — "404 not 403"; at the DB layer this manifests as an empty result set,
 * which the route handler then surfaces as 404.)
 *
 * Cleanup: deletes both decisions rows + both tenant rows + both user rows in a
 * superuser-equivalent transaction at the end. Idempotent; safe to re-run.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import { sql, eq, inArray } from "drizzle-orm";
import { decisions, tenants, user } from "@/lib/db/schema";
import { runWithActor, withActor } from "@/lib/db/actor";

// Setup/teardown use the OWNER role (DATABASE_URL_UNPOOLED). That role has
// rolbypassrls=true intentionally — it's how we provision test fixtures + clean up.
// The actual RLS-under-test operations use lib/db/actor.ts, which connects via the
// app_user role (DATABASE_URL_APP) without bypass.
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
const createdDecisionIds: string[] = [];

beforeAll(async () => {
  // Create two distinct users + tenants. Use unique emails so re-runs don't collide.
  // user.id is TEXT (Better Auth convention) — generate ids client-side via crypto.
  const stamp = Date.now();
  userAId = `rls-test-A-${stamp}-${Math.random().toString(36).slice(2, 8)}`;
  userBId = `rls-test-B-${stamp}-${Math.random().toString(36).slice(2, 8)}`;
  await setupDb.insert(user).values([
    {
      id: userAId,
      email: `rls-test-A-${stamp}@example.invalid`,
      name: "RLS Test A",
      emailVerified: false,
    },
    {
      id: userBId,
      email: `rls-test-B-${stamp}@example.invalid`,
      name: "RLS Test B",
      emailVerified: false,
    },
  ]);

  const [tenantA] = await setupDb
    .insert(tenants)
    .values({ ownerUserId: userAId, name: "Test A Personal" })
    .returning();
  const [tenantB] = await setupDb
    .insert(tenants)
    .values({ ownerUserId: userBId, name: "Test B Personal" })
    .returning();
  tenantAId = tenantA!.id;
  tenantBId = tenantB!.id;
});

afterAll(async () => {
  // Owner role bypasses RLS — straight deletes work without setting GUCs.
  if (createdDecisionIds.length > 0) {
    await setupDb.delete(decisions).where(inArray(decisions.id, createdDecisionIds));
  }
  await setupDb.delete(tenants).where(inArray(tenants.id, [tenantAId, tenantBId]));
  await setupDb.delete(user).where(inArray(user.id, [userAId, userBId]));
  await setupPool.end();
});

describe("T-08 — RLS tenant isolation", () => {
  it("tenant B cannot read a decision created by tenant A", async () => {
    // 1. User A inserts a decision under tenant A's GUC scope.
    const insertedId = await runWithActor(
      { userId: userAId, tenantId: tenantAId },
      async () =>
        withActor(async (tx) => {
          const [row] = await tx
            .insert(decisions)
            .values({
              userId: userAId,
              tenantId: tenantAId,
              templateId: "capacity",
              intake: { test: "T-08 row" },
              status: "complete",
            })
            .returning();
          return row!.id;
        }),
    );
    expect(insertedId).toBeTruthy();
    createdDecisionIds.push(insertedId);

    // 2. User B reads decisions under tenant B's GUC scope. Must see zero rows.
    const visibleToB = await runWithActor(
      { userId: userBId, tenantId: tenantBId },
      async () =>
        withActor(async (tx) =>
          tx.select().from(decisions).where(eq(decisions.id, insertedId)),
        ),
    );
    expect(visibleToB).toHaveLength(0);

    // 3. Sanity: under tenant A's scope, the row IS visible.
    const visibleToA = await runWithActor(
      { userId: userAId, tenantId: tenantAId },
      async () =>
        withActor(async (tx) =>
          tx.select().from(decisions).where(eq(decisions.id, insertedId)),
        ),
    );
    expect(visibleToA).toHaveLength(1);
    expect(visibleToA[0]!.tenantId).toBe(tenantAId);
  });

  it("tenant B cannot insert a decision claiming tenant A's tenant_id (WITH CHECK)", async () => {
    // The RLS policy WITH CHECK clause should reject any INSERT whose tenant_id
    // doesn't match the actor's GUC. Drizzle wraps the underlying RLS error
    // with a "Failed query:" prefix; assert on the error chain (cause) so a
    // generic insert failure (e.g. column type) doesn't masquerade as a pass.
    let caught: unknown = null;
    try {
      await runWithActor(
        { userId: userBId, tenantId: tenantBId },
        async () =>
          withActor(async (tx) => {
            await tx.insert(decisions).values({
              userId: userBId,
              tenantId: tenantAId, // attempt to claim tenant A's id while scoped to B
              templateId: "capacity",
              intake: { test: "T-08 cross-tenant insert attempt" },
              status: "complete",
            });
          }),
      );
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeTruthy();
    // Walk the cause chain — Postgres RLS violation message lives there.
    let msg = caught instanceof Error ? caught.message : String(caught);
    let cur = caught as { cause?: unknown } | undefined;
    while (cur && (cur as { cause?: unknown }).cause) {
      cur = (cur as { cause?: unknown }).cause as { cause?: unknown };
      if (cur instanceof Error) msg += " | " + cur.message;
    }
    expect(msg).toMatch(/row[- ]level security|policy|violates/i);
  });
});
