// F-12 — Eval test for F-31 hybrid search.
//
// Two assertions:
//   A. recall@10 ≥ 0.91 across a 20-query eval set against the live corpus.
//   B. BGE_FORCE_TIMEOUT=true exercises the gpt-4o-mini fallback path AND
//      writes ai_search_queries.degraded_reason='bge_timeout'.
//
// Eval set design — each row pairs a natural-language query with the
// titles of corpus documents that SHOULD appear in the top-10. Anchor
// docs are looked up by title at test setup so the test stays stable
// even if document UUIDs change between runs (corpus regenerates).
//
// The recall@10 metric: for each query, |relevant_docs ∩ top10| /
// |relevant_docs|. We average over the 20 queries.
//
// This test exercises the legs + RRF + rerank cascade DIRECTLY (not via
// HTTP) so it doesn't need a running Next.js server. Same composition
// the /api/search route uses.

import { describe, it, expect, beforeAll } from "vitest";
import { sql } from "drizzle-orm";
import { Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import { embedQuery } from "@/lib/ai-knowledge/embed/openai";
import { bm25Search } from "@/lib/ai-knowledge/search/bm25-leg";
import { vectorSearch } from "@/lib/ai-knowledge/search/vector-leg";
import { kgSearch } from "@/lib/ai-knowledge/search/kg-leg";
import { rrfFuse, type LegHit } from "@/lib/ai-knowledge/search/rrf-fusion";
import { rerank } from "@/lib/ai-knowledge/rerank/bge-client";
import { gpt4oRerank } from "@/lib/ai-knowledge/rerank/gpt4o-fallback";
import { runWithActor, withActor } from "@/lib/db/actor";

// Owner-role pool for fixture lookup. Same pattern as tests/rls-isolation.test.ts —
// DATABASE_URL_UNPOOLED bypasses RLS so we can resolve a tenant+user pair without
// needing to set the actor GUC first.
const setupPool = new Pool({
  connectionString:
    process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL!,
  max: 2,
});
const setupDb = drizzle(setupPool);

interface EvalQuery {
  q: string;
  // Each item is a title-substring (case-insensitive) used to identify
  // the relevant doc(s) in the corpus. Multiple substrings = multiple
  // relevant docs.
  relevant: string[];
}

const EVAL_QUERIES: EvalQuery[] = [
  { q: "Claude Opus 4.7 release notes", relevant: ["Introducing Claude Opus 4.7"] },
  { q: "GPT-5.5 launch", relevant: ["Introducing GPT-5.5"] },
  { q: "GPT-5.5 system card", relevant: ["GPT-5.5 System Card"] },
  { q: "Codex for enterprise developers", relevant: ["Scaling Codex to enterprises", "What is Codex", "Working with Codex"] },
  { q: "ChatGPT workspace agents", relevant: ["Introducing workspace agents", "Workspace agents"] },
  { q: "Claude for designers and creative work", relevant: ["Claude Design", "Claude for Creative Work"] },
  { q: "low latency voice AI", relevant: ["low-latency voice AI"] },
  { q: "FedRAMP government compliance OpenAI", relevant: ["FedRAMP"] },
  { q: "agentic workflows websockets responses API", relevant: ["WebSockets in the Responses API"] },
  { q: "Anthropic financial services agents", relevant: ["Agents for financial services"] },
  { q: "rubric grounded reinforcement learning judge rewards", relevant: ["Rubric-Grounded RL"] },
  { q: "text to sql reasoning complexity aware", relevant: ["CA-SQL"] },
  { q: "memory curse LLM agents cooperation", relevant: ["Memory Curse"] },
  { q: "multi agent verification elaboration auditing", relevant: ["MAVEN"] },
  { q: "abductive reasoning probabilistic commonsense", relevant: ["Abductive Reasoning"] },
  { q: "CLI agents structured action credit", relevant: ["Learning CLI Agents"] },
  { q: "phone use agents safety benchmark", relevant: ["Phone-Use Agents"] },
  { q: "multi agent pathfinding communication", relevant: ["Multi-Agent Pathfinding"] },
  { q: "decision making under policy ambiguity retail", relevant: ["DRIP-R"] },
  { q: "intelligence age compute infrastructure", relevant: ["Intelligence Age"] },
];

interface DocLookup {
  id: string;
  title: string;
}

let anchors: Map<string, DocLookup[]> = new Map();
let testUserId: string;
let testTenantId: string;

beforeAll(async () => {
  if (!process.env.DATABASE_URL_APP) {
    throw new Error("DATABASE_URL_APP missing — test cannot run.");
  }
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY missing — test cannot run.");
  }
  // Read corpus title → id map via the owner-role pool (corpus_documents
  // is RLS-protected; owner role bypasses for fixture lookup).
  const rows = await setupDb.execute(sql`
    SELECT id, title FROM corpus_documents
  `);
  const all = rows.rows as unknown as DocLookup[];
  // For each eval row, resolve relevant titles → matching doc ids.
  for (const ev of EVAL_QUERIES) {
    const matches: DocLookup[] = [];
    for (const needle of ev.relevant) {
      const hits = all.filter((d) =>
        d.title.toLowerCase().includes(needle.toLowerCase()),
      );
      if (hits.length === 0) {
        // Eval set is title-substring matched against the live corpus. A
        // missed needle = test design bug or corpus drift — surface loudly.
        throw new Error(
          `Eval anchor missing: no corpus doc title contains "${needle}"`,
        );
      }
      matches.push(...hits);
    }
    anchors.set(ev.q, matches);
  }
  // Resolve a tenant + user from the live DB for RLS context.
  // tenant_id lives on the tenants table (owner_user_id FK), not on users.
  const userRows = await setupDb.execute(sql`
    SELECT t.owner_user_id AS user_id, t.id AS tenant_id
      FROM tenants t
     LIMIT 1
  `);
  const user = userRows.rows[0] as
    | { user_id: string; tenant_id: string }
    | undefined;
  if (!user) {
    throw new Error("F-12 needs at least one user row in users table.");
  }
  testUserId = user.user_id;
  testTenantId = user.tenant_id;
}, 30_000);

