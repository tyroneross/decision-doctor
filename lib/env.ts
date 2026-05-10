// PRD §22.8 — Zod-validated env loaded once at boot
// Import this from any module that touches process.env so missing/malformed env fails fast.

import { z } from "zod";

// Coerce empty/undefined to undefined so .optional() works for blank optional vars.
const optionalUrl = z.preprocess(
  (v) => (v === "" || v == null ? undefined : v),
  z.string().url().optional(),
);
const optionalString = z.preprocess(
  (v) => (v === "" || v == null ? undefined : v),
  z.string().optional(),
);

const envSchema = z.object({
  // Database (Neon)
  // DATABASE_URL — owner role; reserved for migrations and trusted scripts.
  // DATABASE_URL_APP — dedicated app_user role with NOBYPASSRLS; required for the app
  //   runtime pool because RLS is bypassed by any role with rolbypassrls=true (and
  //   neondb_owner has it). See lib/db/actor.ts and drizzle/0002_app_role.sql.
  // DATABASE_URL_UNPOOLED — owner role on the unpooled endpoint, for drizzle-kit migrations.
  DATABASE_URL: z.string().url(),
  DATABASE_URL_APP: z.string().url(),
  DATABASE_URL_UNPOOLED: optionalUrl,

  // Better Auth
  BETTER_AUTH_SECRET: z.string().min(32, "Generate with: openssl rand -base64 32"),
  BETTER_AUTH_URL: z.string().url(),

  // Email (Resend)
  RESEND_API_KEY: z.string().min(10),
  AUTH_FROM_EMAIL: z.string().min(1),

  // LLM (Groq)
  GROQ_API_KEY: z.string().min(10),
  GROQ_MODEL: z.string().default("openai/gpt-oss-120b"),

  // Observability (optional)
  SENTRY_DSN: optionalString,
  LOG_LEVEL: z
    .enum(["trace", "debug", "info", "warn", "error", "fatal"])
    .default("info"),

  // Rate limiter (optional in dev)
  UPSTASH_REDIS_REST_URL: optionalUrl,
  UPSTASH_REDIS_REST_TOKEN: optionalString,
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("❌ Invalid environment variables:");
  console.error(parsed.error.flatten().fieldErrors);
  throw new Error("Environment validation failed. See errors above.");
}

export const env = parsed.data;
