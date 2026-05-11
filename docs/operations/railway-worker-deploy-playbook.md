# Railway Worker Deploy Playbook

**Status:** ✅ Live — `decision-doctor-workers-production.up.railway.app` `/health` returns 200
**First successful deploy:** 2026-05-10 (under Nixpacks). Re-converged 2026-05-11 after Railway's Nixpacks→Railpack migration broke the original config — see "Railpack migration" section below.
**Project:** `decision-doc-railway` (`11d80262-9690-428d-ac73-ec689f9d5574`)
**Service:** `decision-doctor-workers` (`07399a5d-1b4b-4aa9-84d5-cfbcc506cee0`)
**Reference precedent:** [`atomize-ai/docs/04-operations/RAILWAY_WORKERS.md`](/Users/tyroneross/dev/git-folder/atomize-ai/docs/04-operations/RAILWAY_WORKERS.md) — production for ~30 days under Nixpacks.

---

## TL;DR — the current working recipe (Railpack)

> **2026-05-11:** Railway migrated this service from Nixpacks to Railpack. The earlier `workers/railway.json` + `workers/nixpacks.toml` are now stale and were deleted. Single source of truth is **root `railpack.json`**.

1. **Auth via project token, not user login.** Set `RAILWAY_TOKEN` env var with a project-scoped token. No `railway login` needed.
2. **Root `railpack.json`** overrides the build step to install workers deps (`cd workers && pnpm install --frozen-lockfile`) and sets `deploy.startCommand` to `cd workers && node --import tsx src/index.ts`. `deploy.aptPackages: ["chromium"]` installs system Chromium for the content-extract CDP path.
3. **Root `tsconfig.json`** must exclude `workers/**` — otherwise `next build` typechecks worker files using root's `node_modules` (no `pg`/`pg-boss`/`cheerio` types) and fails on inferred `any`.
4. **`package.json` `start`:** `node --import tsx src/index.ts` in `workers/package.json` (not bare `tsx`). Atomize's verified pattern.
5. **`tsx` in `dependencies`** (not devDependencies); `typescript` + `@types/*` stay in devDependencies.
6. **`pnpm-lock.yaml` committed** and in sync with `package.json` or `--frozen-lockfile` rejects the build.
7. Deploy: `RAILWAY_TOKEN=… railway up --service decision-doctor-workers --detach`. Build logs: `railway logs --build <deployment-id> --service decision-doctor-workers --environment production`.
8. **Public domain:** already provisioned at `decision-doctor-workers-production.up.railway.app`.

Copy-paste recipe at the end of this doc.

---

## Railpack migration (2026-05-11)

Railway silently migrated this service from Nixpacks to Railpack. The original `workers/railway.json` (`buildCommand: pnpm install --frozen-lockfile`, service root = `workers/`) was no longer honored. Railpack autodetected Next.js at the repo root and tried to run `next build` on the workers service, which fails because:
- workers env doesn't have the web app's `BETTER_AUTH_SECRET`/`RESEND_API_KEY` (those live on Vercel)
- root `tsconfig.json` includes `**/*.ts`, so worker files get typechecked against root's node_modules

**Fix:** root `railpack.json` overrides install/build/start to be workers-only. Took 7 deploys to converge; full debugging timeline in `.build-loop/memory/` (Railpack lessons).

---

## The 4 failure modes I hit (so you don't)

### Failure 1 — `tsc: not found`

**Build log:**
```
> tsc -p tsconfig.json
sh: 1: tsc: not found
```

**Root cause:** `typescript` was in `devDependencies`. Railway sets `NODE_ENV=production`, which makes pnpm skip devDeps. The `pnpm build` script that ran `tsc` then had no binary.

