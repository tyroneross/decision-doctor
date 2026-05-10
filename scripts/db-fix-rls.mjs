// Patch the two RLS gaps identified by db-verify.mjs:
// 1. decisions.rls_enabled was false (FORCE without ENABLE = no policy enforcement)
// 2. audit_events missing audit_insert policy (audit_select alone = no INSERT)
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

const fixes = [
  `ALTER TABLE decisions ENABLE ROW LEVEL SECURITY`,
  `CREATE POLICY audit_insert ON audit_events
     FOR INSERT
     WITH CHECK (tenant_id::text = current_setting('app.current_tenant_id', true))`,
];

for (const stmt of fixes) {
  try {
    await pool.query(stmt);
    console.log(`✓ ${stmt.replace(/\s+/g, " ").slice(0, 80)}`);
  } catch (err) {
    if (/already exists|already enabled/i.test(err.message)) {
      console.log(`⊝ ${stmt.replace(/\s+/g, " ").slice(0, 80)} (already)`);
    } else {
      console.error(`✗ ${err.message}`);
      process.exit(1);
    }
  }
}

await pool.end();
console.log("✅ RLS gaps fixed.");
