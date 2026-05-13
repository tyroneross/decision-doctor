// PRD §22.8 — Zod-validated env loaded once at boot.
//
// IMPORTANT — Vercel build-phase behavior:
//   Vercel "Sensitive" env vars (the default for newly-added secrets) are
//   NOT exposed to the build sandbox; they are only injected into the
//   serverless function at runtime. Strict Zod validation at build time
//   would therefore fail every Sensitive var with "Invalid URL" / "Too
//   small" / etc., killing `next build` during the page-data collection
//   pass.
//
//   To survive this without weakening runtime safety, this module:
//     - detects the build phase via `process.env.NEXT_PHASE`
//     - at build phase: logs a single warning and returns a stubbed Env
//       so module-load `env.X` accesses (in lib/auth.ts, lib/db/actor.ts,
//       lib/groq-core.ts) don't crash the build
//     - at runtime: strict validation; throws on any failure so we fail
//       fast in the deployed function rather than silently misbehave
//
//   The stubs are deliberately obvious ("BUILD_STUB_…") so if any of them
//   accidentally make it into a runtime code path, the failure is loud
//   and traceable (e.g. an HTTP 401 from Better Auth instead of silent
//   misconfiguration).
//
// Import this from any module that touches process.env so missing/
// malformed env fails fast in production.

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

const envSchema = z
  .object({
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
    GOOGLE_CLIENT_ID: optionalString,
    GOOGLE_CLIENT_SECRET: optionalString,

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
  })
  .superRefine((env, ctx) => {
    if (Boolean(env.GOOGLE_CLIENT_ID) !== Boolean(env.GOOGLE_CLIENT_SECRET)) {
      ctx.addIssue({
        code: "custom",
        path: ["GOOGLE_CLIENT_ID"],
        message: "Set both GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET, or neither.",
      });
      ctx.addIssue({
        code: "custom",
        path: ["GOOGLE_CLIENT_SECRET"],
        message: "Set both GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET, or neither.",
      });
    }
  });

type Env = z.infer<typeof envSchema>;

// Vercel / Next.js sets NEXT_PHASE during `next build`. We use this signal
// (rather than NODE_ENV) because NODE_ENV is "production" at both build
// AND runtime — only NEXT_PHASE distinguishes the two.
const isBuildPhase = process.env.NEXT_PHASE === "phase-production-build";

function buildStubEnv(): Env {
  // Deliberately obvious sentinels so any leak into a runtime path produces
  // a loud, traceable failure (HTTP 401 / DNS failure) rather than silent
  // misbehavior.
  return {
    DATABASE_URL:
      process.env.DATABASE_URL ||
      "postgresql://build_stub:build_stub@build-stub.invalid/build_stub",
    DATABASE_URL_APP:
      process.env.DATABASE_URL_APP ||
      "postgresql://build_stub:build_stub@build-stub.invalid/build_stub",
    DATABASE_URL_UNPOOLED: process.env.DATABASE_URL_UNPOOLED || undefined,

    BETTER_AUTH_SECRET:
      process.env.BETTER_AUTH_SECRET ||
      "BUILD_STUB_BETTER_AUTH_SECRET_DO_NOT_USE",
    BETTER_AUTH_URL: process.env.BETTER_AUTH_URL || "http://build-stub.invalid",
    GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID || undefined,
    GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET || undefined,

    RESEND_API_KEY: process.env.RESEND_API_KEY || "re_BUILD_STUB",
    AUTH_FROM_EMAIL: process.env.AUTH_FROM_EMAIL || "build-stub@invalid",

    GROQ_API_KEY: process.env.GROQ_API_KEY || "gsk_BUILD_STUB",
    GROQ_MODEL: process.env.GROQ_MODEL || "openai/gpt-oss-120b",

    SENTRY_DSN: process.env.SENTRY_DSN || undefined,
    LOG_LEVEL:
      (process.env.LOG_LEVEL as Env["LOG_LEVEL"]) || ("info" as const),

    UPSTASH_REDIS_REST_URL: process.env.UPSTASH_REDIS_REST_URL || undefined,
    UPSTASH_REDIS_REST_TOKEN: process.env.UPSTASH_REDIS_REST_TOKEN || undefined,
  };
}

function resolveEnv(): Env {
  const parsed = envSchema.safeParse(process.env);
  if (parsed.success) return parsed.data;

  if (isBuildPhase) {
    // Build-time validation failures are expected on Vercel when one or
    // more required vars are flagged Sensitive (not exposed to the build
    // sandbox). Warn once and fall through to stubs.
    console.warn(
      "⚠️ [env] Build-phase validation skipped — some env vars are not exposed during `next build`. " +
        "This is expected on Vercel when vars are marked Sensitive. Runtime will revalidate.",
    );
    console.warn(
      "⚠️ [env] Missing or invalid at build:",
      Object.keys(parsed.error.flatten().fieldErrors).join(", "),
    );
    return buildStubEnv();
  }

  // Runtime — fail fast. A misconfigured production deploy must crash on
  // first request, not silently accept stubs.
  console.error("❌ Invalid environment variables:");
  console.error(parsed.error.flatten().fieldErrors);
  throw new Error("Environment validation failed. See errors above.");
}

export const env: Env = resolveEnv();
