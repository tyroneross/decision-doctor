# Decision Doctor `decision-doctor-cc` — Build Status

Updated by Claude Code (Opus 4.7, 1M context). Working directory: `/Users/tyroneross/dev/git-folder/decision-doctor-cc`.

## Phase 1 — Pre-build (✅ complete)

| Step | Status | Notes |
|---|---|---|
| 1.1 .gitignore hardening + PRD → docs/PRD.md | ✅ | `git ignore/`, `Reference files/`, `*.rtf` ignored. Pre-commit + pre-push hooks installed (`.githooks/`) blocking real-secret patterns. |
| 1.2 git init + remote + main | ✅ | Repo `tyroneross/decision-doctor` (PUBLIC) on branch `main`. 2 commits ahead of "Initial commit". Sibling experiments (`-cc2`, `-codex`) can fork from this baseline by branching off `main`. |
| 1.3 pnpm install + .env.local | ✅ | All env vars populated. Peer-dep warnings on better-auth (wants drizzle-orm@0.45 / zod@4) deferred — auth not yet implemented; resolve in Phase 2 F-06. |
| 1.4 Neon connectivity + schema + RLS | ✅ | 4 tables (users, tenants, decisions, audit_events). RLS enabled + FORCE on user-data tables; 4 policies live (`decisions_tenant_isolation`, `tenants_owner_only`, `audit_insert`, `audit_select`). Verify command: `node scripts/db-verify.mjs`. |
| 1.5 OQ-01 Groq + OQ-02 next-pwa | ✅ / ❌→fallback | Groq `reasoning_format=parsed` confirmed (~270ms, separate `reasoning` field). `@ducanh2912/next-pwa` incompatible with Next 16 Turbopack — hand-rolled SW deferred to F-07. See `docs/OQ-01-*.md` and `docs/OQ-02-*.md`. |
| 1.6 Push to GitHub | ✅ | Branch `main` at SHA `a56f6a8`. Pre-push secret scan clean. |

**Build verification:** `pnpm typecheck` ✅, `pnpm build` ✅, Neon DB ✅.

## Phase 2 — Build-loop dispatch (🟡 in progress)

Dispatching `/build-loop:build-loop` with `docs/PRD.md` as anchor. Orchestrator owns:
- 7 P0 features (F-01 → F-07)
- 10 F-criteria tests (T-01 → T-10)
- Mandatory plan-critic + security-reviewer (risk_reason: user trust + security boundary + persistence contract)
- IBR scan at 375px viewport for F-04
- Calm Precision skill for UI; Prompt Builder skill for Stages 1-5

