# decision-doctor-workers

Background worker service. Owns:
- **pg-boss queue** — backed by the same Neon Postgres as the app, schema `pgboss`.
- **node-cron schedules** — ingest cadences (F-30 wires the real schedules).
- **Ingest adapters** — arXiv, Anthropic, OpenAI, Perplexity, RSS, URL.
- **`/health` HTTP endpoint** — Railway healthcheck.

## Local dev

```bash
cd workers
pnpm install
cp ../.env.local .env       # or symlink; reads DATABASE_URL + OPENAI_API_KEY
pnpm dev                    # tsx watch src/index.ts
# In another shell:
curl http://localhost:8080/health | jq
pnpm enqueue:arxiv -- "cat:cs.AI" 5
```

## Deploy to Railway

Railway project: `11d80262-9690-428d-ac73-ec689f9d5574`.

```bash
# One-time:
railway link --project 11d80262-9690-428d-ac73-ec689f9d5574
# Create a new service for the worker (name it decision-doctor-workers):
railway service create
# Set the deploy root to workers/ in the Railway dashboard (Service → Settings → Root Directory).
railway variables set \
  DATABASE_URL="$(cat ../.env.local | grep ^DATABASE_URL= | cut -d= -f2-)" \
  DATABASE_URL_UNPOOLED="$(cat ../.env.local | grep ^DATABASE_URL_UNPOOLED= | cut -d= -f2-)" \
  OPENAI_API_KEY="$OPENAI_API_KEY"
railway up --service decision-doctor-workers
```

See `../docs/operations/workers-deploy.md` for the full deploy checklist.

## Architecture

```
src/
  index.ts            entrypoint — boot order
  db.ts               pg.Pool singleton + pingPostgres + lastJobAt
  queue.ts            pg-boss singleton + handler registry
  cron.ts             node-cron schedule registry (currently empty)
  health.ts           HTTP server for /health
  adapters/
    arxiv.ts          arXiv ingest (F-30 proof-of-pattern)
  cli/
    enqueue-arxiv.ts  local test runner — enqueue a fetch and watch logs
```

## Why pg-boss and not BullMQ / Trigger.dev / Inngest?

See ADR-006 (`docs/decisions/`). Single dependency, single DB, no extra infra.

## Why `pg` not `@neondatabase/serverless`?

Workers are long-running processes. The serverless WebSocket pool is built for
short, bursty function invocations. `pg` is what pg-boss uses internally, so we
share a pool instead of running two side-by-side.
