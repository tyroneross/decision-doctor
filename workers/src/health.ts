// Minimal HTTP health endpoint. Railway pings `/health` per railway.json.
//
// Returns 200 + JSON when:
//   - pg-boss queue is started
//   - we can issue SELECT 1 to Postgres
// Returns 503 + JSON on any underlying failure (still terminates with JSON so
// Railway logs are scannable).
import { createServer } from "node:http";
import type { IncomingMessage, ServerResponse } from "node:http";
import { queueCount } from "./queue.js";
import { pingPostgres, lastJobAt } from "./db.js";

export function startHealthServer(port: number): void {
  const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    if (req.url !== "/health") {
      res.statusCode = 404;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ ok: false, error: "not found" }));
      return;
    }

    const t0 = Date.now();
    const body: Record<string, unknown> = { ok: false, checked_at: new Date().toISOString() };
    let status = 503;
    try {
      const [pgOk, count, lastJob] = await Promise.all([
        pingPostgres(),
        queueCount(),
        lastJobAt(),
      ]);
      body.postgres_ok = pgOk;
      body.pgboss_queue_count = count;
      body.last_job_ts = lastJob;
      body.latency_ms = Date.now() - t0;
      if (pgOk) {
        body.ok = true;
        status = 200;
      } else {
        body.error = "postgres ping failed";
      }
    } catch (e) {
      body.error = String((e as Error).message || e);
    }

    res.statusCode = status;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify(body));
  });

  server.listen(port, () => {
    console.log(`[health] listening on :${port}/health`);
  });
}
