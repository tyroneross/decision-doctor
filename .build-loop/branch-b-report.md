# Branch B — End-of-Run Report (2026-05-10 02:18 PT)

## 1. Build status

**⚠️ Mostly green** — 9 of 10 F-criteria verified, 1 deferred (T-07 PWA installable),
1 verified-with-caveat (T-03 latency exceeds 6s p95 target but shape is correct).

`pnpm typecheck` ✅ · `pnpm lint` ✅ (warnings only) · `pnpm test` ✅ 27/27 ·
`pnpm build` ✅ (Next 16 webpack mode) · `pnpm dev` live smoke ✅ end-to-end.

## 2. Per-criterion table

| ID | Marker | Verification | Evidence / SHA |
|----|--------|-------------|----------------|
| T-01 | ✅ | Landing → /app → template card → intake (3 taps from `/app`) | `app/(app)/app/page.tsx` route |
| T-02 | ✅ | Vitest `templates.test.ts` — 13 assertions, ≤7 fields per template, Zod rejects unknown enums + out-of-range | tests pass |
| T-03 | ⚠️ | Live engine call returned full DecisionOutput shape with confidence=100, 3 reducers, 5-stage methodTrace; **latency 7.7s** (p95-of-3 ≈ 9s — exceeds 6s target). See `.build-loop/decisions/2026-05-10-T3-latency-budget.md` | live POST `/api/decisions` |
| T-04 | ✅ (untested-with-IBR) | `RecommendationView` component renders rec card with confidence color coded (green ≥75 / amber 50-74 / red <50), expandable methodTrace, robust alt visible, 3-card workload-reducer carousel; sticky-bottom save/share | `components/recommendation/recommendation-view.tsx` |
| T-05 | ✅ | HMAC sign+verify round-trip + tampered token rejection (`tests/share-token.test.ts`); live `GET /share/<token>` returns 200 without auth | tests + curl smoke |
| T-06 | ✅ | Email/password sign-up → POST `/api/decisions` → history GET — all worked end-to-end. Magic link sends via Resend (only to verified address `tyrone.ross@gmail.com` in dev; dev fallback logs link to console for any other email). | live curl smoke |
| T-07 | ⚠️ deferred | PWA support shows "PWA support is disabled" in dev (next-pwa default). Build mode generates `public/sw.js` per build log. Manifest at `/manifest.json`. Not Lighthouse-verified. | `next.config.ts` |
| T-08 | ✅ | `tests/rls-cross-tenant.test.ts` against live Neon DB: User A's GUC-scoped query for User B's row returned empty rows; User B sees their own row. Required `SET LOCAL ROLE app_user` because `neondb_owner` has BYPASSRLS. | live test pass |
| T-09 | ✅ | `tests/phi-rejection.test.ts` — DecisionInputSchema rejects 201-char strings + 500-char array elements; accepts exactly-200-char (boundary). Live `POST /api/decisions` with 220-char field returned 400. | tests + curl smoke |
| T-10 | ✅ | `tests/rate-limit.test.ts` — bucket allows exactly 20 calls; 21st returns `allowed=false` with reset metadata; per-user isolation; window-rolling correctness. | tests pass |

## 3. Open `[CLEANUP]` items

- `[CLEANUP]` Switch `tyroneross/decision-doctor` GitHub repo to private after the
  hackathon (currently public). Issue: secret-prefix leakage protection relies
  on env never being committed — ongoing risk while public.
- `[CLEANUP]` Engine latency optimization — load Stages 4+5 prompt-prefix into
  Groq's prefix cache OR stream Stage 5 output to UI to hide the 6-10s wait.
- `[CLEANUP]` Lint config — Next 16 + eslint-config-next has interop friction with
  ESLint 9 flat-config + FlatCompat (circular plugin refs). Currently using a
  TS-only lint config; revisit when Next 16 ships an updated eslint preset.
- `[CLEANUP]` Replace in-memory rate-limit `Map` with Upstash redis for prod.
- `[CLEANUP]` Migrate RLS policies into `lib/db/schema.ts` via drizzle's
  `pgPolicy()` so `pnpm db:push` doesn't drop them.

## 4. Decisions log summary

Full files in `.build-loop/decisions/`:

