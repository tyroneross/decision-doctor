// Apply Drizzle migrations to Neon using @neondatabase/serverless WebSocket Pool.
// Usage: node scripts/apply-migrations.mjs
//
// Reads .env.local manually (no zod boot dependency) so this script is usable
// before lib/env.ts is wired up, and applies every drizzle/*.sql file in order.

import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { Pool } from "@neondatabase/serverless";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

// Lightweight .env.local parser
const envPath = join(ROOT, ".env.local");
const envText = readFileSync(envPath, "utf8");
for (const line of envText.split("\n")) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}

const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
if (!url) {
  console.error("Missing DATABASE_URL_UNPOOLED / DATABASE_URL");
  process.exit(1);
}

const pool = new Pool({ connectionString: url });

const migrationsDir = join(ROOT, "drizzle");
const files = readdirSync(migrationsDir)
  .filter((f) => f.endsWith(".sql"))
  .sort();

console.log(`Applying ${files.length} migration(s) to ${url.split("@")[1]?.split("?")[0]}`);

for (const f of files) {
  const sql = readFileSync(join(migrationsDir, f), "utf8");
  // Split on '--> statement-breakpoint' (drizzle's marker) or fall back to ';' for hand-written SQL.
  const statements = sql.includes("--> statement-breakpoint")
    ? sql.split("--> statement-breakpoint").map((s) => s.trim()).filter(Boolean)
    : sql.split(/;\s*$/m).map((s) => s.trim()).filter(Boolean);

  console.log(`\n→ ${f} (${statements.length} statements)`);
  for (const stmt of statements) {
    if (!stmt || stmt.startsWith("--")) continue;
    try {
      await pool.query(stmt);
      const preview = stmt.replace(/\s+/g, " ").slice(0, 80);
      console.log(`  ✓ ${preview}${stmt.length > 80 ? "..." : ""}`);
    } catch (err) {
      const msg = err.message || String(err);
      // Idempotent: already-exists errors are OK on rerun.
      if (
        /already exists|duplicate object|already enabled/i.test(msg) ||
        msg.includes("does not exist") &&
          /DROP|cannot change/i.test(stmt)
      ) {
        console.log(`  ⊝ skipped: ${msg.slice(0, 80)}`);
        continue;
      }
      console.error(`  ✗ failed: ${msg}`);
      console.error(`    SQL: ${stmt.slice(0, 200)}`);
      await pool.end();
      process.exit(1);
    }
  }
}

console.log("\n✅ All migrations applied.");
await pool.end();
