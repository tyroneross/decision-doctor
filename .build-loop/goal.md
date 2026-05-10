# Goal: Ship Decision Doctor v1 (Branch B) per PRD

**Source PRD**: `./Reference files/decision-doctor-prd.md` (in cc2 working copy; gitignored)
**Branch**: `branch-b` (Branch A is on `main` in another terminal; do NOT touch `main`)
**Hackathon deadline**: 2026-05-12 (MLT20 Round 1)
**Target**: working app on `pnpm dev` — NO Vercel deploy this run. All 7 P0 features + 10 F-criteria tests pass locally.
**Mode**: AUTO. Do not ask between phases. Single end-of-run report.

## Pre-existing scaffold (do NOT rewrite — extend)

Already committed to `branch-b` with verified passing typecheck:
- `shared/schema.ts` — DecisionInput / DecisionOutput Zod
- `lib/db/schema.ts` — multi-tenant Drizzle (users, tenants, decisions, audit_events)
- `lib/db/actor.ts` — AsyncLocalStorage RLS pattern (`runWithActor` + `withActor`)
- `lib/groq.ts` — Groq client (`reasoning_format: parsed`); each engine stage calls `callStage(...)`
- `lib/env.ts` — Zod env validator (add new env vars HERE, never via direct `process.env`)
- `app/api/decisions/route.ts` — STUB to be replaced; preserve `runtime = "nodejs"` and the `runWithActor` wrapper
- `next.config.ts` — PWA wrapper + CSP + headers (`@ducanh2912/next-pwa`)
- `drizzle/0001_enable_rls.sql` — IDEMPOTENT (DROP POLICY IF EXISTS then CREATE), already applied to Neon

## Must-haves (PRD §2A — do not skip)

- **PHI rejection at intake (T-09)** — Zod rejects free-form fields long enough to plausibly contain PHI. Existing `FieldValueSchema` caps strings at 200 chars; verify this catches the test pattern.
- **RLS on every user-owned table (T-08)** — User A's GET on User B's decision id returns 404 (not 403, not 200, not the row). Test against the SHARED Neon DB.
- **Multi-tenant-ready schema** — already preserved in `lib/db/schema.ts`. Do not remove `tenant_id` columns.
- **Composable per-stage engine** — five discrete functions in `lib/engine/` (values, constraints, weights, outranking, ranking). NO mega-prompt that fuses stages.
- **Both auth methods** — magic link AND email/password via Better Auth + Resend. Both shipped.
- **Transparent reasoning UI (F-04)** — `methodTrace` expandable, confidence color-coded (green ≥75 / amber 50–74 / red <50), alternatives + reasons shown, robust alternative visible.
- **`workloadReducers[]` ≥3 per recommendation (T-03)** — already enforced by Zod `.min(3)`.
- **`runtime = "nodejs"`** on `/api/decisions/*` and `/api/auth/*` — Edge runtime breaks the Neon WebSocket pool that RLS depends on (LD-08).
- **Engine latency p95 < 6s (T-03)** — measure; if a single stage blows the budget, parallelize sub-stage prompts or cut prompt length.
- **Per-user Groq rate limit 20/day (T-10)** — in-memory `Map<userId, timestamps[]>` is acceptable for hackathon. 21st call returns 429.

## Nice-to-haves (defer cleanly if blocked; log to `.build-loop/decisions/`)

- **PWA installable (F-07)** — defer to v1.1 if Next 16 × `@ducanh2912/next-pwa` friction. Document in decisions log.
- **Sentry** — production only; we're not deploying. Skip.
- **Custom domain** — N/A this run.
- **Lighthouse PWA score ≥80** — nice-to-have.

## Flexible (your call within PRD constraints)

- UI copy (follow PRD §8 tone — "calm precision", concept-card vocabulary).
- 1 prompt vs 5 prompts per stage (PRD allows either; pick by latency × quality tradeoff per-stage).
- Vitest stays default (already in `package.json`).
- Form field labels and validation messages.

## Known dependency frictions (resolve in Tranche 1, Foundation)

- **better-auth 1.6.10 wants drizzle-orm@^0.45.2** — we have `0.36.4`. Either bump drizzle-orm + drizzle-kit (risk: schema-API breaking changes) OR pin better-auth to a version compatible with drizzle 0.36 (risk: missing features). Recommended: pin better-auth to a 0.x or earlier 1.x release that works with drizzle 0.36 + zod 3 — log decision in `.build-loop/decisions/`.
- **better-call 1.3.5 wants zod@^4.0.0** — we have `3.25.76`. Likely a soft warning at install time but a runtime error if better-call instantiates Zod 4 schemas. Test early.

## Known schema-management friction

- `pnpm db:push` DROPS the RLS policies because they're not declared in `lib/db/schema.ts`. **Fix in Tranche 1**: migrate RLS into schema.ts via drizzle's `pgPolicy()` primitive (drizzle-orm 0.36+ supports it). Until that's done, ALWAYS run `psql "$DATABASE_URL" -f drizzle/0001_enable_rls.sql` after every `pnpm db:push`. Add a `db:rls` script to `package.json` and chain it in `db:migrate` and `db:push`.

## Auto-mode rules

- No `AskUserQuestion` mid-run. Log judgment calls to `.build-loop/decisions/<timestamp>.md` and pick the lower-risk option.
- Validation cleanup register: every dev shortcut opens a `[CLEANUP]` task; resolve before claiming F-criteria green.
- Status markers required in chunk reports: ✅ verified · ⚠️ untested · ❓ uncertain.
- Build-loop's native `/build-loop:assess`, `/build-loop:debug`, `/build-loop:plan-verify` skills fire automatically — do not skip.
- **Public-repo safety**: every implementer commit message AND staged diff gets pre-scanned for the live `.env.local` secret substrings (Groq / Resend / Neon password / Better Auth secret). ABORT if any leak detected. The orchestrator-side guard reads the literal prefixes from local secrets at runtime; they are NOT in this file.
- **Shared-DB migration safety**: if `pnpm db:push` errors mid-run, DO NOT rebuild schema. Log to `.build-loop/decisions/`, skip the migration, continue. Tenant_id RLS isolates the data layer between Branch A and Branch B.
- **Orchestrator commits, not implementers** (parallel-commit race is a known build-loop defect).
- **8-hour budget ceiling**. After exhaustion, report whatever state with honest markers.

## End-of-run report layout (single message, terminal)

1. Branch B build status: ✅ all green / ⚠️ N green M deferred / ❌ blocked
2. Per-criterion table — T-01..T-10 → marker + verification method + commit SHA
3. Open `[CLEANUP]` items
4. Decisions log summary (`.build-loop/decisions/`)
5. Branch-b commit count + last SHA + `git log --oneline`
6. What user does first when waking
7. A vs B comparison hooks — `git diff origin/main..origin/branch-b -- app/ lib/`
