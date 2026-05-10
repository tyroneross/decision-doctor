// PRD §7.3 — AsyncLocalStorage actor context + transaction-scoped GUCs
// Lifted from ProductPilot's server/storage-hybrid.ts pattern
// Used by every DB-touching route handler

import "server-only";
import { AsyncLocalStorage } from "async_hooks";
import { Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import { sql } from "drizzle-orm";
import { env } from "@/lib/env";

export interface DbActorContext {
  userId: string;
  tenantId: string;
}

const dbActorContext = new AsyncLocalStorage<DbActorContext>();

// IMPORTANT: app pool uses DATABASE_URL_APP (the `app_user` role with NOBYPASSRLS),
// not DATABASE_URL (the owner role, which has rolbypassrls=true and silently bypasses
// FORCE ROW LEVEL SECURITY). Verified 2026-05-10 in T-08 — owner-role reads returned
// cross-tenant rows. The owner URL stays for drizzle-kit migrations only.
const pool = new Pool({
  connectionString: env.DATABASE_URL_APP,
  max: 10, // PRD §7.5 — Neon WebSocket pool sizing
});

export const db = drizzle(pool);

/**
 * Run an operation inside an actor context. The handler can call withActor()
 * inside this scope; GUCs are set per-transaction and never leak across requests.
 *
 * Usage:
 *   await runWithActor({ userId, tenantId }, async () => {
 *     return withActor(async (tx) => {
 *       return tx.select().from(decisions);  // RLS auto-enforced
 *     });
 *   });
 */
export function runWithActor<T>(
  context: DbActorContext,
  callback: () => Promise<T>,
): Promise<T> {
  return dbActorContext.run(context, callback);
}

/**
 * Wrap a DB operation in a transaction with GUCs set for RLS.
 * MUST be called inside a runWithActor() scope.
 *
 * The `, true` flag on set_config makes the GUC transaction-local —
 * never leaks across requests reusing the same pool connection.
 */
export async function withActor<T>(
  operation: (tx: typeof db) => Promise<T>,
): Promise<T> {
  const actor = dbActorContext.getStore();
  if (!actor) {
    throw new Error(
      "withActor() called outside of runWithActor() scope. Wrap your route handler in runWithActor({userId, tenantId}, ...).",
    );
  }
  return db.transaction(async (tx) => {
    await tx.execute(sql`
      SELECT
        set_config('app.current_user_id', ${actor.userId}, true),
        set_config('app.current_tenant_id', ${actor.tenantId}, true)
    `);
    return operation(tx as unknown as typeof db);
  });
}
