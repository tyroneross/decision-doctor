// Shared Postgres client for the worker process.
//
// We use `pg` (the regular driver) here, NOT @neondatabase/serverless, because:
//   - the worker is a long-running Node process, not a serverless function;
//     the WebSocket pool isn't needed.
//   - pg-boss itself uses `pg` internally — same dep, same pool semantics.
//
// One Pool per process, capped at 5 connections. Adjust if heavy ingest needs more.
import pg from "pg";

let _pool: pg.Pool | null = null;

export function getPool(): pg.Pool {
  if (_pool) return _pool;
  const connectionString =
    process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL_UNPOOLED or DATABASE_URL must be set");
  }
  _pool = new pg.Pool({
    connectionString,
    max: 5,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
    // Neon requires SSL; the URL has ?sslmode=require so the driver wires it up.
  });
  _pool.on("error", (err) => {
    console.error("[pg] pool error:", err);
  });
  return _pool;
}

export async function pingPostgres(): Promise<boolean> {
  try {
    const r = await getPool().query("SELECT 1 AS ok");
    return r.rows[0]?.ok === 1;
  } catch (e) {
    console.error("[pg] ping failed:", e);
    return false;
  }
}

/**
 * Returns the timestamp of the most recent pg-boss job completion, or null.
 * Surfaced in /health for ops visibility.
 */
export async function lastJobAt(): Promise<string | null> {
  try {
    const r = await getPool().query(
      "SELECT MAX(completed_on) AS ts FROM pgboss.archive",
    );
    const ts = r.rows[0]?.ts;
    return ts ? new Date(ts).toISOString() : null;
  } catch {
    // pgboss.archive may not exist yet on first boot. Not fatal.
    return null;
  }
}

export async function closePool(): Promise<void> {
  if (_pool) {
    await _pool.end();
    _pool = null;
  }
}
