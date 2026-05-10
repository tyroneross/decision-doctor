// Worker entrypoint. Run with `pnpm start` (compiled) or `pnpm dev` (tsx watch).
//
// Boot order:
//   1. Load env (Railway injects directly; .env for local dev).
//   2. Ping Postgres — fail fast if DB is unreachable.
//   3. Start pg-boss queue + register handlers.
//   4. Register cron schedules.
//   5. Start /health HTTP server.
//   6. Wait. Graceful shutdown on SIGINT/SIGTERM.
import { config as loadEnv } from "dotenv";
import { pingPostgres, closePool } from "./db.js";
import { startQueue, stopQueue } from "./queue.js";
import { registerSchedules } from "./cron.js";
import { startHealthServer } from "./health.js";

loadEnv();

const PORT = Number(process.env.PORT ?? 8080);

async function main(): Promise<void> {
  console.log("[worker] booting…");
  console.log("[worker] node:", process.version);
  console.log("[worker] env:", process.env.NODE_ENV ?? "(unset)");

  const pgOk = await pingPostgres();
  if (!pgOk) {
    console.error("[worker] Postgres ping failed at boot. Exiting.");
    process.exit(1);
  }
  console.log("[worker] Postgres reachable");

  await startQueue();
  registerSchedules();
  startHealthServer(PORT);

  console.log("[worker] ready");
}

async function shutdown(signal: string): Promise<void> {
  console.log(`[worker] received ${signal}, shutting down…`);
  try {
    await stopQueue();
    await closePool();
  } catch (e) {
    console.error("[worker] shutdown error:", e);
  }
  process.exit(0);
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));

main().catch((e) => {
  console.error("[worker] fatal:", e);
  process.exit(1);
});
