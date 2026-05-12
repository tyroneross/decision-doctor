# Workers — Railway Deploy

The `workers/` service runs the background queue + ingest. Deploy steps are
manual (Railway API access not wired into this dispatch).

## One-time setup

```bash
# Authenticate (skip if already done):
railway login

# Link this checkout to the existing Railway project:
cd /Users/tyroneross/dev/git-folder/decision-doctor-cc
railway link --project 11d80262-9690-428d-ac73-ec689f9d5574

# Create a new service for the worker:
railway service create
# When prompted, name it: decision-doctor-workers
# Then in the Railway dashboard:
#   Service → Settings → Source → Root Directory: workers
#   Service → Settings → Build → Builder: Nixpacks
#   Service → Settings → Deploy → Healthcheck Path: /health
```

## Environment variables

Set these on the worker service (Railway dashboard → Variables, or via CLI):

| Key | Source | Notes |
|-----|--------|-------|
| `DATABASE_URL` | `.env.local` | Pooled URL — used by /health and reads |
| `DATABASE_URL_UNPOOLED` | `.env.local` | Unpooled URL — required by pg-boss for long-lived connections |
| `OPENAI_API_KEY` | secrets-vault | Required for embedding adapter (Move 5 follow-up) |
| `NODE_ENV` | hardcoded `production` | |
| `LOG_LEVEL` | optional, default `info` | |

```bash
# CLI alternative — read keys directly from .env.local:
source <(grep -E '^(DATABASE_URL|DATABASE_URL_UNPOOLED)=' .env.local | sed 's/^/export /')
railway variables set \
  DATABASE_URL="$DATABASE_URL" \
  DATABASE_URL_UNPOOLED="$DATABASE_URL_UNPOOLED" \
  OPENAI_API_KEY="$OPENAI_API_KEY" \
  NODE_ENV=production
```

## Deploy

```bash
cd workers
railway up --service decision-doctor-workers
```

The first deploy will:
1. Run `pnpm install --frozen-lockfile && pnpm build` (Nixpacks)
2. Start `pnpm start` (which runs `node dist/index.js`)
3. Hit `/health` to verify the service is ready (timeout: 30s)
4. pg-boss creates its `pgboss` schema in Neon on first connection — no manual migration

## Verify

```bash
railway run --service decision-doctor-workers -- curl -sf http://localhost:8080/health | jq
# Expected: { "ok": true, "postgres_ok": true, "pgboss_queue_count": 0, "last_job_ts": null, ... }
```

## Trigger a test ingest

```bash
# From local laptop, against prod Railway worker — pg-boss reads from the same Neon DB:
cd workers && pnpm enqueue:arxiv -- "cat:cs.AI" 5
# Then check the worker logs in Railway and verify rows in Neon:
psql "$DATABASE_URL_UNPOOLED" -c "SELECT count(*) FROM corpus_documents WHERE source_type='arxiv';"
```

## Rollback

```bash
railway rollback --service decision-doctor-workers
```
