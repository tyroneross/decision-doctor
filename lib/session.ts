// Helper: extract userId+tenantId from a Better Auth session, auto-creating
// the user's Personal tenant on first hit.

import "server-only";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { ensureTenant } from "@/lib/db/tenant";

export interface ResolvedSession {
  userId: string;
  tenantId: string;
  email: string;
}

export async function getActorSession(): Promise<ResolvedSession | null> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) return null;
  const tenantId = await ensureTenant(session.user.id);
  return {
    userId: session.user.id,
    tenantId,
    email: session.user.email ?? "",
  };
}