interface PipelineResult {
  doc_ids: string[];
  degraded: boolean;
  degraded_reason: string | null;
}

async function runPipeline(
  query: string,
  limit = 10,
  opts: { skipRerank?: boolean } = {},
): Promise<PipelineResult> {
  const embedding = await embedQuery(query);
  const [bm25Hits, vectorHits, kgHits] = await Promise.all([
    runWithActor(
      { userId: testUserId, tenantId: testTenantId },
      async () => withActor((tx) => bm25Search(tx, query, 20)),
    ).catch(() => []),
    runWithActor(
      { userId: testUserId, tenantId: testTenantId },
      async () => withActor((tx) => vectorSearch(tx, embedding, 20)),
    ).catch(() => []),
    runWithActor(
      { userId: testUserId, tenantId: testTenantId },
      async () => withActor((tx) => kgSearch(tx, query, 20)),
    ).catch(() => []),
  ]);
  const fused = rrfFuse({
    bm25: bm25Hits as LegHit[],
    vector: vectorHits as LegHit[],
    kg: kgHits as LegHit[],
  });
  const candidateIds = fused.slice(0, 30).map((f) => f.doc_id);
  if (candidateIds.length === 0) {
    return { doc_ids: [], degraded: false, degraded_reason: null };
  }
  if (opts.skipRerank) {
    return {
      doc_ids: candidateIds.slice(0, limit),
      degraded: false,
      degraded_reason: null,
    };
  }
  const hydratedRows = await setupDb.execute(sql`
    SELECT id, title, body FROM corpus_documents WHERE id IN (${sql.join(
      candidateIds.map((id) => sql`${id}::uuid`),
      sql`, `,
    )})
  `);
  const hydrated = new Map<string, { title: string; body: string }>();
  for (const r of hydratedRows.rows as Array<{
    id: string;
    title: string;
    body: string;
  }>) {
    hydrated.set(r.id, { title: r.title, body: r.body });
  }
  const reranked = await rerank(
    {
      query,
      docs: candidateIds.flatMap((id) => {
        const row = hydrated.get(id);
        return row
          ? [{ id, text: `${row.title}\n\n${row.body}`.slice(0, 1500) }]
          : [];
      }),
    },
    gpt4oRerank,
  );
  return {
    doc_ids: reranked.doc_ids.slice(0, limit),
    degraded: reranked.degraded,
    degraded_reason: reranked.degraded_reason,
  };
}

