// Move 1 — Neon tier auto-detect.
//
// Probes the Neon Postgres for pgvector availability + lists adjacent extensions.
// Writes result to .build-loop/neon-tier-check.json for the dispatcher.
//
// Run: node scripts/neon-tier-check.mjs
import { config } from "dotenv";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { Pool, neonConfig } from "@neondatabase/serverless";

config({ path: ".env.local" });
// Node 22 has a global WebSocket via undici; neon-serverless auto-uses it.
// If unavailable, the pool will throw — we'll surface that as the error.
if (typeof WebSocket !== "undefined") {
  neonConfig.webSocketConstructor = WebSocket;
}

const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
if (!url) {
  const err = { ok: false, error: "DATABASE_URL missing" };
  console.error(JSON.stringify(err, null, 2));
  process.exit(2);
}

const result = {
  ok: false,
  database_url_kind: process.env.DATABASE_URL_UNPOOLED ? "unpooled" : "pooled",
  pgvector_available: false,
  pgvector_error: null,
  pgvector_version: null,
  available_extensions: {},
  checked_at: new Date().toISOString(),
};

const pool = new Pool({ connectionString: url });

try {
  // Probe available extensions
  const ext = await pool.query(
    `SELECT name, default_version, installed_version
       FROM pg_available_extensions
      WHERE name IN ('vector', 'pg_trgm', 'pg_search', 'pg_cron')
      ORDER BY name`,
  );
  for (const row of ext.rows) {
    result.available_extensions[row.name] = {
      default_version: row.default_version,
      installed_version: row.installed_version,
    };
  }

  // Try CREATE EXTENSION inside a tx + ROLLBACK
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    try {
      await client.query("CREATE EXTENSION IF NOT EXISTS vector");
      const v = await client.query(
        "SELECT extversion FROM pg_extension WHERE extname = 'vector'",
      );
      result.pgvector_available = true;
      result.pgvector_version = v.rows[0]?.extversion ?? null;
      await client.query("ROLLBACK");
    } catch (e) {
      result.pgvector_error = String(e.message || e);
      try {
        await client.query("ROLLBACK");
      } catch {}
    }
  } finally {
    client.release();
  }

  result.ok = true;
} catch (e) {
  result.error = String(e.message || e);
} finally {
  await pool.end();
}

const outPath = ".build-loop/neon-tier-check.json";
mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, JSON.stringify(result, null, 2) + "\n", "utf8");

console.log(JSON.stringify(result, null, 2));
process.exit(result.pgvector_available ? 0 : 1);
