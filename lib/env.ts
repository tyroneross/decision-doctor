// PRD §22.8 — Zod-validated env loaded once at boot
// Import this from any module that touches process.env so missing/malformed env fails fast.

import { z } from "zod";

const envSchema = z.object({
  // Database (Neon)
  DATABASE_URL: z.string().url(),

  // Better Auth
  BETTER_AUTH_SECRET: z.string().min(32, "Generate with: openssl rand -base64 32"),
  BETTER_AUTH_URL: z.string().url(),

  // Email (Resend)
  RESEND_API_KEY: z.string().min(10),
  AUTH_FROM_EMAIL: z.string().min(1),

  // LLM (Groq)
  GROQ_API_KEY: z.string().min(10),
  GROQ_MODEL: z.string().default("openai/gpt-oss-120b"),

  // Per-user rate limit (T-10) — decisions per 24h window
  GROQ_RATE_LIMIT_PER_DAY: z.coerce.number().int().positive().default(20),

  // Share URL signing — defaults to BETTER_AUTH_SECRET if absent
  SHARE_URL_SECRET: z.string().min(32).optional(),

  // Observability (optional)
  SENTRY_DSN: z.string().optional(),
  LOG_LEVEL: z
    .enum(["trace", "debug", "info", "warn", "error", "fatal"])
    .default("info"),

  // Rate limiter (optional in dev)
  UPSTASH_REDIS_REST_URL: z.string().url().optional(),
  UPSTASH_REDIS_REST_TOKEN: z.string().optional(),

  // Node env (next sets this)
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("❌ Invalid environment variables:");
  console.error(parsed.error.flatten().fieldErrors);
  throw new Error("Environment validation failed. See errors above.");
}

export const env = parsed.data;
