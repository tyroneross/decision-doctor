# Security Best Practices Report

Date: 2026-05-11
Repo: `/Users/tyroneross/dev/git-folder/decision-doctor-cc`

## Executive Summary

No live-looking tracked secrets were found in the current tree or scanned git history. The main app auth/database path is in decent shape: Better Auth signup, tenant provisioning, RLS isolation, lint, typecheck, production build, and runtime guest/sign-in smoke checks passed.

The two items I would fix before calling this production-safe are:

1. Host-derived server-side fetches forward cookies and could become SSRF/cookie-forwarding bugs if edge host validation is loose.
2. The Railway worker exposes `/rerank` without app-layer auth or rate limiting if the service is publicly reachable.

This was a practical scan for obvious flaws, not a full penetration test.

## Scope

Checked:

- Secret leakage in tracked files and git history using high-signal key patterns.
- `.env*` / local secret file tracking and ignore status.
- Next.js auth, guest mode, route-handler validation, rate limiting, PHI guard, and RLS use.
- Drizzle/Neon RLS status and auth schema sync.
- Worker HTTP surface and database access.
- Dependency audit, lint, typecheck, build, targeted tests, worker tests, and a local runtime smoke.

Not checked:

- Live production edge/CDN configuration.
- Browser-driven magic-link email clickthrough.
- Manual abuse testing against deployed Vercel/Railway URLs.
- Full SAST/DAST with a commercial scanner.

DefenseClaw note: `build-loop:defenseclaw-bridge` is spec-only and does not run scanners. No agent-builder-style artifacts were present, so no DefenseClaw spec was generated.

## Findings

### F-01: Host-derived internal fetches can forward cookies to attacker-controlled origins

Severity: High if deployment accepts arbitrary `Host` / `X-Forwarded-Proto`; Medium if the edge strictly pins hosts.

Locations:

- `app/api/ai-adoption-qa/route.ts:170`
- `app/api/ai-adoption-qa/route.ts:176`
- `app/app/recommendations/[id]/page.tsx:37`
- `app/app/recommendations/[id]/page.tsx:43`

Evidence:

- Q&A builds an internal `/api/search` URL using `req.url`, then forwards the incoming `cookie` header to `fetch(searchUrl.toString())`.
- Recommendation detail builds an origin from incoming `host` / `x-forwarded-proto` when `NEXT_PUBLIC_APP_URL` is unset, then forwards the incoming `cookie` header to that origin.

Impact:

If the platform or proxy lets an attacker influence the request host, the server may fetch an attacker-controlled origin and forward session cookies. This is both SSRF-shaped and cookie-forwarding-shaped.

Fix:

- Prefer direct shared server functions instead of HTTP loopback calls.
- If HTTP is required, use a trusted server-only base URL from validated env, not incoming request headers.
- Never forward cookies to an origin derived from the request host without allowlisting the target origin.

Mitigation:

- Verify Vercel/Railway domain pinning and reject unexpected `Host` at the edge.
- Set `NEXT_PUBLIC_APP_URL` or a server-only equivalent consistently in production.

False-positive notes:

This is partly deployment-dependent. The code pattern is risky even if current hosting filters hostile hosts.

### F-02: Worker `/rerank` endpoint has no app-layer auth or rate limit

Severity: High if the Railway service is publicly reachable; Medium if private/internal only.

Location:

- `workers/src/health.ts:65`

Evidence:

`/rerank` accepts any POST body up to 5 MB, lazy-loads a local Hugging Face cross-encoder, and returns model scores. `/cron-status` and `/health` are also unauthenticated.

Impact:

If exposed publicly, anyone can force model cold starts and repeated CPU/memory work. `/cron-status` / `/health` also expose operational metadata.

Fix:

- Keep the worker service private/internal if possible.
- Add a shared-secret header or signed internal service token for `/rerank` and `/cron-status`.
- Add a small per-IP or per-token rate limit.

Mitigation:

- Configure Railway networking so only the web app or internal network can call the worker.
- Keep `/health` minimal if it must remain public.

### F-03: Raw free-text queries are persisted despite privacy comments

Severity: Medium.

Locations:

- `app/api/search/route.ts:379`
- `app/api/search/route.ts:482`
- `app/api/ai-adoption-qa/route.ts:371`
- `app/api/ai-adoption-qa/route.ts:379`

Evidence:

The search route comments say raw query content is never logged, but `logSearch` inserts `query_text` into `ai_search_queries`. The Q&A route also writes the raw `question` to the same table. Q&A has a PHI guard; `/api/search` does not.

Impact:

Users can type sensitive business, healthcare, or patient-adjacent text into search/Q&A. Pattern-based PHI detection will miss some sensitive content, so raw retention increases privacy exposure.

Fix:

