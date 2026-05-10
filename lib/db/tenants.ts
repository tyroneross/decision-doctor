import "server-only";

import { eq } from "drizzle-orm";
import { runWithUser, withUser } from "./actor";
import { tenants } from "./schema";

export async function getOrCreatePersonalTenant(userId: string) {
  return runWithUser({ userId }, async () => {
    return withUser(async (tx) => {
      const existing = await tx
        .select()
        .from(tenants)
        .where(eq(tenants.ownerUserId, userId))
        .limit(1);

      if (existing[0]) {
        return existing[0];
      }

      const created = await tx
        .insert(tenants)
        .values({ ownerUserId: userId, name: "Personal" })
        .returning();

      if (!created[0]) {
        throw new Error("Failed to create personal tenant.");
      }

      return created[0];
    });
  });
}
