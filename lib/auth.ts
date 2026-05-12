// PRD §9 + LD-06 + ADR-005 — Better Auth server instance.
// Magic link AND email/password, both via Resend.
//
// Hooks: when a user is created (via either flow), auto-create a Personal tenant
// owned by that user. v1 uses one tenant per user; v2 will introduce memberships.

import "server-only";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { magicLink } from "better-auth/plugins";
import { authDb } from "@/lib/db/auth-db";
import {
  tenants,
  users,
  accounts,
  sessions,
  verifications,
} from "@/lib/db/schema";
import { sendMagicLinkEmail } from "@/lib/email/send-magic-link";
import { env } from "@/lib/env";

const TRUSTED_ORIGINS = [
  env.BETTER_AUTH_URL,
  // Vercel preview URLs — accepted because BETTER_AUTH_URL only knows about prod.
  // Dev: BETTER_AUTH_URL pins one localhost port (default :3001), but `next dev`
  // will fall back to :3000 / :3002 when the preferred port is busy. List the
  // common dev ports so a port shuffle doesn't 403 every auth POST.
  ...(process.env.NODE_ENV !== "production"
    ? ["http://localhost:3000", "http://localhost:3001", "http://localhost:3002"]
    : []),
];

export const auth = betterAuth({
  database: drizzleAdapter(authDb, {
    provider: "pg",
    // Map Better Auth's logical model names (singular) to our drizzle schema
    // tables (plural — match the live Neon DB). The drizzle adapter takes the
    // schema object keyed by Better Auth's expected logical names.
    schema: {
      user: users,
      account: accounts,
      session: sessions,
      verification: verifications,
    },
  }),
  // Surface unexpected errors in dev; keep info+ in prod so we don't drown logs.
  logger: {
    level: process.env.NODE_ENV === "production" ? "info" : "debug",
  },
  secret: env.BETTER_AUTH_SECRET,
  baseURL: env.BETTER_AUTH_URL,
  trustedOrigins: TRUSTED_ORIGINS,

  // Postgres `verifications.id`, `users.id`, `sessions.id`, `accounts.id` are
  // `uuid` columns (matches the live DB). Better Auth's default ID generator
  // produces 32-char nanoid-style strings which Postgres rejects as 22P02.
  // Tell Better Auth to use `gen_random_uuid()` for new ids.
  advanced: { database: { generateId: "uuid" } },

  // PRD §9 — both methods, both shipped in v1.
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: process.env.NODE_ENV === "production",
    minPasswordLength: 8,
    autoSignIn: true,
  },

  plugins: [
    magicLink({
      // 10-minute expiry per build-loop:authentication footgun #1.
      expiresIn: 60 * 10,
      sendMagicLink: async ({ email, url }) => {
        await sendMagicLinkEmail({ email, url });
      },
    }),
  ],

  // Auto-create personal tenant on first sign-up.
  // Better Auth runs this hook AFTER the user row is committed to the DB.
  databaseHooks: {
    user: {
      create: {
        after: async (newUser) => {
          // Use the owner-pool authDb because the tenants table is RLS-FORCEd
          // and we have no actor context yet (this fires inside Better Auth's
          // own request scope). The owner role bypasses RLS, which is correct
          // for system-level provisioning.
          await authDb.insert(tenants).values({
            ownerUserId: newUser.id,
            name: "Personal",
          });
        },
      },
    },
  },
});

export type Session = typeof auth.$Infer.Session;
