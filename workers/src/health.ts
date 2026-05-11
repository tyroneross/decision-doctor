// Minimal HTTP server: /health + /cron-status + /rerank.
//
// /health — 200 when Postgres is reachable and pg-boss is up; 503 otherwise.
// /cron-status — always 200, snapshot of registered cron schedules.
// /rerank — POST, BGE cross-encoder reranker (F-7). Lazy-loads the model on
//   first request; reports load state through /health.bge.
//
// Why one server: Railway pings /health per railway.json; the worker is a
// long-running Node process anyway; adding another listener for /rerank would
// burn an extra port without gain. Express/Fastify would be overkill for
// three routes. node:http stays in the dep tree we already pay for.
import { createServer } from "node:http";
import type { IncomingMessage, ServerResponse } from "node:http";
import { queueCount } from "./queue.js";
import { pingPostgres, lastJobAt } from "./db.js";
import { getCronStatus } from "./cron.js";
import { rerank, bgeStatus, type RerankRequest } from "./rerank/bge-server.js";

const MAX_RERANK_BODY_BYTES = 5 * 1024 * 1024; // 5 MB ceiling; > any realistic batch

function readJsonBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let received = 0;
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => {
      received += chunk.length;
      if (received > MAX_RERANK_BODY_BYTES) {
        reject(new Error(`body exceeds ${MAX_RERANK_BODY_BYTES} bytes`));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8");
      if (!raw) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch (e) {
        reject(new Error("invalid JSON body"));
      }
    });
    req.on("error", reject);
  });
}

export function startHealthServer(port: number): void {
  const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    if (req.url === "/cron-status") {
      res.statusCode = 200;
      res.setHeader("content-type", "application/json");
      res.end(
        JSON.stringify({
          ok: true,
          schedules: getCronStatus(),
          checked_at: new Date().toISOString(),
        }),
      );
      return;
    }

    if (req.url === "/rerank") {
      if (req.method !== "POST") {
        res.statusCode = 405;
        res.setHeader("content-type", "application/json");
        res.setHeader("allow", "POST");
        res.end(JSON.stringify({ error: "method_not_allowed" }));
        return;
      }
      try {
        const body = (await readJsonBody(req)) as RerankRequest;
        const out = await rerank(body);
        res.statusCode = 200;
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify(out));
      } catch (e) {
        const msg = (e as Error).message ?? "rerank failed";
        console.error("[rerank] error:", msg);
        res.statusCode = 400;
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify({ error: "rerank_failed", message: msg }));
      }
      return;
    }

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
      body.bge = bgeStatus();
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
    console.log(`[health] listening on :${port}/health, /cron-status, /rerank`);
  });
}