**Wrong fix (don't do):** hoist `typescript` to `dependencies`. Works, but next failure exposes it.

**Right fix:** drop the `tsc` build step entirely. Use `node --import tsx` at runtime (see Failure 4).

### Failure 2 — `ERR_PNPM_OUTDATED_LOCKFILE`

**Build log:**
```
ERR_PNPM_OUTDATED_LOCKFILE  Cannot install with "frozen-lockfile" because pnpm-lock.yaml is not up to date with <ROOT>/package.json
```

**Root cause:** I edited `package.json` (moving `typescript` between dep groups) without running `pnpm install` to regenerate the lockfile. Railway's `pnpm install --frozen-lockfile` requires exact match.

**Fix:** after any `package.json` change, run `pnpm install` locally and commit the updated `pnpm-lock.yaml` in the same commit.

### Failure 3 — `Cannot find name 'process' / 'console' / 'node:http'`

**Build log:**
```
src/embed.ts(29,18): error TS2580: Cannot find name 'process'.
src/health.ts(8,30): error TS2307: Cannot find module 'node:http'.
src/cli/enqueue-arxiv.ts(13,52): error TS2580: Cannot find name 'process'.
```

**Root cause:** `@types/node` is in `devDependencies`. Same NODE_ENV=production strip as Failure 1. Once `typescript` was in `dependencies` and ran successfully, `tsc` couldn't resolve Node globals/modules because their types were missing.

**Wrong fix:** hoist all `@types/*` to `dependencies`. Works, but bloats the production image with type packages it doesn't need at runtime.

**Right fix:** stop running `tsc` at build time. tsx uses esbuild to strip types at import time — no type resolution needed at runtime. Drop the `tsc -p tsconfig.json` build step entirely.

### Failure 4 — bare `tsx` PATH issues (the one that finally clicked)

**Build log:** the build *passed* but the runtime crashed at startup because `tsx` couldn't be resolved on PATH inside the Nixpacks container.

**Root cause:** `pnpm install` puts binaries in `/app/node_modules/.bin`, which Nixpacks adds to PATH. In theory `tsx src/index.ts` should work. In practice it's brittle across Nixpacks revisions and the `node:NN` deprecation noise.

**Right fix (Atomize-verified):** use the **node import-hook pattern** instead:

```json
{
  "scripts": {
    "start": "node --import tsx src/index.ts"
  }
}
```

This invokes `node` (always on PATH) with the `--import tsx` flag, which loads tsx as an ESM import hook. tsx is found via the standard Node module resolution from `node_modules`, not via PATH. Bulletproof.

Atomize's `nixpacks.toml`:
```toml
[start]
cmd = "node --import tsx scripts/start-hybrid-workers.ts"
```

Atomize has run this in production on Railway for ~30 days across 4 services. Same pattern, same problem domain.

---

## Authentication: project token, not `railway login`

Railway has two auth scopes:

| Token | Env var | Scope | Use for |
|---|---|---|---|
| **Project token** | `RAILWAY_TOKEN` | Single project, single env | Deploy, set variables, generate domains, view logs — **everything for this playbook** |
| **API token** | `RAILWAY_API_TOKEN` | Whole account | Project creation, team mgmt, MCP server natural-language operations |
| User session | (cookie via `railway login`) | Whole account | Interactive CLI use, Railway dashboard browsing |

**For deploys: project token is enough.** Generate one at Railway dashboard → Project → Settings → Tokens. Store it in `git ignore/dd-secrets.rtf` (gitignored). Extract at runtime:

```bash
TOKEN=$(textutil -convert txt -stdout "git ignore/dd-secrets.rtf" 2>/dev/null \
  | grep -iE "railway.token|dd-railway" \
  | grep -oE '[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}' \
  | head -1)
export RAILWAY_TOKEN=$TOKEN
```

`railway login` is only needed if you want to operate Railway via MCP server (natural-language) or use account-scoped commands.

---

## Step-by-step recipe (copy-paste)

For a new worker service in this project (or a sibling project). Assumes `git ignore/dd-secrets.rtf` contains a project token line like `Dd-railway-token <UUID>`.

### One-time setup

```bash
# In your worker directory (e.g., workers/)
cat > package.json <<'EOF'
{
  "name": "your-worker",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "build": "echo 'no build step — node --import tsx loads TS at runtime'",
    "start": "node --import tsx src/index.ts",
    "dev": "tsx watch src/index.ts",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "tsx": "^4.21.0"
    /* + your runtime deps here */
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "typescript": "^5.6.0"
    /* + other build/test-only deps */
  },
  "engines": { "node": ">=22.0.0" }
}
EOF

cat > railway.json <<'EOF'
{
  "$schema": "https://railway.com/railway.schema.json",
  "build": {
    "builder": "NIXPACKS",
    "buildCommand": "pnpm install --frozen-lockfile"
  },
  "deploy": {
    "startCommand": "pnpm start",
    "restartPolicyType": "ON_FAILURE",
    "restartPolicyMaxRetries": 5,
    "healthcheckPath": "/health",
    "healthcheckTimeout": 30
  }
}
EOF

pnpm install      # generates pnpm-lock.yaml
git add package.json pnpm-lock.yaml railway.json
git commit -m "scaffold: new Railway worker service"
git push
```

### Deploy

```bash
# Extract the project token (once per shell)
TOKEN=$(textutil -convert txt -stdout "../git ignore/dd-secrets.rtf" 2>/dev/null \
  | grep -iE "railway.token|dd-railway" \
  | grep -oE '[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}' \
  | head -1)
export RAILWAY_TOKEN=$TOKEN

# 1. Create the service (first time only)
railway add --service your-worker-name

# 2. Set env vars (read from .env, push to Railway)
for var in DATABASE_URL DATABASE_URL_UNPOOLED OPENAI_API_KEY GROQ_API_KEY LOG_LEVEL NODE_ENV; do
  val=$(grep -E "^${var}=" .env | head -1 | cut -d= -f2-)
  [ -z "$val" ] && [ "$var" = "NODE_ENV" ] && val=production
  [ -n "$val" ] && railway variables --service your-worker-name --set "$var=$val"
done

# 3. Generate public domain (if your service exposes HTTP)
railway domain --service your-worker-name

# 4. Deploy
railway up --service your-worker-name --detach

# 5. Poll until done
until s=$(railway status 2>/dev/null | grep -oE "your-worker-name: . [A-Za-z]+") \
  && echo "$s" | grep -qE "Active|Online|Failed|Crashed"; do
  sleep 20
done
echo "Final: $s"

# 6. Verify health
curl -sS https://your-worker-name-production.up.railway.app/health
```

### Iterating after first deploy

```bash
# Push code → redeploy
git push
railway up --service your-worker-name --detach

# Update an env var
railway variables --service your-worker-name --set "NEW_KEY=value"

# Stream logs
railway logs --service your-worker-name

# Build logs only (for diagnosing failures)
railway logs --service your-worker-name --build
```

---

## Anti-patterns that wasted my time

| Anti-pattern | Why it fails | Right thing |
|---|---|---|
| `"start": "tsx src/index.ts"` | tsx CLI may not be on Nixpacks PATH reliably | `node --import tsx src/index.ts` |
| `"start": "node dist/index.js"` + `"build": "tsc"` | Requires `typescript` + `@types/*` in `dependencies` (production bloat) | Drop the build step |
| Editing `package.json` without `pnpm install` | `pnpm-lock.yaml` falls out of sync → `--frozen-lockfile` fails | Run `pnpm install` and commit lockfile in the same change |
| `railway login` for CI/deploy automation | Interactive, expires, not reproducible | Project token via `RAILWAY_TOKEN` env var |
| Filtering tool stdout for "prompt injection" patterns | Railway CLI legitimately prints "run `railway setup agent -y`" — vendor recommendation, not adversarial | Read vendor docs; trust recommendation patterns from verified vendors |
| Adding all `@types/*` to `dependencies` to make `tsc` happy at build time | Bloats production image with types not needed at runtime | Drop `tsc` from build step; use `tsx` to strip types at import time |

---

## Why `node --import tsx` is the right shape for Railway specifically

Three properties combine:

1. **`node` is always on PATH** inside Nixpacks containers (it's the base runtime). No PATH munging risk.
2. **`--import tsx`** loads tsx via Node's standard module resolution from `node_modules` — pnpm/npm/yarn all put it there, no PATH binary lookup needed.
3. **esbuild type-stripping** at import time means no TypeScript compiler runs in production. No `tsc` failures from missing `@types/*`. No build artifacts to manage.

Result: the production image needs only `tsx` + your runtime deps. devDependencies (including all `@types/*` + typescript itself) can be safely stripped by `NODE_ENV=production` without breaking startup.

Atomize AI runs 4 worker services on this exact pattern. Confirmed working for ~30 days as of 2026-05-10.

---

## Common follow-up needs

### Multi-service dispatcher (one repo → N Railway services)

When you outgrow one worker, follow Atomize's per-service-dispatcher pattern: one start script that switches on `RAILWAY_SERVICE_NAME`:

```typescript
// scripts/start-workers.ts
const service = process.env.RAILWAY_SERVICE_NAME;
const delegated: Record<string, string> = {
  'embed-worker': './workers/embed.ts',
  'cluster-worker': './workers/cluster.ts',
  'trending-worker': './workers/trending.ts',
};

if (service && delegated[service]) {
  await import(delegated[service]);
} else {
  // default: start everything in-process
  await import('./workers/embed.ts');
  await import('./workers/cluster.ts');
}
```

Each Railway service gets the same start command (`node --import tsx scripts/start-workers.ts`) and a different `RAILWAY_SERVICE_NAME`. Pure deploy-time config; no code per service.

Atomize reference: `atomize-ai/scripts/start-hybrid-workers.ts:243-253`.

### Graceful disable flags

Atomize adds env-var flags to disable individual workers without redeploying:

```typescript
const workers = [
  { name: 'Embedding Worker', enabled: process.env.DISABLE_EMBEDDING_WORKER !== 'true' },
  // ...
];
```

Pattern: `DISABLE_<WORKER>_WORKER='true'` turns it off. Useful for debugging a misbehaving consumer without taking the whole service down.

### Security warning: secrets-in-ARG/ENV from Nixpacks

Railway's Nixpacks-generated Dockerfile passes env vars as `ARG`/`ENV` instructions, which exposes them in image-layer history. Build logs show:

```
[WARN] SecretsUsedInArgOrEnv: Do not use ARG or ENV instructions for sensitive data (ARG "OPENAI_API_KEY")
```

This is Railway's default behavior, not a configuration error. The secret values *work* but aren't best-practice from a Docker image-layer perspective. Mitigations available but not required for MVP:
- Use Railway's BuildKit secrets via `RAILWAY_DOCKERFILE_PATH` + custom Dockerfile with `--mount=type=secret`
- Or accept the layer-history exposure (image isn't published anywhere; only Railway sees it)

DD currently accepts the warning. Revisit if security review flags it.

---

## Cross-references

- **Atomize Railway topology** — `~/dev/git-folder/atomize-ai/docs/04-operations/RAILWAY_WORKERS.md`
- **Atomize Railway start script** — `~/dev/git-folder/atomize-ai/scripts/start-hybrid-workers.ts`
- **Atomize nixpacks.toml** — `~/dev/git-folder/atomize-ai/nixpacks.toml`
- **ObsidianVault Railway tool page** — `~/ObsidianVault/tools/host/tool-railway.md`
- **DD's worker source** — `workers/src/index.ts`
- **DD's Railway config** — `workers/railway.json`
- **Build-loop memory (Railway lessons)** — `.build-loop/memory/lesson_railway_node_import_tsx.md` (companion entry, this playbook's compressed form)
- **Railway docs reviewed during this work**:
  - https://docs.railway.com/cli
  - https://docs.railway.com/ai/mcp-server
  - https://raw.githubusercontent.com/railwayapp/cli/master/install.sh

---

## Open follow-ups

- [ ] Install Railway MCP server for next-time natural-language ops: `claude mcp add Railway npx @railway/mcp-server` (needs account-scoped auth)
- [ ] Address Nixpacks `SecretsUsedInArgOrEnv` warning if a security review requires it
- [ ] When adding a second worker service, adopt Atomize's `RAILWAY_SERVICE_NAME` dispatcher pattern
- [ ] Wire `/cron-status` and `/health` into a monitoring dashboard (Sentry / Datadog / built-in Railway metrics)
