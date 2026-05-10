// PRD §22.3 — strict, verbose Drizzle config
import { defineConfig } from "drizzle-kit";
import { config } from "dotenv";

// Load .env.local first (Next.js convention), then .env
config({ path: ".env.local" });
config({ path: ".env" });

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL not set. Populate .env.local from dd-secrets.rtf.");
}

export default defineConfig({
  schema: "./lib/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
  strict: true,
  verbose: true,
});
