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

## Phase 3 — Deploy (⏳ pending)

Vercel preview URL via `vercel link` (logged in as `tyronerossjr`) + `vercel env add` for all 8 env vars + `vercel --prod`.

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
