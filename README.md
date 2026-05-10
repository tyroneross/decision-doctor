# Decision Doctor

Transparent decision engine for solo healthcare practitioners.

**Source of truth:** [`docs/PRD.md`](./docs/PRD.md). The README only handles bootstrap; everything else lives in the PRD.

> **Working directory note.** This `main` branch corresponds to the `decision-doctor-cc` (Claude Code variant 1) experiment. Sibling experiments live on their own branches: `cc2` (Claude Code variant 2), `codex` (Codex variant). User picks best of the three for promotion.

## Bootstrap (10 min)

```bash
# 1. Install deps
pnpm install

# 2. Copy env scaffold
cp .env.example .env.local

# 3. Fill in secrets — see PRD §14 Pre-Build Checklist
# Verify in secrets-vault first; mark cached keys as ✅
#   GROQ_API_KEY → https://console.groq.com/keys
#   DATABASE_URL → https://console.neon.tech (free tier)
#   BETTER_AUTH_SECRET → openssl rand -base64 32
#   RESEND_API_KEY → https://resend.com/api-keys
#   AUTH_FROM_EMAIL → "Decision Doctor <auth@decisiondoctor.app>"

# 4. Apply DB schema to a fresh Neon DB
pnpm db:push

# 5. Verify scaffold (PRD §22.12)
pnpm typecheck
pnpm lint
pnpm dev   # → http://localhost:3000

# 6. Start with feature F-01 — see PRD §5
```

## Open Questions to resolve on day 1

See PRD §20:
- **OQ-01:** Curl test for Groq `reasoning_format: parsed` response shape (10 min)
- **OQ-02:** Verify `@ducanh2912/next-pwa` × Next 16 compatibility at install (5 min — fallback is hand-rolled service worker, ~30 min XS)
- **OQ-03:** Confirm confidence formula — default = TOPSIS top-1/top-2 margin
- **OQ-04:** Confidence threshold for green badge — default ≥75

## Repo layout

```
app/
  api/
    decisions/   # POST: run engine; GET /:id: fetch
    auth/         # Better Auth handler
  (public)/       # Landing
  (app)/          # Authenticated app
components/
  intake/         # Form-per-template
  recommendation/ # Transparent rec UI
  workload-reducers/
lib/
  auth.ts
  db/
    schema.ts     # Drizzle: users, tenants, decisions
    actor.ts      # AsyncLocalStorage + withActor (PRD §7.3)
    index.ts
  engine/
    orchestrator.ts
    stage1-values.ts
    stage2-constraints.ts
    stage3-weights.ts
    stage4-outranking.ts
    stage5-ranking.ts
    templates/
      capacity.ts
      pricing.ts
      admin-hire.ts
  groq.ts         # Groq client; reasoning_format: parsed
  env.ts          # Zod-validated env (fails fast at boot)
shared/
  schema.ts       # DecisionInput + DecisionOutput Zod schemas
public/
  manifest.json
drizzle/
  *.sql           # Generated migrations (commit these)
tests/
```

## Tier 1 sources consulted

- Spec: [`docs/PRD.md`](./docs/PRD.md)
- Decision-science research: `Decisio Science Research/`
- Stack defaults: `~/ObsidianVault/wiki/concepts/stacks/stack-nextjs-neon-drizzle-better-auth.md`
- RLS pattern reference: `~/dev/git-folder/ProductPilot/server/storage-hybrid.ts`
- Security canon: `~/dev/research/topics/product-dev/product-dev.agentic-systems-security-references.md`
