# Branch C Build Plan

Governing thought: Branch C should ship a working P0 prototype from the GitHub `main` baseline, with secrets ignored, core decision flow real, and PWA/auth/db surfaces validated as far as local credentials allow.

## Work Groups

Group: Lead setup and integration
Dimension: build system and release control
Owns files: `package.json`, `pnpm-lock.yaml`, `next.config.ts`, `.gitignore`, `.build-loop/**`, root config files
Does not own: feature implementation slices delegated to workers
Interface contract: `pnpm typecheck`, `pnpm build --webpack`, Git branch and final report
Integration checkpoint: full local validation after worker integration
Intent link: protects delivery reliability and secret hygiene

Group: Engine and schemas
Dimension: domain decision pipeline
Owns files: `shared/schema.ts`, `lib/engine/**`, engine/PHI tests
Interface contract: `runDecision(input): Promise<DecisionOutput>`, template registry, stages 1-5 trace
Integration checkpoint: decision JSON contract tests
Intent link: trust through visible MCDA reasoning

Group: Auth, DB, API
Dimension: persistence and security boundary
Owns files: `lib/auth.ts`, `lib/db/**`, `app/api/**`, `drizzle/**`, API/RLS tests
Interface contract: Better Auth route, actor context, RLS-safe decisions API, rate limit
Integration checkpoint: API typecheck and DB-independent tests; live DB tests if credentials permit
Intent link: safety, tenant isolation, decision history

Group: UI and PWA
Dimension: user workflow
Owns files: `app/**` except `app/api/**`, `components/**`, `public/**`, UI/PWA tests
Interface contract: template selector, intake, recommendation detail, history, manifest/draft persistence
Integration checkpoint: 375px manual/visual check and build
Intent link: speed, clarity, mobile-first usability

## Known Risks

- Better Auth dependency peers required Drizzle/Zod updates; Drizzle Kit update may need follow-up if `esbuild` postinstall remains unstable.
- `@ducanh2912/next-pwa` injects webpack config, so Next 16 scripts run with `--webpack`.
- PRD estimated 18 hours; if the engine/auth path overruns, F-07 offline replay is the correct defer candidate.

