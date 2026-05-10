// Server-side session helper that resolves the user's tenant_id alongside the
// Better Auth session. v1 has one tenant per user (created in lib/auth.ts's
// databaseHooks.user.create.after). The tenant lookup uses the OWNER pool
// (authDb) because we don't yet have an actor context — this is the
// chicken-and-egg moment where we look up the actor.

import "server-only";
import { headers } from "next/headers";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { authDb } from "@/lib/db/auth-db";
import { tenants } from "@/lib/db/schema";

export interface ResolvedActor {
  userId: string;
  tenantId: string;
  email: string;
}

/**
 * Get the current request's session AND the user's primary tenant.
 * Returns null if not signed in or tenant lookup fails.
 *
 * Use this at the top of any DB-touching route handler, then pass
 * { userId, tenantId } into runWithActor() for the rest of the work.
 */
export async function getSessionActor(): Promise<ResolvedActor | null> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return null;

  // Look up the user's personal tenant (auto-created on signup).
  const rows = await authDb
    .select({ id: tenants.id })
    .from(tenants)
    .where(eq(tenants.ownerUserId, session.user.id))
    .limit(1);

  if (rows.length === 0) {
    // Edge case: pre-existing user without a tenant (e.g. user created before
    // the auto-create hook was wired). Provision one here.
    const [row] = await authDb
      .insert(tenants)
      .values({ ownerUserId: session.user.id, name: "Personal" })
      .returning({ id: tenants.id });
    return { userId: session.user.id, tenantId: row!.id, email: session.user.email };
  }

  return {
    userId: session.user.id,
    tenantId: rows[0]!.id,
    email: session.user.email,
  };
}
