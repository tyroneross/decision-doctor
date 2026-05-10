/**
 * Better Auth schema-sync integration test.
 *
 * Catches the "❓ Better Auth schema sync at next push" risk in STATUS.md
 * (item #5). Specifically guards three things from drifting:
 *
 *   1. Better Auth's drizzle adapter's logical→table mapping (singular
 *      `user`/`account`/`session`/`verification` → plural `users`/...).
 *   2. The auto-create-tenant database hook (lib/auth.ts) provisions a
 *      Personal tenant on user.create.after.
 *   3. The actor-context flow (runWithActor + withActor) round-trips a
 *      decision row under RLS using the user we just created.
 *
 * Hits the real Neon DB (auth tables) via DATABASE_URL_UNPOOLED for
 * setup/teardown, and the app role (DATABASE_URL_APP) for the RLS-
 * enforced write/read. Cleanup is best-effort — owner role bypasses
 * RLS so the cleanup deletes the user (cascades to tenants, accounts,
 * sessions, verifications, decisions).
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { runWithActor, withActor } from "@/lib/db/actor";
import { decisions, tenants, users } from "@/lib/db/schema";

const setupPool = new Pool({
  connectionString:
    process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL!,
  max: 2,
});
const setupDb = drizzle(setupPool);

const TEST_EMAIL = `auth-sync-${Date.now()}@example.invalid`;
const TEST_PASSWORD = "TestPassword!2026";

let createdUserId: string | undefined;
let createdTenantId: string | undefined;
let createdDecisionId: string | undefined;

beforeAll(async () => {
  // Sign up a user via Better Auth — exercises the drizzle adapter's
  // singular→plural mapping, the user.create.after hook (which creates
  // the tenant), and the password-credential flow end-to-end.
  const signUp = await auth.api.signUpEmail({
    body: {
      email: TEST_EMAIL,
      password: TEST_PASSWORD,
      name: "Auth Sync Test",
    },
  });
  // Better Auth returns { user, token } on success; null/undefined on auth
  // misconfiguration. If the schema mapping drifted this throws or
  // returns nothing.
  if (!signUp?.user?.id) {
    throw new Error(
      `Better Auth signUpEmail returned no user. Schema sync probably broke. Response: ${JSON.stringify(
        signUp,
      )}`,
    );
  }
  createdUserId = signUp.user.id;

  // The user.create.after hook should have provisioned a tenant.
  const tenantRows = await setupDb
    .select()
    .from(tenants)
    .where(eq(tenants.ownerUserId, createdUserId));
  if (tenantRows.length === 0) {
    throw new Error(
      "user.create.after hook did NOT auto-create a tenant — schema/hook drift.",
    );
  }
  createdTenantId = tenantRows[0]!.id;
});

afterAll(async () => {
  // FK cascade on users.id deletes accounts/sessions/verifications/tenants/decisions.
  if (createdUserId) {
    await setupDb.delete(users).where(eq(users.id, createdUserId));
  }
  await setupPool.end();
});

describe("Better Auth schema sync", () => {
  it("provisions a user via auth.api.signUpEmail", () => {
    expect(createdUserId).toBeDefined();
    expect(typeof createdUserId).toBe("string");
    // uuid sanity check (length-aware, not perfect-form): 36 chars w/ 4 hyphens.
    expect(createdUserId!.length).toBe(36);
  });

  it("auto-creates a Personal tenant via the user.create.after hook", () => {
    expect(createdTenantId).toBeDefined();
    expect(createdTenantId).not.toBe(createdUserId);
  });

  it("round-trips a decision row under RLS via runWithActor + withActor", async () => {
    if (!createdUserId || !createdTenantId) {
      throw new Error("setup did not provide ids");
    }

    // Write under the actor's RLS GUCs.
    const writeResult = await runWithActor(
      { userId: createdUserId, tenantId: createdTenantId },
      () =>
        withActor(async (tx) => {
          const [row] = await tx
            .insert(decisions)
            .values({
              userId: createdUserId!,
              tenantId: createdTenantId!,
              templateId: "capacity",
              title: "Schema-sync smoke decision",
              status: "complete",
              intake: { fixture: "schema-sync" },
              recommendation: {
                option: "Schema sync test",
                confidence: 90,
                rationale: "Round-trip verification.",
              },
              alternatives: [],
              robustAlternative: null,
              methodTrace: [],
              workloadReducers: [],
              destinations: [],
            })
            .returning({ id: decisions.id });
          return row;
        }),
    );
    expect(writeResult).toBeDefined();
    createdDecisionId = writeResult!.id;

    // Read it back under the same actor context.
    const readBack = await runWithActor(
      { userId: createdUserId, tenantId: createdTenantId },
      () =>
        withActor(async (tx) =>
          tx
            .select({ id: decisions.id, title: decisions.title })
            .from(decisions)
            .where(eq(decisions.id, createdDecisionId!))
            .limit(1),
        ),
    );
    expect(readBack).toHaveLength(1);
    expect(readBack[0]!.title).toBe("Schema-sync smoke decision");
  });
});