// Recall@10 target — the F-31 brief asks for ≥0.91. Empirically, with the
// current corpus state (50/121 docs have body = 58-char CDP-loader
// placeholder, so their embeddings carry no semantic signal beyond the
// 58 chars), fusion + rerank ceiling is ~0.82. The shortfall is a
// corpus-data quality issue (backend crawler responsibility), NOT a
// retrieval-pipeline issue — proven by the fusion-only diagnostic
// returning the same recall as fusion+rerank. See
// docs/handover/f31-recall-escalation.md for the full analysis +
// decision request to the user.
//
// Threshold stays at 0.91 to keep this test honest: it WILL fail until
// the OpenAI docs have real bodies. Set RECALL_TARGET=0.80 in the env
// to dial the threshold down for local iteration without committing.
const RECALL_TARGET = Number(process.env.RECALL_TARGET ?? "0.91");

describe("F-31 hybrid search — recall@10", () => {
  it(
    "fusion-only diagnostic: skip rerank, measure RRF top-10 recall",
    async () => {
      const perQuery: { q: string; recall: number; missed: string[] }[] = [];
      for (const ev of EVAL_QUERIES) {
        const relevant = anchors.get(ev.q)!;
        const relevantIds = new Set(relevant.map((d) => d.id));
        const top = await runPipeline(ev.q, 10, { skipRerank: true });
        const hits = top.doc_ids.filter((id) => relevantIds.has(id)).length;
        const recall = hits / relevantIds.size;
        const missed = relevant
          .filter((d) => !top.doc_ids.includes(d.id))
          .map((d) => d.title);
        perQuery.push({ q: ev.q, recall, missed });
      }
      const overall =
        perQuery.reduce((s, r) => s + r.recall, 0) / perQuery.length;
      console.log(
        "[F-12 fusion-only] per-query recall:\n" +
          perQuery
            .map(
              (r) =>
                `  ${r.recall.toFixed(2)} | ${r.q}` +
                (r.missed.length ? ` (missed: ${r.missed.join(", ")})` : ""),
            )
            .join("\n") +
          `\n  fusion-only recall@10 = ${overall.toFixed(3)}`,
      );
      // Diagnostic only; no hard assertion. Useful to compare against
      // post-rerank recall to localize regressions.
      expect(overall).toBeGreaterThan(0);
    },
    180_000,
  );

  it(
    "achieves recall@10 ≥ 0.91 across 20 anchor queries",
    async () => {
      const perQueryRecall: { q: string; recall: number; missed: string[] }[] =
        [];
      for (const ev of EVAL_QUERIES) {
        const relevant = anchors.get(ev.q)!;
        const relevantIds = new Set(relevant.map((d) => d.id));
        const top = await runPipeline(ev.q, 10);
        const hits = top.doc_ids.filter((id) => relevantIds.has(id)).length;
        const recall = hits / relevantIds.size;
        const missed = relevant
          .filter((d) => !top.doc_ids.includes(d.id))
          .map((d) => d.title);
        perQueryRecall.push({ q: ev.q, recall, missed });
      }
      const overall =
        perQueryRecall.reduce((s, r) => s + r.recall, 0) /
        perQueryRecall.length;
      // Log perf so reviewers see which queries struggle.
      console.log(
        "[F-12] per-query recall:\n" +
          perQueryRecall
            .map(
              (r) =>
                `  ${r.recall.toFixed(2)} | ${r.q}` +
                (r.missed.length ? ` (missed: ${r.missed.join(", ")})` : ""),
            )
            .join("\n") +
          `\n  overall recall@10 = ${overall.toFixed(3)}`,
      );
      expect(overall).toBeGreaterThanOrEqual(RECALL_TARGET);
    },
    300_000,
  );
});

describe("F-31 hybrid search — degraded fallback", () => {
  it(
    "BGE_FORCE_TIMEOUT=true falls back to gpt-4o-mini and reports degraded_reason='bge_timeout'",
    async () => {
      const prevForce = process.env.BGE_FORCE_TIMEOUT;
      const prevEnabled = process.env.BGE_ENABLED;
      process.env.BGE_ENABLED = "true";
      process.env.BGE_FORCE_TIMEOUT = "true";
      try {
        const result = await runPipeline("Claude Opus 4.7", 10);
        expect(result.doc_ids.length).toBeGreaterThan(0);
        expect(result.degraded).toBe(true);
        expect(result.degraded_reason).toBe("bge_timeout");
      } finally {
        // Restore env so subsequent tests aren't polluted.
        if (prevForce === undefined) delete process.env.BGE_FORCE_TIMEOUT;
        else process.env.BGE_FORCE_TIMEOUT = prevForce;
        if (prevEnabled === undefined) delete process.env.BGE_ENABLED;
        else process.env.BGE_ENABLED = prevEnabled;
      }
    },
    60_000,
  );
});
