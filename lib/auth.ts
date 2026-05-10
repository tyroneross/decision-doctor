// PRD §9 — Better Auth (magic link + email/password) via Drizzle adapter.
// Sends magic links + verification emails through Resend.

import "server-only";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { magicLink } from "better-auth/plugins";
import { db } from "@/lib/db/actor";
import * as schema from "@/lib/db/schema";
import { sendMagicLinkEmail, sendVerificationEmail } from "@/lib/email";
import { env } from "@/lib/env";

export const auth = betterAuth({
  baseURL: env.BETTER_AUTH_URL,
  secret: env.BETTER_AUTH_SECRET,
  database: drizzleAdapter(db, {
    provider: "pg",
    usePlural: true,
    schema: {
      users: schema.users,
      sessions: schema.sessions,
      accounts: schema.accounts,
      verifications: schema.verifications,
    },
  }),
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: env.NODE_ENV === "production",
    minPasswordLength: 8,
    autoSignIn: true,
  },
  emailVerification: {
    sendOnSignUp: true,
    autoSignInAfterVerification: true,
    sendVerificationEmail: async ({ user, url }) => {
      await sendVerificationEmail(user.email, url);
    },
  },
  session: {
    expiresIn: 60 * 60 * 24 * 7, // 7-day rolling
    updateAge: 60 * 60 * 24,
    cookieCache: {
      enabled: true,
      maxAge: 60 * 5,
    },
  },
  advanced: {
    cookiePrefix: "dd",
    database: {
      // Our DB uses uuid PKs with gen_random_uuid() default — let Postgres
      // populate id rather than Better Auth's nanoid generator.
      generateId: false,
    },
  },
  plugins: [
    magicLink({
      sendMagicLink: async ({ email, url }) => {
        await sendMagicLinkEmail(email, url);
      },
      expiresIn: 60 * 60, // 1 hour
    }),
  ],
});

export type Session = typeof auth.$Infer.Session;
