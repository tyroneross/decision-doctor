// PRD §LD-04 — auto-create a "Personal" tenant on first authenticated request.
// Idempotent: returns existing tenant if one exists for this user.

import "server-only";
import { eq } from "drizzle-orm";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db/actor";
import { tenants } from "@/lib/db/schema";

/**
 * Returns the user's "Personal" tenant id, creating it if missing.
 * Bypasses RLS using a direct (non-actor) transaction with a temporary
 * GUC set to the user id — required for first-touch tenant creation
 * before any actor context exists.
 */
export async function ensureTenant(userId: string): Promise<string> {
  // Read-or-create. We can't use runWithActor here because we don't yet
  // know the tenant id. Use a transaction that sets the user GUC so the
  // tenants_owner_only RLS policy permits the read + insert.
  return db.transaction(async (tx) => {
    await tx.execute(sql`SET LOCAL ROLE app_user`);
    await tx.execute(sql`
      SELECT
        set_config('app.current_user_id', ${userId}, true),
        set_config('app.current_tenant_id', '00000000-0000-0000-0000-000000000000', true)
    `);
    const existing = await tx
      .select({ id: tenants.id })
      .from(tenants)
      .where(eq(tenants.ownerUserId, userId))
      .limit(1);
    if (existing.length > 0 && existing[0]) return existing[0].id;
    const [created] = await tx
      .insert(tenants)
      .values({ ownerUserId: userId, name: "Personal" })
      .returning({ id: tenants.id });
    if (!created) throw new Error("Failed to create tenant");
    return created.id;
  });
}
