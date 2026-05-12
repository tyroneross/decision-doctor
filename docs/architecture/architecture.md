# Decision Doctor — Architecture Reference

**Last updated:** 2026-05-10 (HEAD `8dcb98b`)
**Canonical machine-readable scan:** `.navgator/architecture/` (gitignored; run `/navgator:map` or build-loop's `architecture-scan` to regenerate)
**This file:** the human-readable summary. Authoritative for prose; defer to machine scan for component counts.

---

## Architecture-scan integration policy (project-wide standard)

Both **build-loop** and **navgator** must read and write architecture scans to the SAME location and SAME format so engineers can switch tools seamlessly.

| Concern | Rule |
|---|---|
| Storage location | `.navgator/architecture/` (per the project-wide "tool-named storage" convention in `~/.claude/CLAUDE.md`) |
| Format | NavGator's JSON schema (canonical) — see `~/.navgator/schema/` or `mcp__plugin_navgator_navgator__scan` output |
| When to scan | Before any "big change" (multi-file refactor, new service, schema migration); after the change lands; on demand via `/navgator:map` or `/build-loop:run` Phase 1 Assess |
| Build-loop integration | Build-loop's `architecture-scan` skill MUST write to `.navgator/architecture/` (not a separate dir). Phase 1 Assess reads existing scan; Phase 4 Review writes a post-change scan with a diff section. |
| Navgator integration | NavGator reads/writes `.navgator/architecture/` natively. No change needed. |
| Audit trail | Each scan writes a timestamped subdirectory; the latest is symlinked `.navgator/architecture/latest`. |
| Drift detection | When build-loop's Phase 1 detects > 24h staleness, it runs an incremental scan before Plan. |

**Why this matters:** the user must be able to ask "what's the impact of this change?" via either tool's command surface and get the same answer. Today both plugins scan, but if they write to different locations the answers can diverge.

→ **note:** this policy is enforced informally for now. A formal verifier (`scripts/verify-scan-location.sh`) is on the v1.1 TODO list per `docs/next-steps.md`.

---

## High-level topology

```
┌─────────────────────────────────────────────────────────────────────┐
│ BROWSER (Next.js 16 React; PWA-pending per F-07)                    │
│ ─────────────────────────────────────────────────                   │
│   /sign-in                    [public]                              │
│   /app/chat                   [auth]    Chat.tsx                    │
│   /app/decisions              [auth]    DecisionsListClient.tsx     │
│   /app/decisions/[id]         [auth]    RecommendationView.tsx      │
│   /app/decisions/new          [auth]    template selector + intake  │
└────────────────────────────┬────────────────────────────────────────┘
                             │ HTTPS
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│ VERCEL · Node serverless functions (Fluid Compute)                  │
│ ─────────────────────────────────────────────────                   │
│   /api/auth/*           Better Auth (magic link + password)         │
│   /api/chat             Streaming chat → Groq                       │
│   /api/decisions        Engine entrypoint                           │
│     │                                                                │
│     ▼                                                                │
│   lib/engine/orchestrator.ts                                        │
│     │ Stage 1 (LLM)     stage1-values.ts        → Groq              │
│     │ Stage 2 (TS)      stage2-constraints.ts                       │
│     │ Stage 3 (TS)      stage3-weights.ts                           │
│     │ Stage 4 (TS)      stage4-outranking.ts    [ELECTRE]           │
│     │ Stage 5 (LLM+TS)  stage5-ranking.ts       [TOPSIS+regret]→Groq│
│     │ ─── planned ───                                                │
│     │ Stage 6 (LLM)     stage6-feasibility.ts   [F-08]  PARALLEL    │
│     │ Stage 7 (TS)      stage7-scaffold.ts      [F-09]              │
│     │ Stage 1B (TS)     stage1b-ahp.ts          [F-10]  ALT to S1   │
│     │ Stage 0 (LLM)     stage0-classifier.ts    [F-11]  PRE-CLASS   │
└────────────────────────┬────────────────────────────────────────────┘
                         │
              ┌──────────┴──────────┐
              ▼                     ▼
┌─────────────────────┐  ┌──────────────────────┐
│ NEON Postgres       │  │ UPSTASH Redis        │
│  · users            │  │  · rate-limit (T-10) │
│  · tenants          │  │  · feasibility cache │
│  · decisions (JSONB │  │     [planned w/ F-08]│
│     workload_      │  └──────────────────────┘
│     reducers)       │
│  · audit_events     │  ┌──────────────────────┐
│  · sessions, ...    │  │ RESEND (email)       │
│ RLS: FORCE on user  │  │  · magic-link        │
│   tables; tenant-   │  └──────────────────────┘
│   scoped per req    │
└─────────────────────┘  ┌──────────────────────┐
                         │ GROQ (LLM)           │
                         │  · openai/gpt-oss-120│
                         │  · reasoning_format= │
                         │     "parsed"         │
                         └──────────────────────┘

PLANNED (v1.1, on Railway):
┌─────────────────────────────────────────────────┐
│ RAILWAY worker                                   │
│  · Weekly workflow audit (cron + per-user fanout)│
│  · Multi-armed bandit on active skills/plugins   │
│  · Reads Neon (RLS-aware); writes audit_runs     │
└─────────────────────────────────────────────────┘
```

---

## Components inventory (manual; will be authoritative after next `navgator scan`)

### Frontend (Next.js 16 App Router)

| Component | Path | Status | F-criteria |
|---|---|---|---|
| Auth layout | `app/app/layout.tsx` | ✅ | F-06 |
| Chat surface | `components/chat/Chat.tsx` | ✅ Sunrise-refactored (commit `348b11e`) | F-04 |
| Recommendation detail (pyramid layout) | `components/recommendation/RecommendationView.tsx` | ✅ (commit `186d09c`) | F-04 |
| History list (hero ledger + category cards) | `app/app/decisions/page.tsx` + `components/decisions/DecisionsListClient.tsx` | ✅ (commit `0164268`) | F-06 |
| Empty state | `components/decisions/EmptyState.tsx` | ✅ | F-06 |
| Template selector (Sunrise) | `app/app/decisions/new/page.tsx` | ✅ | F-01 |
| Sign-in | `app/sign-in/page.tsx` | ✅ (pre-Sunrise) | F-06 |
| AhpPairwise (planned) | `components/elicitation/AhpPairwise.tsx` | 🟡 F-10 | F-10 |
| ScaffoldViewer drawer (planned) | `components/scaffold/ScaffoldViewer.tsx` | 🟡 F-09 | F-09 |
| CodeBlock with copy (planned) | `components/scaffold/CodeBlock.tsx` | 🟡 F-09 | F-09 |

### Engine (`lib/engine/`)

| Stage | File | Type | Status |
|---|---|---|---|
| 0 — Decision-type classifier | `stage0-classifier.ts` | LLM | 🟡 F-11 |
| 1 — Values + weight direction | `stage1-values.ts` | LLM | ✅ |
| 1B — AHP elicitation (alt) | `stage1b-ahp.ts` | TS (eigenvector + CR) | 🟡 F-10 |
| 2 — Constraint vetoes | `stage2-constraints.ts` | TS deterministic | ✅ |
| 3 — Weight normalization | `stage3-weights.ts` | TS deterministic | ✅ (passthrough; BOED future) |
| 4 — ELECTRE outranking | `stage4-outranking.ts` | TS deterministic | ✅ |
| 5 — TOPSIS + minimax regret + LLM rationale | `stage5-ranking.ts` | LLM + TS | ✅ |
| 6 — AI-feasibility classifier | `stage6-feasibility.ts` | LLM | 🟡 F-08 |
| 7 — Skill/plugin scaffold generator | `stage7-scaffold.ts` + `lib/scaffold-generator.ts` | TS template | 🟡 F-09 |
| Orchestrator | `orchestrator.ts` | Sequencer | ✅ (needs parallel-dispatch update for F-08) |

### API Routes (`app/api/`)

| Route | Runtime | Auth | Purpose |
|---|---|---|---|
| `auth/[...all]` | Node | n/a | Better Auth handler (magic link + password + sessions) |
| `chat` | Node | yes | Streaming chat to Groq |
| `decisions` (POST) | Node | yes + RLS | Engine entry; runs orchestrator; writes `decisions` row |
| `decisions/[id]` (GET) | Node | yes + RLS | Fetch a saved decision |
| `decisions/[id]/scaffold/[reducer]` (planned, lazy) | Node | yes + RLS | F-09 scaffold lazy-load |
| `templates` (GET) | Node | yes | Return 3 v1 templates |

All DB-touching routes are pinned `export const runtime = "nodejs"` per LD-08 (Neon HTTP driver doesn't preserve RLS GUCs on the Edge).

### Data (`lib/db/schema.ts`)

| Table | Purpose | RLS |
|---|---|---|
| `users` | Better Auth identity | enabled |
| `tenants` | Multi-tenant root (owner-only access) | enabled, FORCE |
| `decisions` | One row per decision; JSONB columns for `recommendation`, `alternatives`, `methodTrace`, `workload_reducers` | enabled, FORCE |
| `audit_events` | Append-only LLM call audit (user_id, model, tokens, ts) | insert-only |
| `accounts`, `sessions`, `verifications` | Better Auth | enabled |

Schema discovered (per STATUS line 55) to have plural table names + uuid ids — adapter mapping is in `lib/auth.ts`.

### External services

| Service | Purpose | Tier |
|---|---|---|
| **Vercel** (Node Fluid Compute) | Hosting + serverless | Pro recommended for 800s timeout |
| **Neon Postgres** | App database | Free tier OK for hackathon |
| **Groq** (`openai/gpt-oss-120b`) | LLM for Stages 1, 5, future 0 + 6 | Pay-as-you-go |
| **Better Auth** | Auth (magic link + password) | Library, not a service |
| **Resend** | Transactional email for magic links | Free tier OK |
| **Upstash Redis** | Rate limiting (live) + feasibility cache (planned w/ F-08) | Free tier OK |
| **Railway** (planned v1.1) | Weekly audit cron + multi-armed bandit | TBD |

---

## Data flow — single decision request

```
1. User submits intake (F-02)
   → POST /api/decisions   { templateId, fields, context }

2. Vercel Node handler (app/api/decisions/route.ts):
   a) auth: getSession() via Better Auth
   b) rate-limit: checkRateLimit(userId)  [Upstash sliding window]
   c) set RLS context: SET app.user_id = $1, app.tenant_id = $2
   d) call runDecision(input)

3. lib/engine/orchestrator.ts:
   (planned: Stage 0 PEDE classifier — F-11)
   Stage 1 → Groq → adjusted weights         (or Stage 1B AHP if user opted in — F-10)
   Stage 2 → veto filtering
   Stage 3 → normalize
   Stage 4 → ELECTRE outranking  ┐
   Stage 6 → feasibility (F-08)  ┤  Promise.all — PARALLEL
                                  ┘
   Stage 5 → TOPSIS + minimax + Groq rationale
   Stage 7 → scaffold generator (F-09) [if any reducer is skill/plugin]

4. Persist:
   INSERT decisions (recommendation, alternatives, robustAlt, methodTrace,
                     workload_reducers, confidence, template_id, ...)
   INSERT audit_events (user_id, template_id, model, tokens_in, tokens_out, ts)

5. Return JSON to client; client navigates to /app/decisions/[id]
```

---

## AI/LLM use cases (distinct purposes — not raw import counts)

Following the NavGator LLM-Dedup convention (project memory: distinct use cases > raw import counts).

| # | Use case | Stage | Production? | Trust tier |
|---|---|---|---|---|
| 1 | Estimate criterion weights from intake | Stage 1 | ✅ | T2 (estimate; deterministic refinement) |
| 2 | Generate rationale + 3 workloadReducers | Stage 5 | ✅ | T2 (output reviewed in UI) |
| 3 | Stream chat replies (non-engine) | `/api/chat` | ✅ | T3 (interactive; user steers) |
| 4 | Decision-type classifier (PEDE Stage 0) | Stage 0 | 🟡 F-11 | T2 (categorical only; structured-output) |
| 5 | AI-feasibility classifier per reducer | Stage 6 | 🟡 F-08 | T2 (categorical only) |
| 6 | (Skill/plugin scaffold) | Stage 7 | 🟡 F-09 | n/a — deterministic template assembly, no LLM call |

5 distinct LLM use cases at v1 + F-08/F-09/F-10/F-11 land. No LLM in test paths.

---

## Anomalies & risks (manual audit; navgator may surface more)

| # | Item | Severity | Mitigation |
|---|---|---|---|
| 1 | E2E concurrent test (`tests/e2e/concurrent.test.ts`) is flaky — Groq JSON-validator hiccups at 25-fan waves | Low | Preexisting; relax threshold or schedule-off-CI |
| 2 | Rate-limit is in-memory by default; Upstash kicks in only with env vars set | Low | Working as designed; production already on Upstash |
| 3 | Confidence % copy may be misread as forecast-probability | Medium | Mitigated by `question-type-coverage-2026-05-10.md` honesty note; UI copy audit pending |
| 4 | No drift detection on `decisions.workload_reducers` JSONB schema | Medium | Adding F-08/F-09/F-10 fields is additive; consider Zod parse on read |
| 5 | Stage 6 (F-08) latency adds to engine — currently absorbed by parallelism with Stage 4 | Low | Plan documented in `f08-f09-plan-2026-05-10.md` §2 |

---

## How to regenerate this doc

1. Run `/navgator:map` (or `Skill('navgator:map')`) — refreshes `.navgator/architecture/`
2. Read `.navgator/architecture/latest/components.json` + `connections.json`
3. Update component counts + connection map in this file
4. Cite the scan timestamp in the "Last updated" header

When build-loop's `architecture-scan` runs in Phase 1 Assess or Phase 4 Review:
- It writes to `.navgator/architecture/<scan-id>/` (same convention)
- Phase 4 emits a diff section into the run's `report.md` showing what changed
- If the diff includes a new component or connection not in this doc, build-loop's Phase 6 Learn surfaces a "doc drift" warning

---

## Cross-references

- `docs/PRD.md` — feature spec; F-criteria → architecture component map
- `docs/research/algorithm-problem-fit-2026-05-10.md` — PEDE structural taxonomy + per-algorithm fit
- `docs/research/question-type-coverage-2026-05-10.md` — epistemic taxonomy + engine routing intentions
- `docs/research/f08-f09-plan-2026-05-10.md` — Vercel vs Railway capacity assessment (§2)
- `docs/ux/considerations.md` — UX nav paths + inputs/outputs (mirror of this doc on the UX side)
- `docs/design/calm-precision.md` — design system reference
- `docs/handover/STATUS.md` — build phase + open follow-ups