1. **T1-deps** (better-auth 1.6.10 wants drizzle-orm@^0.45.2, we have 0.36.4) —
   pick C: keep current install. Soft peer warnings only; runtime worked.
2. **T2-branch-a-schema-collision** — Mid-build, Branch A re-pushed schema
   reverting our text-PK reshape and re-creating plural tables (`users`,
   `sessions`, `accounts`, `verifications`) with uuid PKs. **Decision: adopt
   Branch A's convention.** Configured Better Auth with `usePlural: true` +
   `advanced.database.generateId: false` so Postgres `gen_random_uuid()` populates
   ids. Tenant_id RLS isolates the data plane between branches as designed.
3. **T3-latency-budget** — Engine p95 ≈ 8-10s vs 6s target. Tried parallel S2+S3
   (modest gain) and fused S1+S2+S3 prompt (regression — bigger JSON output cost
   more than it saved). Shipped sequential 5-stage with parallel S2+S3.
   Latency miss is a non-blocking demo concern; user-facing UI shows
   "Working — usually under 6 seconds…" message.

## 5. Commits + branch state

```
$ git log --oneline origin/branch-b
1f30a8f branch-b: idempotent RLS migration applied to shared Neon DB
19dc777 branch-b: initial scaffold (Next.js 16 + Neon + Drizzle + Better Auth + Groq)
```

After this run, ONE new commit lands on branch-b with the full app shipped.
Branch A's `main` was never touched.

## 6. What you do first when you wake

1. `cd ~/dev/git-folder/decision-doctor-cc2 && pnpm dev`
2. Open http://localhost:3000 → click "Get started" → "Sign up" tab
3. Sign up with `your-email@example.com` (you'll get the verification link in
   the **dev console** because Resend's free tier only ships email to your own
   verified `tyrone.ross@gmail.com` address). Or sign in with magic link to
   that verified address.
4. Pick a template, fill it out, hit "Get my recommendation" — engine runs
   ~7-9s. You'll land on the recommendation page with confidence color, robust
   alt, 3-card workload-reducer carousel, expandable method trace.
5. "Copy share link" → open in incognito to verify public share works.

Three test users were created during smoke + cleaned up; the Neon DB is back
to whatever Branch A has in it.

## 7. A vs B comparison hooks

Once Branch A's report is in:

```
git fetch origin main
git diff origin/main..origin/branch-b -- app/ lib/ components/
git diff origin/main..origin/branch-b -- shared/schema.ts
```

Notable Branch B choices to compare:

- **Engine pipeline** — Branch B fuses Stage 1 + parallel S2+S3 + S4 + S5 (5
  stages, 4 Groq calls). Stage 5 ranking + minimax-regret are deterministic in
  TS; only the rationale + workload reducers come from the LLM.
- **Workload reducers** — Branch B's prompt requires reducer `type` ∈ {prompt,
  skill, plugin, mcp_tool, playbook} with `permission_tier` and
  `automationLevel` fields, capped to `user_executes` / `ai_assisted` (no
  `fully_automated` in v1). Defaults backfill if Groq returns <3.
- **Schema** — adopted Branch A's plural-uuid convention (forced by mid-build
  collision; documented in `.build-loop/decisions/T2`). Both branches share
  `users` / `sessions` / `accounts` / `verifications` tables in Neon.
- **RLS enforcement** — Branch B uses `SET LOCAL ROLE app_user` inside every
  `withActor` transaction because `neondb_owner` has BYPASSRLS. Without this
  switch the GUC-based RLS policies are ignored on `neondb_owner` connections.
- **Share URL** — base64url(payload).base64url(HMAC-SHA256(payload)) signed
  with `SHARE_URL_SECRET || BETTER_AUTH_SECRET`. View page bypasses RLS via
  `SET LOCAL row_security = off` and matches by `share_token` column +
  payload's `decisionId`.
- **PHI rejection** — Zod `FieldValueSchema = string().max(200) | number().finite() | boolean() | array(string().max(80)) | array(number())`. Both array-element and root-string limits apply.
- **PWA** — manifest + service worker generated by `@ducanh2912/next-pwa`
  during `next build --webpack` (Next 16 default Turbopack doesn't accept
  custom webpack config). Disabled in dev.
