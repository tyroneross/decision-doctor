// PRD §22.3 — strict, verbose Drizzle config.
// Uses the UNPOOLED Neon URL for migrations to avoid pgbouncer prepared-stmt friction.
// App runtime uses the pooled URL via @neondatabase/serverless WebSocket Pool.
import { defineConfig } from "drizzle-kit";
import { config } from "dotenv";
config({ path: ".env.local" });

const migrationUrl =
  process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
if (!migrationUrl) {
  throw new Error(
    "DATABASE_URL_UNPOOLED (preferred) or DATABASE_URL must be set for drizzle migrations.",
  );
}

export default defineConfig({
  schema: "./lib/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { url: migrationUrl },
  strict: true,
  verbose: true,
});