- Store only `query_hash`, length, route, result count, and timing by default.
- If raw query observability is needed, gate it behind an explicit debug env flag with short retention and admin-only access.
- Add PHI/sensitive-input guard to `/api/search` or avoid raw persistence there entirely.

### F-04: Guest-mode cookie lacks `Secure` in production

Severity: Low to Medium.

Location:

- `app/api/auth/guest/route.ts:8`
- `app/api/auth/guest/route.ts:19`

Evidence:

The guest cookie sets `httpOnly`, `sameSite: "lax"`, path, and max age, but no conditional `secure: process.env.NODE_ENV === "production"`.

Impact:

This is not the Better Auth session cookie, but it does gate guest-mode access. On production HTTPS, it should not be sent over cleartext HTTP if a downgrade/misrouting path exists.

Fix:

Add `secure: process.env.NODE_ENV === "production"` to both set and clear calls.

### F-05: Production CSP allows inline scripts

Severity: Low.

Locations:

- `next.config.ts:35`
- `next.config.ts:36`
- `app/layout.tsx:40`
- `app/layout.tsx:50`

Evidence:

Production `script-src` includes `'unsafe-inline'`, apparently to support the inline theme initialization script.

Impact:

React is mostly escaping by default and I did not find untrusted `dangerouslySetInnerHTML`, so this is defense-in-depth rather than an immediate exploit. Still, inline scripts weaken CSP as an XSS backstop.

Fix:

Move the theme bootstrap to a nonce/hash-based script or external static asset and remove `'unsafe-inline'` from production `script-src`.

### F-06: Moderate dependency advisories remain

Severity: Medium.

Evidence:

`pnpm audit --prod` reported 4 moderate advisories:

- `esbuild <=0.24.2` dev-server request issue.
- `vite <=6.4.1` optimized-deps source map path traversal.
- `postcss <8.5.10` CSS stringification XSS.

Impact:

Mostly build/dev-server or content-processing class risk, not a direct app auth/database break. Still worth resolving before production hardening.

Fix:

Upgrade/transitively override affected packages after checking Better Auth / Next compatibility.

## Positive Checks

- No tracked `.env.local`, `workers/.env`, or `git ignore/dd-secrets.rtf`.
- `.gitignore` covers env files, `.next`, `.DS_Store`, `*.tsbuildinfo`, and the local secret-staging directory.
- Current tracked secret scan found only placeholders and fake test keys.
- Git history high-signal scan found only placeholders/fake test keys.
- Better Auth uses server-only config, validated env, trusted origins, and production email verification.
- Runtime app DB pool uses `DATABASE_URL_APP` with `NOBYPASSRLS` rather than owner credentials.
- RLS is enabled and forced on core user-data tables: `decisions`, `tenants`, `audit_events`, `corpus_documents`, `corpus_embeddings`, `library_*`, `plugins`, `skills`, `asset_files`, `plugin_skills`, `user_dismissals`, `recommendations`, and `kb_articles`.
- Auth tables intentionally have no RLS and are routed through Better Auth's owner-pool adapter.

## Validation Results

Passed:

- `pnpm typecheck`
- `pnpm lint`
- `pnpm build`
- `node scripts/db-verify.mjs`
- `pnpm exec vitest run tests/auth-schema-sync.test.ts tests/rls-isolation.test.ts tests/rls-library.test.ts tests/rls-plugins.test.ts tests/search-rate-limit.test.ts tests/qa-route.test.ts tests/chat-route.test.ts tests/api-recommendations.test.ts tests/api-library-promote.test.ts tests/phi-guard.test.ts` passed 80/81 tests.
- `pnpm --dir workers typecheck`
- `pnpm --dir workers test`
- Runtime smoke on built app at `localhost:3020`:
  - `GET /sign-in` -> 200
  - `GET /` -> 307 to `/sign-in`
  - `POST /api/auth/guest` -> 200
  - `GET /app` with guest cookie -> 200
  - `GET /api/search?q=test` without auth/guest -> 401

Failed / warnings:

- `pnpm audit --prod` -> 4 moderate advisories.
- `tests/api-library-promote.test.ts` unauthenticated case fails because `cookies()` is called outside a Next request scope in the test path. This does not prove a live auth bypass, but the test harness should be fixed.
- Accidental first Vitest invocation entered dev/watch mode and ran broader tests. It surfaced the same promote test failure and an unrelated hybrid-search recall regression (`0.842 < 0.91`), then was stopped.
- Worker tests emitted a pg SSL-mode warning: future `pg` versions will treat `sslmode=require` differently; consider `sslmode=verify-full` if compatible with Neon.

## Recommendation

Fix F-01 and F-02 first. They are the only findings that look like obvious production security risks rather than hardening cleanup. Then handle raw-query retention and the cookie/CSP/dependency hardening items.
