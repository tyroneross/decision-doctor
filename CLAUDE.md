# Decision Doctor CC Claude Code Notes

## Current Build Priority

Continue the DD-owned crawler, corpus enrichment, and knowledge-graph pipeline.

Read these before editing code:

1. `docs/handover/2026-05-11-claude-code-crawler-build-brief.md`
2. `docs/architecture/dd-owned-crawler-tool-spec-2026-05-11.md`
3. `docs/handover/2026-05-11-preflight.md`
4. `docs/handover/2026-05-11-corpus-pipeline-state.md`
5. `docs/operations/railway-worker-deploy-playbook.md`

## Non-Negotiable Constraints

- Railway owns crawler, queue, rendering, enrichment, embeddings, and KG extraction.
- Vercel owns UI, auth, chat/search APIs, and lightweight enqueue/read paths only.
- Keep the queue layer on pg-boss. Do not add BullMQ or Redis unless a measured bottleneck proves it is needed.
- Keep crawler code inside `workers/src`. The worker `tsconfig` is scoped to `workers/src`.
- Do not import Interface Built Right as a runtime dependency. Cherry-pick/adapt only the narrow CDP idea if render fallback is implemented.
- Do not add Chromium through Nix `nixPkgs`. If CDP is implemented on Railway, use apt/prebuilt Chromium packaging and keep render concurrency at 1 until measured.
- Respect the `ai_sources.source_kind` CHECK constraint: only `lab_news`, `lab_research`, `paper_index`, `industry_news`, `user_url`, `user_rss`, and `user_file` are valid.
- Discovery methods such as `rss`, `sitemap`, `api`, `html`, `pdf`, and `cdp` belong in `ai_sources.crawl_config`, not `source_kind`.
- `kg-extract` must constrain entity types to the database's allowed set.
- Each job handler must be idempotent and should mark degraded metadata instead of blocking the whole pipeline when one enrichment step fails.

## Validation Default

For worker changes, run from `workers/`:

```bash
pnpm typecheck
pnpm test
```

For deployment-sensitive changes, also review `workers/railway.json`, `/health`, and `/cron-status` behavior.
