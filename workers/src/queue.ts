// pg-boss singleton + job-handler registration.
//
// We use pg-boss against the same Neon database as the main app. pg-boss
// creates its own `pgboss` schema on first start — no manual migration needed.
//
// Queue jobs are registered here. Each handler should be small + crash-safe;
// long-running work should chunk itself across multiple jobs.
import PgBoss from "pg-boss";
import { fetchArxivQuery } from "./adapters/arxiv.js";
import { handleArxivEmbed } from "./adapters/arxiv-embed.js";

let _boss: PgBoss | null = null;
let _started = false;

export function getBoss(): PgBoss {
  if (_boss) return _boss;
  const connectionString =
    process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      "DATABASE_URL_UNPOOLED or DATABASE_URL must be set for pg-boss",
    );
  }
  _boss = new PgBoss({
    connectionString,
    // Neon serverless / pooled connections cause idle-connection churn; we use
    // the unpooled URL here so pg-boss owns its own long-lived connection.
    schema: "pgboss",
    retentionDays: 7,
  });
  _boss.on("error", (err) => {
    // Never throw; pg-boss surfaces non-fatal errors here. Log + carry on.
    console.error("[pg-boss] error:", err);
  });
  return _boss;
}

export async function startQueue(): Promise<PgBoss> {
  const boss = getBoss();
  if (_started) return boss;
  await boss.start();
  _started = true;

  // pg-boss v10 requires explicit createQueue() before send/work.
  // Idempotent — safe to re-run.
  await boss.createQueue("arxiv-fetch");
  await boss.createQueue("arxiv-embed");
  await boss.createQueue("test-job");

  // ---- Register handlers --------------------------------------------------
  // arxiv-fetch: ingest arXiv papers matching a query.
  // Payload: { query: string; scope?: string; maxResults?: number }
  // Chains: each newly-ingested corpus_documents row → enqueue arxiv-embed.
  await boss.work<{ query: string; scope?: string; maxResults?: number }>(
    "arxiv-fetch",
    { batchSize: 1 },
    async (jobs) => {
      const results = [];
      for (const job of jobs) {
        const r = await fetchArxivQuery({
          query: job.data.query,
          scope: job.data.scope ?? "global",
          maxResults: job.data.maxResults ?? 25,
        });
        // Chain: enqueue an arxiv-embed job for each new document.
        // Idempotent at the handler level — replays hit the content_hash
        // cache and insert zero new chunks.
        for (const docId of r.ingestedIds) {
          await boss.send("arxiv-embed", { documentId: docId });
        }
        results.push({ id: job.id, ...r });
      }
      console.log("[arxiv-fetch] processed:", JSON.stringify(results));
      return results;
    },
  );

  // arxiv-embed: chunk + embed a single corpus_documents row.
  // Payload: { documentId: string }
  // batchSize=1 to bound OpenAI throughput; pg-boss serializes per queue.
  await boss.work<{ documentId: string }>(
    "arxiv-embed",
    { batchSize: 1 },
    async (jobs) => {
      const out = [];
      for (const job of jobs) {
        const r = await handleArxivEmbed({ documentId: job.data.documentId });
        out.push({ id: job.id, ...r });
      }
      return out;
    },
  );

  // test-job: round-trips its payload. Used by tests and `pnpm enqueue:test`.
  await boss.work<{ echo: string }>("test-job", async (jobs) => {
    const out = jobs.map((j) => ({ ok: true, echo: j.data.echo, id: j.id }));
    console.log("[test-job] handled:", JSON.stringify(out));
    return out;
  });

  console.log("[pg-boss] queue started, handlers registered");
  return boss;
}

export async function stopQueue(): Promise<void> {
  if (_boss && _started) {
    await _boss.stop({ graceful: true, timeout: 5000 });
    _started = false;
    _boss = null;
  }
}

export async function queueCount(): Promise<number> {
  if (!_boss || !_started) return 0;
  // pg-boss doesn't expose a single count; we approximate via the active queues.
  const queues = ["arxiv-fetch", "arxiv-embed", "test-job"];
  let total = 0;
  for (const q of queues) {
    const size = await _boss.getQueueSize(q);
    total += size ?? 0;
  }
  return total;
}
