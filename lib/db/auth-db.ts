// Database instance for Better Auth's drizzle adapter.
//
// Better Auth manages its own tables (`user`, `session`, `account`, `verification`)
// which have no RLS. We use the OWNER pool (DATABASE_URL) here, not the app_user
// pool — Better Auth needs to write to these tables outside the actor context, and
// it's intended to run before the request actor context is even established
// (e.g., during sign-up).
//
// This pool MUST NOT be used for any user-data CRUD against `tenants` / `decisions`
// / `audit_events`. Those tables route through `lib/db/actor.ts` for RLS enforcement.

import "server-only";
import { Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import { env } from "@/lib/env";

const authPool = new Pool({
  connectionString: env.DATABASE_URL, // owner role — bypasses RLS, intended
  max: 5,
});

export const authDb = drizzle(authPool);
