// Verify Neon DB state — tables exist, RLS enabled, policies present.
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { Pool } from "@neondatabase/serverless";

const __dirname = dirname(fileURLToPath(import.meta.url));
const envText = readFileSync(join(__dirname, "..", ".env.local"), "utf8");
for (const line of envText.split("\n")) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL,
});

const tables = await pool.query(
  `SELECT c.relname AS tablename,
          c.relrowsecurity AS rls_enabled,
          c.relforcerowsecurity AS rls_forced
   FROM pg_class c
   JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relkind = 'r'
   ORDER BY c.relname`,
);
console.log("Tables:");
console.table(tables.rows);

const policies = await pool.query(
  `SELECT tablename, policyname, cmd
   FROM pg_policies
   WHERE schemaname = 'public'
   ORDER BY tablename, policyname`,
);
console.log("RLS policies:");
console.table(policies.rows);

await pool.end();
