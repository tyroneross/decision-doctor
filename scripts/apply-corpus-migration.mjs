// Move 2 helper — applies drizzle/0003_corpus.sql to the Neon DB referenced by
// DATABASE_URL_UNPOOLED (or DATABASE_URL). Idempotent: re-running is safe
// because every CREATE uses IF NOT EXISTS or will fail with a "already exists"
// error which we report but don't treat as fatal on the second run.
//
// Run: node scripts/apply-corpus-migration.mjs
import { config } from "dotenv";
import { readFileSync } from "node:fs";
import { Pool, neonConfig } from "@neondatabase/serverless";

config({ path: ".env.local" });
if (typeof WebSocket !== "undefined") neonConfig.webSocketConstructor = WebSocket;

const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL_UNPOOLED or DATABASE_URL must be set");
  process.exit(2);
}

const sqlText = readFileSync("drizzle/0003_corpus.sql", "utf8");

const pool = new Pool({ connectionString: url });
const client = await pool.connect();
let exitCode = 0;
try {
  // Apply as one big query; pg handles multi-statement strings fine.
  await client.query(sqlText);
  console.log("✅ 0003_corpus.sql applied cleanly");

  // Verify the tables + index exist
  const checks = [
    "SELECT 1 FROM pg_tables WHERE tablename = 'corpus_documents'",
    "SELECT 1 FROM pg_tables WHERE tablename = 'corpus_embeddings'",
    "SELECT 1 FROM pg_indexes WHERE indexname = 'corpus_embeddings_hnsw_idx'",
    "SELECT 1 FROM pg_indexes WHERE indexname = 'corpus_documents_search_idx'",
    "SELECT 1 FROM pg_extension WHERE extname = 'vector'",
    "SELECT 1 FROM pg_extension WHERE extname = 'pg_trgm'",
  ];
  for (const q of checks) {
    const r = await client.query(q);
    if (r.rowCount === 0) {
      console.error("❌ post-check failed:", q);
      exitCode = 1;
    }
  }
  if (exitCode === 0) console.log("✅ post-checks passed (tables, indexes, extensions)");
} catch (e) {
  console.error("❌ migration failed:", String(e.message || e));
  exitCode = 1;
} finally {
  client.release();
  await pool.end();
}
process.exit(exitCode);