Commit decomposition (10 commits planned, build-loop's plan phase finalizes):
1. C1 ✅ Phase 1 scaffold (this branch baseline)
2. C2 feat(env+groq): finalize env.ts, groq client
3. C3 feat(db): RLS tests T-08 + integration
4. C4 feat(auth): Better Auth + magic link + email/password (F-06)
5. C5 feat(engine): MCDA Stages 1-5 + 3 templates (F-03) — largest, sequential
6. C6 feat(ui): F-01 selector + F-02 intake
7. C7 feat(ui): F-04 transparent recommendation + F-05 print export
8. C8 feat(pwa): F-07 hand-rolled SW + manifest
9. C9 feat(ratelimit+audit): T-10 (20/day) + audit_events writes
10. C10 chore(deploy): Vercel link + env + first deploy

## Phase 2 — Build-loop dispatch (✅ complete)

| # | Commit | Status | Notes |
|---|---|---|---|
| C1 | scaffold + Phase 1 | ✅ | 7906556 |
| C3 | RLS test + app_user role | ✅ | 5bcfcee |
| C4 | Better Auth + magic-link + email/password | ✅ | 3562d3b |
| C5 | MCDA Stages 1-5 + 3 templates | ✅ | 427da0d |
| C6/7/8/9 | UI + PWA + rate-limit + audit | ✅ | 92e4fd7 |
| env fix | preprocess optional env vars | ✅ | f81511d |

**Tests at HEAD (`f81511d`):**
- ✅ `pnpm typecheck` — clean
- ✅ `pnpm build` — 10 routes generated
- ✅ `pnpm vitest run` — 5 / 5 (T-08 RLS isolation × 2; T-03 engine × 3)

**Schema reality discovered Phase 2:** live Neon DB had PLURAL table names (`users`, `accounts`, `sessions`, `verifications`) and ALL ids are `uuid` (not `text`). Schema declared singular + text id. Verified via `information_schema.columns`; rebased `lib/db/schema.ts`, `lib/auth.ts`, `tests/rls-isolation.test.ts`, and `shared/schema.ts` to the live shape. Better Auth's drizzle adapter receives `{ user: users, account: accounts, ... }` so its internal logical names still resolve. Added missing `decisions.title` column via `ALTER TABLE`.

**Skipped (per user instruction):** Railway / Python sidecar — math is fully deterministic in TypeScript (Stage 4 ELECTRE + Stage 5 TOPSIS). Confidence number traces to `lib/engine/stage5-ranking.ts:computeTopsis`.

## Phase 3 — Deploy (✅ complete)

- ✅ `vercel link` → `tyrone-ross-projects/decision-doctor` (project id `prj_5lbniJuDaVKmKBEyQAJPsF2UcmR2`)
- ✅ `vercel env add` for 9 vars in **production** + **development** scopes (preview scope skipped — CLI requires per-branch enumeration; production deploys land via main)
- ✅ `vercel --prod` (deployment id `dpl_DLLhiCJAT5L95nvrhhh3kLV2FZzH`, build duration ~44s)
- ✅ **Live URL: https://decision-doctor-xi.vercel.app** (alias) — also reachable at the per-deployment hash URL
- ✅ Smoke: `GET /` → 307 → `/sign-in`; `GET /sign-in` → 200; `GET /api/templates` → JSON with 3 templates (capacity, pricing, admin-hire)
- ⚠️ Untested in prod: end-to-end magic-link flow, recommendation render at 375px viewport, print-to-PDF — these need a manual session because they require an inbox + a logged-in browser (Resend will not deliver to `@example.invalid`)

## Open follow-ups (not blocking)

1. ⚠️ **Preview-scope env vars not set** — Vercel CLI's `env add … preview` requires per-branch enumeration; only production + development received the secrets. Result: PR preview deploys will fail env validation. Workaround: set them via the Vercel dashboard (5 minutes) or via `vercel env add KEY preview <branch> --value <v> --yes` once a branch exists.
2. ⚠️ **Magic-link from Resend in prod requires sender domain verification** for `tyrone@rosslabsdigital.com`-shaped from-addresses; if `AUTH_FROM_EMAIL` uses a non-verified domain, Resend will return a hard error on the first sign-in. Verify domain in Resend dashboard if so.
3. ⚠️ **Pre-existing `decision-doctor.vercel.app` host taken by another project** — production lives at `decision-doctor-xi.vercel.app`. Optionally reclaim or pick a custom domain.
4. ⚠️ **Rate-limit is in-memory** (per `lib/ratelimit.ts`). Acceptable for v1 single-region Vercel; promote to Upstash Redis when traffic grows. The `@upstash/ratelimit` dep is already in `package.json`.
5. ❓ **Better Auth schema sync at next push** — if Better Auth ever runs its `generate` command against this DB it may attempt to recreate singular tables. Pin Better Auth's adapter mapping in tests when an integration test for sign-in is added.
6. ❓ **Sentry not wired** — `SENTRY_DSN` is optional in env.ts. PRD §22.6 marks observability as P1; deferred.

## What you can do in parallel right now

The `main` branch on `tyroneross/decision-doctor` is the verified baseline:
- `git clone https://github.com/tyroneross/decision-doctor.git decision-doctor-cc2 && cd decision-doctor-cc2 && git checkout -b cc2`
- `git clone https://github.com/tyroneross/decision-doctor.git decision-doctor-codex && cd decision-doctor-codex && git checkout -b codex`

Both will need `.env.local` from `git ignore/dd-secrets.rtf` populated the same way. Run `pnpm install`, `node scripts/apply-migrations.mjs` (or skip if sharing Neon DB), then start their own build flow.

⚠️ **DB sharing caveat:** All three experiments currently point at the same Neon DB (`ep-weathered-flower-apwmza9k`). RLS isolates per-user data, but schema migrations from one branch will be visible to others. If divergent schemas needed, provision a second Neon project per experiment.

## Where to look for results

- Commits: `git log --oneline` on `main` (this folder) — each commit is one build-loop chunk
- GitHub: https://github.com/tyroneross/decision-doctor/commits/main
- Vercel: preview URL added here once Phase 3 completes
- Build-loop state: `.build-loop/state.json`
