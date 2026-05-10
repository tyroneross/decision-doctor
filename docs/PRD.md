---
title: Decision Doctor — PRD
slug: decision-doctor
mode: Build
platform: Web (Next.js 16 mobile-first PWA)
created: 2026-05-09
revised: 2026-05-09
analytical_lens: "Layered MCDA pipeline (radical preference simplification)"
risk_reason: user trust claim
modifies_api: true
sources_consulted:
  - obsidian: ~/ObsidianVault/wiki/concepts/stacks/stack-nextjs-neon-drizzle-better-auth.md
  - secrets_vault: yes — verify GROQ_API_KEY, DATABASE_URL, BETTER_AUTH_SECRET, RESEND_API_KEY availability before build
  - research_local: ~/dev/git-folder/decision-doctor/Decisio Science Research/ (PEDE/MCDA pipeline notes)
  - research_canonical: ~/dev/research/topics/product-dev/product-dev.agentic-systems-security-references.md
  - research_implementation: ~/dev/git-folder/ProductPilot/ (RLS pattern + AsyncLocalStorage actor context)
  - prompt: ~/Desktop/Equity & Access to AI — MLT20 AI Buildathon.pdf
threat_model: "OWASP LLM Top 10 + OWASP Agentic Top 10 + Cisco DefenseClaw 3-pillar (see §11)"
---

# Decision Doctor

## 1. TL;DR

Decision Doctor helps solo practitioners pick the right AI use cases for their workflow and ship them — then provides a decision framework when AI alone can't solve the problem.

**Primary path: "Find where AI saves you time."** A 5-minute conversation surfaces a ranked list of weekly capacity drains, scores each on AI feasibility (skill / plugin / agent / human-only), and **builds the starter tool** (paste-ready prompt, custom Claude Skill, MCP plugin, or agent recipe) for the top one. Time saved is the universal metric. Each week, the user gets a workflow audit: how their active AI tools performed + new recommendations + honest tradeoffs between custom tools the app built and public tools they could leverage instead.

**Secondary path: "Help me decide given my constraints."** When AI can't directly solve the problem (raise prices? cap intakes? hire admin?), the same engine runs a transparent MCDA pipeline: alternatives considered, why each was eliminated, confidence band, robust fallback if assumptions shift, paired-path anti-nudge framing. Math is collapsed under a "Show the math" disclosure — visible on demand, not in the way. v1 ships three decision templates — capacity, pricing, admin-hire — to a Next.js 16 mobile-first PWA. Single-user UX, multi-tenant-ready architecture, no PHI in v1.

## 2. Context & North-Star

**Problem.** Businesses, enterprises, and individuals recognize AI's value but get stuck in two places: (a) selecting which use cases to implement, and (b) gaining traction after selection. Most users know prompting; far fewer know how to leverage the advanced surface — agent skills, plugins, MCP tools, multi-step agents. **Small business owners are at the steepest disadvantage** because they have fewer resources than enterprises to learn AI effectively, which compounds their gap.

Solo healthcare practitioners are an acute case. They want time with patients, but every week pulls them into administrative work that scales linearly with practice growth: insurance pre-authorizations, pharmacy callbacks, referral-network coordination, keeping up with academic research, patient and client emails, billing, clinical notes, calendar triage, plus the long-cycle business decisions (should I raise prices? when? how many more patients can I take? expand or cap?). The challenges concentrate on the business side — which medical training does not cover. The result is that the practitioners with the most leverage to gain from AI have the least bandwidth to adopt it.

Existing AI tools either give confident answers without provenance (disqualifying in a healthcare-adjacent context) or require a level of technical fluency that most solo practitioners don't have time to acquire.

**Target user.** Solo practitioner psychiatrist (MD, MPH) — demo anchor: Tyrone's wife. Wedge expands to other solo primary care, therapists (LCSW/LMFT), and nutritionists. Each segment shares the same core profile: high-trust client work concentrated in 1:1 hours, business pulled into admin overflow, no in-house ops or consulting budget, consumer-grade app expectations carried over from daily life.

**North-star.** A practitioner uses Decision Doctor daily as the framework for assessing short- and long-term decisions affecting their practice. Within 20 minutes on any given day, they can decide whether to raise prices (and when), how many additional patients they can take this quarter, and — most importantly — **receive customized AI plugins they actually deploy**: a referral-note summarizer, an email automation for routine patient messages, a pharmacy-callback tracker that flags likely follow-ups and refines outgoing requests to reduce resends. The freed hours go to clinical work; capacity expands beyond what they would have hit unaided.

Each week, they get a **workflow audit**: how their active AI agents, plugins, and tools performed last week, what to keep, what to retire, and new recommendations. Where a public tool would beat what Decision Doctor builds, the audit says so — honest tradeoffs, no lock-in pressure.

When a key business decision arises, they trust Decision Doctor to get them to the best option fast. They know it works. They know there's serious decision-science math under the hood — MCDA, ELECTRE, TOPSIS, sensitivity analysis — tuned to each decision after the AI ingests their initial guidance. The output is a decision in **10 minutes** that previously took hours or weeks of intermittent worry.

**North-star metric.** Three layers, in priority order:
1. **Weekly hours reclaimed** (primary): hours of admin/cognitive overhead removed by AI tools shipped through Decision Doctor. Target: ≥5 hrs/wk by week 4, ≥10 hrs/wk by week 12.
2. **Time-to-decision** (secondary): time elapsed from "I have a question" to "I have a decision I trust." Target: ≤10 min for a templated decision, ≤20 min for a novel one.
3. **Adoption depth** (compound): number of distinct AI artifacts active in the practitioner's weekly workflow (skills, prompts, plugins, agent recipes). Target: ≥3 active by week 2, ≥7 by week 8.

User-reported success: "I got my Mondays back" and "the math made it feel safe."

**Why now.** MLT20 Buildathon Round 1 due 2026-05-12. Equity prompt rewards owner-operator ICP and named users. Beyond the buildathon, the LLM capability curve has crossed the threshold where customized skills/plugins/agents for solo practitioners are technically feasible and economically rational at consumer pricing — a window that did not exist 12 months ago.

## 2A. How to execute this PRD (LLM context)

This PRD is designed for autonomous LLM execution (Claude Code or Codex). The AI builder will make hundreds of small decisions during the build that the spec doesn't enumerate. To stay coherent, classify each one as Must-have / Nice-to-have / Flexible.

### Must-have (do not change without explicit user override)

If the LLM hits one of these, follow as written or pause and ask:

- **PHI rejection at intake** (LD-03 / ADR-002 / T-09) — Zod must reject any free-form field that could plausibly contain patient identifiers
- **RLS on every user-owned table** (LD-04 / §7.4 / T-08) — `FORCE ROW LEVEL SECURITY` enabled with `WITH CHECK` clause
- **Multi-tenant-ready schema** (ADR-003) — every user-owned table includes `tenant_id` from day 1
- **Composable per-stage engine** (ADR-004 / §6.2) — each MCDA stage is a discrete bounded function; no mega-prompts that fuse multiple stages
- **Both auth methods** (ADR-005) — magic link AND email/password, both via Better Auth, both shipped in v1
- **Transparent reasoning UI** (F-04 / U-02) — `methodTrace` must be visible (expandable); confidence color-coded; alternatives + elimination reasons shown
- **`workloadReducers[]` ≥3 per recommendation** (T-03 / A-12) — paste-ready artifacts ship with every decision
- **Node runtime for DB-touching routes** (LD-08) — `export const runtime = "nodejs"` on `/api/decisions/*` and `/api/auth/*`
- **All 7 P0 features + 10 F-criteria tests** in §5
- **Engine latency p95 < 6s** (T-03)
- **Per-user Groq rate limit** (T-10) — 20 decisions/day

### Nice-to-have (ship if time permits; defer cleanly if blocked)

These improve the build but skipping them does not violate the spec. If deferred, log in §16 Decision Log.

- **PWA installable** (F-07) — if `@ducanh2912/next-pwa` × Next 16 has friction (OQ-02), defer to v1.1
- **Sentry + structured logging** — wire in production only; blank in dev
- **All Q-criteria green** (§18.2) — Q-01–Q-04 required; Q-05 (migration on fresh DB) and Q-07 (Lighthouse ≥90) are nice-to-have for hackathon
- **Upstash-backed rate limiter** — in-memory acceptable for hackathon
- **Custom domain** (`decisiondoctor.app`) — Vercel preview URL is acceptable for Round 1

### Flexible (LLM picks based on what's optimal at build time)

These are the LLM's call, within the noted constraints:

- **Exact UI copy** — follow §8 tone guidance; exact wording is yours
- **Exact button styling, spacing, color shades** — Tailwind defaults + §8 dimensions; mobile-first at 375px viewport
- **Confidence formula details** (OQ-03) — default = TOPSIS top-1/top-2 margin; another formula acceptable if deterministic and consistent across runs
- **1 prompt vs 5 prompts for the engine** (ADR-004) — try both; pick whichever has better latency × quality tradeoff. Each stage MUST remain a discrete function regardless
- **Form field labels and validation messages** — follow concept-card vocabulary; rephrase confusing labels
- **Decision-template intake schemas** — start with ≤7 fields each per A-07; field-list design is yours
- **PDF rendering for F-05** — default = browser print of the in-app view; `@react-pdf/renderer` or `puppeteer` acceptable if browser print breaks
- **Test framework choice** — Vitest is in package.json; swap to Playwright for e2e if preferred

### When in doubt

If a decision feels load-bearing but isn't classified above → treat as **must-have** and ask. If it feels minor and isn't classified → treat as **flexible** and proceed. Document any non-trivial choice in §16 Decision Log so the user can review post-build.

---

## 3. Locked Decisions

These are settled — don't re-litigate during the build. Runtime decisions go in §16.

| # | Decision | Source |
|---|---|---|
| LD-01 | Analytical lens = Layered MCDA pipeline (radical preference simplification) | research/Decisio Science PDFs |
| LD-02 | LLM = Groq, model `openai/gpt-oss-120b` (config-pinned via `GROQ_MODEL`) | ADR-001 |
| LD-03 | No PHI in v1 — intake schema accepts categorical/numeric only | ADR-002 |
| LD-04 | Single-user UX per account; multi-tenant-ready data model from day 1 | ADR-003 |
| LD-05 | Engine = composable per-stage prompts, each sidecar-portable | ADR-004 |
| LD-06 | Auth = Better Auth supporting magic link + email/password; emails via Resend | ADR-005 |
| LD-07 | Stack = Next.js 16 + Neon + Drizzle + Better Auth + R2 (deferred) + Vercel | Obsidian `current_default: true` |
| LD-08 | Runtime split: Vercel Edge for static pages; Vercel Node for any DB-touching route | Neon HTTP driver does not preserve transaction-scoped GUCs (verified at https://neon.com/docs/serverless/serverless-driver, retrieved 2026-05-09) |
| LD-09 | PWA installable with IndexedDB intake-state cache + queued submission on reconnect | concept card |

### 3.1 How each Locked Decision maps to the north-star

The north star has three components: **(a)** "3 decisions in 20 minutes" (efficiency), **(b)** "she'd been putting off" (unblocking), **(c)** "the math made it feel safe" (transparency / trust).

| LD | Maps to (a/b/c) | Why |
|---|---|---|
| LD-01 (MCDA pipeline) | (c) | The pipeline IS the visible math. Every stage produces an explicit elimination reason and trace entry the UI renders. |
| LD-02 (Groq + gpt-oss-120b) | (a) + (c) | 500 tokens/sec inference makes the 20-minute budget viable on a phone. `reasoning_format: parsed` gives structured reasoning content the UI renders without parsing. |
| LD-03 (no PHI v1) | (b) | HIPAA is the largest blocker to ANY healthcare-adjacent tool. Sidestepping it removes the friction that keeps practitioners from trying the tool at all. |
| LD-04 (single-user UX, multi-tenant arch) | (a) + (c) | Single-user UI removes friction for "20 minutes". Multi-tenant arch protects (c) when v2 ships shared org workspaces — RLS correctness is what makes "the math" trustworthy. |
| LD-05 (composable per-stage engine) | (c) | Discrete stages = discrete reasoning blocks the UI can show. A mega-prompt would collapse the trace into one wall of text. |
| LD-06 (Better Auth + Resend) | (b) | Magic link removes signup friction. Practitioners "putting off" decisions also "put off" tool adoption — easy auth fights this. |
| LD-07 (Next.js stack) | (a) | Stack the user has shipped before; no learning tax. Hackathon-speed shipping with a known stack frees time for the engine + transparency UI (the (c) work). |
| LD-08 (runtime split) | (c) | Node runtime is required for the WebSocket pool that RLS depends on. RLS correctness is what makes the trust claim defensible. |
| LD-09 (PWA installable) | (a) + (b) | "Between patients" implies phone-first usage; offline-tolerant intake keeps the 20-min budget achievable when connectivity is spotty. Removes "I'll do it when I'm at my desk" — the procrastination pattern. |

## 4. User Needs

The traceability spine. Every feature in §5 satisfies ≥1 of these; every test in §5 verifies one.

| ID | User Need |
|---|---|
| U-01 | As a solo healthcare practitioner, I need to make recurring high-stakes business decisions (capacity, pricing, hiring) without access to a CFO, consultant, or analyst. |
| U-02 | As a healthcare-adjacent user, I need to see the math behind every AI recommendation — alternatives considered, why each was eliminated, confidence — because confident-sounding answers without provenance disqualify the tool in my context. |
| U-03 | As a busy practitioner, I need to complete a decision in ≤20 min using ≤5 min of structured intake on my phone, between patients. |
| U-04 | As an owner-operator weighing irreversible decisions, I need a robust fallback recommendation if my assumptions shift — not just one answer. |
| U-05 | As a compliance-conscious user, I need the tool to never ask for or store PHI in v1, so HIPAA exposure stays off the table. |
| U-06 | As a returning user, I need to see my prior decisions and the reasoning behind them, so I can validate the engine over time. |
| U-07 | As an offline-tolerant user, I need the intake form to survive spotty connectivity (cached locally, submission queued and retried on reconnect). |

## 5. MVP Scope

P0 features ship for Round 1. Each feature: ID + size + needs satisfied + data points touched + verifying test.

### P0 — Day-one

| ID | Feature | Size | Satisfies | Reads / writes | Test |
|---|---|---|---|---|---|
| **F-01** | Decision template selector | S | U-01, U-03 | reads D-01 | T-01 |
| **F-02** | Adaptive intake form per template | M | U-01, U-03, U-05, U-07 | writes D-02 | T-02 |
| **F-03** | Decision engine pipeline (MCDA Stages 1–5, composable per-stage) | L | U-01, U-02, U-04 | reads D-02; writes D-03, D-04, D-05, D-06 | T-03 |
| **F-04** | Transparent recommendation UI (renders rec + alternatives + reasoning + workloadReducers) | M | U-02 | reads D-03, D-04, D-05, D-06, D-09 | T-04 |
| **F-05** | 1-page summary export (print-optimized HTML, signed shareable URL) | S | U-02 | reads D-03, D-04, D-05; writes D-08 | T-05 |
| **F-06** | Auth + decision history | S | U-06 | reads D-08; writes D-07 | T-06 |
| **F-07** | PWA installable + IndexedDB intake-state cache + queued submission | M | U-07 | caches D-01, D-02 | T-07 |

### P1 — v1.1 (sized but deferred)

| ID | Feature | Size | Why deferred |
|---|---|---|---|
| F-10 | Voice intake (Whisper Large v3 Turbo via Groq) | M | Strong Equity-prompt fit ("phone-first user") but adds 1 day; ship text-first first |
| F-11 | On-device LLM fallback (WebLLM or Transformers.js) | L | Parallel-explored by background agents; not blocking Round 1 |
| F-12 | Decision-template authoring UI (admin) | M | v1 templates hardcoded TS files; user-extensible later |
| F-13 | Multi-decision threading (linked decisions over weeks) | M | v1 treats every decision as standalone |
| F-14 | HIPAA posture (BAAs + encryption + audit log) | L | v1 explicitly refuses PHI per ADR-002; v2 enables |
| F-15 | V2 workloadReducer destinations (drafted_email, calendar_event, marketplace_search MCP, etc.) | L–XL | v1 emits text-only artifacts (`automationLevel: user_executes`); v2 wires real connectors |

### P2 — Backlog

- F-20 Adjacent verticals — therapists / LMFTs / LCSWs decision libraries — M
- F-21 Inter-decision regret tracking (did the recommendation hold up?) — L
- F-22 Multi-user / org accounts (small group practices) — XL (XL becomes M if migration happens before significant traffic, see ADR-003)
- F-23 Custom decision authoring by end users — L

### Tests

| ID | What it verifies | Type |
|---|---|---|
| T-01 | User reaches intake form in ≤3 taps from `/app` landing | F-criteria |
| T-02 | Each template form has ≤7 fields, all Zod-validated, none accept free-form long enough to plausibly contain PHI; form state persists to IndexedDB and survives page reload | F-criteria |
| T-03 | Engine returns Decision JSON: 1 recommendation + ≥2 alternatives + ≥1 elimination reason per alternative + confidence 0–100 + 1 robust alternative + method_trace covering Stages 1–5 + ≥3 workloadReducers; p95 latency <6s | F-criteria |
| T-04 | Recommendation visible above fold at 375px viewport; alternatives + reasons in expandable; confidence color-coded (green ≥75 / amber 50–74 / red <50); robust alt visible; "show the work" expand reveals method trace; workloadReducers rendered as 3-card carousel | F-criteria |
| T-05 | Export contains rec + alternatives + confidence + robust alt + date; shareable URL signed and viewable without auth | F-criteria |
| T-06 | Magic link AND email/password both succeed; authenticated user sees only their own decisions (RLS-verified per T-08) | F-criteria |
| T-07 | App installs to phone home screen; templates cached on first load; intake form survives offline; submission queued and replayed on reconnect | F-criteria |
| T-08 | Cross-user RLS: User A cannot read decisions of User B (404, not 403 — don't leak existence) | F-criteria, security |
| T-09 | PHI rejection: Zod schema rejects free-form input matching common PHI patterns | F-criteria, security |
| T-10 | Per-user rate limit: 21st Groq call in 24h window from same user_id returns 429 | F-criteria, cost |

### Data Points

| ID | Entity | Purpose |
|---|---|---|
| D-01 | DecisionTemplate | Template definition (id, intake_schema, prompt_template, criteria, candidate_set) |
| D-02 | DecisionInput | User form submission (templateId, source, fields, context) |
| D-03 | Recommendation | option, score, confidence (0–100), rationale |
| D-04 | Alternatives | array of {option, eliminated_at_stage, reason} |
| D-05 | RobustAlternative | option + minimax-regret rationale |
| D-06 | MethodTrace | per-stage outputs from Stages 1–5 |
| D-07 | Session | Better Auth session with userId + tenantId |
| D-08 | DecisionRecord | persisted decisions row (RLS-gated by tenant_id) |
| D-09 | WorkloadReducers | array of action artifacts (prompts, playbooks, MCP tool hooks) |

## 6. Inputs · Engine · Outputs

The architecture is plug-in from day 1: v1 has one input source and one output destination, but contracts are designed for connector expansion.

### 6.1 Input contract

```typescript
// V1 source: user form submission
// V2 sources: voice intake, calendar API, practice-management connector, EHR-adjacent reads
interface DecisionInput {
  templateId: "capacity" | "pricing" | "admin-hire";  // v2: extensible registry
  source: {
    type: "user_form";              // v2: "voice" | "calendar_api" | "pms_connector" | ...
    sourceId?: string;               // upstream tracking ID if applicable
    capturedAt: Date;
  };
  fields: Record<string, FieldValue>;  // Zod-validated per template
  context: {
    userId: string;
    tenantId: string;                  // v1 = user's personal tenant
    previousDecisionIds?: string[];    // for Stage 6 progressive profiling
  };
}
```

V1 implementation: `app/api/decisions/route.ts` accepts a POST body conforming to `DecisionInput`. PHI rejection (per LD-03) at the Zod layer.

### 6.2 Engine processing (MCDA Stages 1–5, composable per-stage)

Per LD-05: each stage is a discrete bounded function. Orchestrator chains them. A single config flag per stage selects local-prompt vs Railway sidecar.

```typescript
// lib/engine/orchestrator.ts
export async function runDecision(input: DecisionInput): Promise<DecisionOutput> {
  const template = await loadTemplate(input.templateId);
  const values = await runStage1Values(input, template);            // VFT + LLM semantic analysis
  const { constraints, filtered } = await runStage2Constraints(values, template.candidateSet);
  const weights = await runStage3Weights(filtered, template.criteria);  // PAPRIKA / BOED / TTM
  const dominant = await runStage4Outranking(filtered, weights);    // ELECTRE
  const ranked = await runStage5Ranking(dominant, weights);          // WSM or TOPSIS + minimax regret
  return assembleOutput(ranked, weights, constraints);
}
```

Each `runStageN(...)` is a separate Groq prompt today; each can move to a Railway sidecar later (S–M effort per stage) without touching the orchestrator.

### 6.3 Output contract

```typescript
interface DecisionOutput {
  decisionId: string;
  decidedAt: Date;
  recommendation: {
    option: string;
    confidence: number;        // 0–100, derived from TOPSIS top-1/top-2 margin
    rationale: string;          // 1-2 sentences from Stage 5
  };
  alternatives: Array<{
    option: string;
    eliminatedAtStage: 2 | 4;   // veto stage or outranking stage
    reason: string;
  }>;
  robustAlternative: {
    option: string;
    why: string;                // minimax-regret rationale
  };
  methodTrace: Array<{
    stage: 1 | 2 | 3 | 4 | 5;
    name: "values" | "constraints" | "weights" | "outranking" | "ranking";
    output: unknown;             // stage-specific shape, rendered by UI as expandable JSON
  }>;
  workloadReducers: Array<{
    type: "prompt" | "skill" | "plugin" | "mcp_tool" | "playbook";
    title: string;
    description: string;
    artifact: {
      promptText?: string;       // for type: "prompt" — paste-ready
      skillName?: string;        // for type: "skill" — known skill ref
      pluginUrl?: string;
      mcpServer?: string;
      playbookSteps?: string[];
    };
    automationLevel: "user_executes" | "ai_assisted" | "fully_automated";
    coverage: "full_task" | "partial_task" | "task_setup";
    permission_tier: "T0" | "T1" | "T2" | "T3" | "T4" | "T5";
  }>;
  destinations: Array<{
    type: "user_ui" | "user_pdf";  // v2: "calendar_event" | "task_create" | "drafted_email" | "marketplace_search"
    delivered: boolean;
    deliveredAt?: Date;
    artifactUri?: string;
    error?: string;
  }>;
}
```

### 6.4 Why this matters for v1

Even though v1 ships only `user_form` → `user_ui/user_pdf`, locking the contracts now means:
- Adding a voice intake source = additive, no engine touch
- Adding an output destination (drafted email, calendar event, marketplace search) = additive, no engine touch
- Any single stage moving to a Railway sidecar = additive, no other-stage touch

## 7. Multi-tenant Data Architecture (Single-user UX, Multi-tenant Schema)

Per LD-04: UI shows one practitioner per account. **Schema is multi-tenant from day 1** so v2 enables without schema migration.

### 7.1 Schema

```typescript
// shared/schema.ts (Drizzle)
export const tenants = pgTable("tenants", {
  id: uuid("id").primaryKey().defaultRandom(),  // UUID v7 helper
  ownerUserId: uuid("owner_user_id").notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull().default("Personal"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const decisions = pgTable("decisions", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  templateId: text("template_id").notNull(),
  intake: jsonb("intake").notNull(),
  recommendation: jsonb("recommendation"),
  alternatives: jsonb("alternatives"),
  robustAlternative: jsonb("robust_alternative"),
  methodTrace: jsonb("method_trace"),
  workloadReducers: jsonb("workload_reducers"),
  destinations: jsonb("destinations"),
  status: text("status", { enum: ["pending", "complete", "failed"] }).notNull().default("pending"),
  shareToken: text("share_token").unique(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => ({
  tenantIdx: index().on(t.tenantId),
  tenantUserIdx: index().on(t.tenantId, t.userId),
  shareTokenIdx: index().on(t.shareToken),
}));
```

V1 behavior: each user gets one auto-created tenant at signup (their "Personal" tenant). Every decision row carries `tenant_id`. UI never shows a tenant switcher.

V2 enable: add `memberships(user_id, tenant_id, role)` table + tenant-switcher UI. Existing data already has `tenant_id`s — no migration.

### 7.2 Runtime split (driven by Neon HTTP-driver limitation)

Neon's HTTP driver doesn't reliably preserve transaction-scoped GUCs that RLS depends on. Per Neon's official docs (https://neon.com/docs/serverless/serverless-driver, retrieved 2026-05-09): *"If you require session or interactive transaction support…use WebSockets."*

| Runtime | Used for | Driver |
|---|---|---|
| Vercel Edge | Static pages, marketing, anonymous routes | n/a |
| Vercel Node | All DB-touching routes (intake POST, decisions GET, auth) | `@neondatabase/serverless` `Pool` (WebSocket) |

Single env var unchanged: `DATABASE_URL`. Driver imported as `Pool` not `neon` HTTP function.

### 7.3 Per-request actor context (lifted from ProductPilot's `server/storage-hybrid.ts`)

```typescript
// lib/db/actor.ts
import { AsyncLocalStorage } from "async_hooks";
import { Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import { sql } from "drizzle-orm";

interface DbActorContext {
  userId: string;
  tenantId: string;
}

const dbActorContext = new AsyncLocalStorage<DbActorContext>();
const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 10 });
export const db = drizzle(pool);

export function runWithActor<T>(ctx: DbActorContext, fn: () => Promise<T>): Promise<T> {
  return dbActorContext.run(ctx, fn);
}

export async function withActor<T>(operation: (tx: typeof db) => Promise<T>): Promise<T> {
  const actor = dbActorContext.getStore();
  if (!actor) throw new Error("withActor called outside actor context");
  return db.transaction(async (tx) => {
    await tx.execute(sql`
      SELECT
        set_config('app.current_user_id', ${actor.userId}, true),
        set_config('app.current_tenant_id', ${actor.tenantId}, true)
    `);
    return operation(tx);
  });
}
```

Middleware on every authenticated DB-touching route:

```typescript
// app/api/decisions/route.ts
export const runtime = "nodejs";  // NOT edge — required for WebSocket pool

export async function POST(req: Request) {
  const session = await getSession(req);
  if (!session) return new Response("Unauthorized", { status: 401 });
  return runWithActor(
    { userId: session.userId, tenantId: session.tenantId },
    async () => withActor(async (tx) => {
      // RLS auto-enforced; no need to write WHERE user_id = ...
      const decisions = await tx.select().from(decisionsTable);
      return Response.json(decisions);
    })
  );
}
```

### 7.4 RLS policies

```sql
ALTER TABLE decisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE decisions FORCE ROW LEVEL SECURITY;

CREATE POLICY decisions_tenant_isolation ON decisions
  FOR ALL
  USING (tenant_id::text = current_setting('app.current_tenant_id', true))
  WITH CHECK (tenant_id::text = current_setting('app.current_tenant_id', true));
```

Apply same shape to `tenants` and any future user-owned table. `FORCE ROW LEVEL SECURITY` ensures the policy applies even to the table owner role.

V2 multi-tenant policy (additive — same `USING` expression, additional clause):

```sql
USING (
  tenant_id::text = current_setting('app.current_tenant_id', true)
  OR tenant_id IN (SELECT tenant_id FROM memberships WHERE user_id::text = current_setting('app.current_user_id', true))
)
```

### 7.5 Performance

- Index `(tenant_id)` first on every user-owned table
- Two-column `(tenant_id, user_id)` index for common queries
- RLS overhead: ~5–10% on indexed reads
- WebSocket cold-start: ~50–100ms — acceptable since the engine call already takes ~6s end-to-end

## 8. UI Synthesis Dimensions (mapped to I/O contracts)

| Feature | I/O role | Synthesis dimensions |
|---|---|---|
| **F-01 Template selector** | **Input** — emits `templateId` selection | full-screen list of 3 cards on `/app` landing; bottom nav to history. **CTA primary** (only entry point). **Tone** terse, action-oriented: "Decide your capacity" / "Decide pricing" / "Decide a hire". **Visual weight** hero, full-bleed, large tap targets. **Empty state** N/A. |
| **F-02 Intake form** | **Input** — collects `fields` and packages as `DecisionInput`, POSTs to `/api/decisions` | single column, one question-group per scroll section, mobile keyboard-friendly. **CTA primary** "Get my recommendation" sticky-bottom; **secondary** "Save & finish later". **Tone** concise plain language. **Visual weight** section heading per question group. **Empty state** first-run hint at top: "This takes ~5 minutes. Your answers stay on this device until you submit." Dismissible (localStorage flag). |
| **F-04 Recommendation UI** | **Output** — renders `recommendation`, `alternatives`, `methodTrace`, `workloadReducers`. Save/share emits `destinations[]` entries. | recommendation card above fold; alternatives collapsed below; "show the work" expand reveals method trace; **`workloadReducers` rendered as 3-card carousel below the recommendation**; sticky-bottom save/share. **CTA primary** "Save this decision" / "Sign in to save"; **secondary** "Show the work"; **adjunct** "Share". **Tone** confident but qualified — "Recommended: hire a part-time virtual assistant. Confidence: 78%." Never "you must" / "you should always". **Visual weight** recommendation = hero; alternatives = collapsed; reasoning = inline expand. **Empty state** N/A. |
| **F-05 1-page summary export** | **Output** — renders `DecisionOutput` in print-optimized HTML; emits `destinations[].type: "user_pdf"` row | triggered from F-04 "Save & share"; opens browser print preview. **CTA secondary** on F-04. **Tone** re-uses F-04 copy verbatim. **Visual weight** print-optimized — single column, heading hierarchy, no nav chrome, no dark mode. **Empty state** N/A. |

## 9. Auth Model

- **Sign-up flow:** email+password OR magic link (Better Auth, both providers configured)
- **Email verification:** required for production; lenient in dev
- **Session:** HTTPS-only cookie, SameSite=lax, 7-day rolling renewal
- **CSRF:** Better Auth's built-in CSRF tokens
- **Password storage:** Argon2id (Better Auth default)
- **Magic link delivery:** Resend, single-use tokens, 1 hr expiry
- **RBAC:** none (single-user accounts in v1; expansion path in §15 ADR-003)
- **Account deletion:** FK CASCADE to `decisions` and `tenants`; tombstoned for 30 days

## 10. Required API Keys & Env Vars

```env
# Database (Neon)
DATABASE_URL=                # Required — postgresql://... — get from console.neon.tech

# Better Auth
BETTER_AUTH_SECRET=          # Required — openssl rand -base64 32
BETTER_AUTH_URL=             # Required — http://localhost:3000 (dev) / https://decisiondoctor.app (prod)

# Email (Resend) — for magic links + email verification
RESEND_API_KEY=              # Required — https://resend.com/api-keys
AUTH_FROM_EMAIL=             # Required — "Decision Doctor <auth@decisiondoctor.app>"

# LLM (Groq)
GROQ_API_KEY=                # Required — https://console.groq.com/keys
GROQ_MODEL=openai/gpt-oss-120b  # Pinned via env var per LD-02

# Observability (optional but recommended)
SENTRY_DSN=                  # Optional — leave blank to disable
LOG_LEVEL=info               # pino level
```

For each key: status flag should be set after secrets-vault check.

### Service Profile — Groq

- **What it does:** Ultra-fast LLM inference; primary model for the decision engine; supports reasoning extraction.
- **Auth method:** API key in `Authorization: Bearer` header.
- **Required env vars:** `GROQ_API_KEY`, `GROQ_MODEL=openai/gpt-oss-120b`.
- **Official SDK:** `groq-sdk` (Node.js)
- **Initialization:** `const groq = new Groq({ apiKey: process.env.GROQ_API_KEY })`
- **Reasoning extraction:** `reasoning_format: 'parsed'` returns reasoning content separate from final answer
- **Recommended model:** `openai/gpt-oss-120b` — Production · 131k context · 65k max output · ~500 tokens/sec · ~$0.15/M input, $0.60/M output · supports reasoning
- **Rate limits:** Free tier rate-limited; pay-as-you-go from day one is fine for hackathon volume
- **Source:** https://console.groq.com/docs/models · https://console.groq.com/docs/api-reference · retrieved 2026-05-09 · ✅ T1

## 11. Tailored Security Checklist

**Active lanes:** Per-user (Lane 2) + Agentic (Lane 4 layer, since LLM is core).

**Excluded:** Multi-tenant SaaS UX controls (single-user accounts in v1) · Sensitive-data PHI controls (explicitly out of scope per ADR-002).

### 11.1 Threat model

OWASP LLM Top 10 (LLM01 prompt injection, LLM02 insecure output handling, LLM05 supply-chain secrets, LLM06 sensitive info disclosure, LLM08 excessive agency) + OWASP Agentic Top 10 (ASI03 identity/privilege abuse, ASI04 tool misuse, ASI06 memory poisoning) + Cisco DefenseClaw 3-pillar (Govern: tool allowlist · Inspect: pre/post-call scan · Prove: audit trail). Per-control implementation, severity, and source citation are enumerated in §11.3.

**Source:** `~/dev/research/topics/product-dev/product-dev.agentic-systems-security-references.md` (T1 sources throughout — OWASP project pages, NIST AI 600-1, MITRE ATLAS, Cisco DefenseClaw repo).

### 11.2 HIPAA-adjacent path (v2, deferred per ADR-002)

When PHI is accepted, three additions ship together:

1. **BAAs (Business Associate Agreements)** — required with every downstream service that touches PHI:
   - **Groq** — BAA path verified via enterprise tier (status: open question; confirm before acceptance)
   - **Resend** — BAA via enterprise tier
   - **Neon** — BAA via enterprise tier
   - **Vercel** — BAA via Enterprise plan (already documented)
2. **Encryption at rest** — `pgcrypto` extension for any column that may hold PHI; AES-256-GCM via `DATA_ENCRYPTION_KEY` for BYOK secrets (pattern lifted from ProductPilot's `server/lib/secret-crypto.ts`).
3. **Append-only audit log** — `audit_events` table with no UPDATE / DELETE policy on RLS. Tracks every PHI read, write, export. Immutable hash-chain for regulated audits.

V2 enables the path; v1 explicitly refuses PHI inputs at the Zod schema layer to keep this entire trio out of scope.

### 11.3 Data-flow diagram with trust boundaries

```mermaid
flowchart LR
    User["User<br/>Solo practitioner"]

    subgraph Browser["Browser (untrusted)"]
        UI["F-01/F-02/F-04/F-05<br/>Mobile-first PWA"]
        IDB[("IndexedDB<br/>form-state cache")]
    end

    subgraph Vercel["Vercel Node Runtime (trusted)"]
        Auth["Better Auth<br/>magic link + email/pwd"]
        API["/api/decisions<br/>route handler"]
        Actor["AsyncLocalStorage<br/>actor context (userId, tenantId)"]
        Engine["lib/engine/<br/>orchestrator + Stages 1-5"]
    end

    subgraph Neon["Neon Postgres (trusted)"]
        DB[("decisions, tenants, users<br/>RLS-gated by tenant_id")]
    end

    subgraph External["External services"]
        Groq["Groq API<br/>T2 read-only"]
        Resend["Resend API<br/>T4 emails"]
    end

    User -->|"DecisionInput<br/>(no PHI per ADR-002)"| UI
    UI <-->|cache| IDB
    UI -->|"POST /api/decisions"| API
    API -->|session check| Auth
    API -->|wraps handler| Actor
    Actor -->|"GUC-scoped tx<br/>set_config(...)"| DB
    Actor -->|invokes| Engine
    Engine -->|"per-stage prompts<br/>reasoning_format: parsed"| Groq
    Groq -->|reasoning + answer| Engine
    Engine -->|DecisionOutput| API
    Auth -->|magic link / verify| Resend
    Resend -.->|email| User
    API -->|"DecisionOutput<br/>+ workloadReducers"| UI
    UI --> User

    classDef trust fill:#e8f5e9,stroke:#2e7d32
    classDef untrust fill:#ffebee,stroke:#c62828
    classDef external fill:#fff3e0,stroke:#e65100
    class Browser untrust
    class Vercel,Neon trust
    class External external
```

**Trust boundary rules:**
- **Browser → Vercel:** all input validated at the API edge with Zod (rejects PHI patterns); origin/referer checked on non-auth POST routes
- **Vercel ↔ Neon:** WebSocket pool inside Node runtime; transaction-scoped GUCs prevent cross-request leakage; RLS is the safety net
- **Vercel → Groq:** prompts wrap user input in clearly-delimited `<user_intake>...</user_intake>` tags; model output treated as untrusted (HTML-escaped before render, per OWASP LLM02)
- **Vercel → Resend:** outbound only; magic-link tokens single-use, 1 hr expiry

### 11.4 Per-control table

| # | Control | Severity | Implementation | Source |
|---|---|---|---|---|
| **Public baseline (Lane 1)** | | | | |
| P1 | Rate limiting | P0 | `@upstash/ratelimit` IP-based on `/api/auth/*` and `/api/decisions/*` | OWASP Web A04 |
| P2 | Input validation | P0 | Zod on every Server Action and API route | OWASP Web A03 |
| P3 | CORS allowlist | P0 | `next.config.js` headers — explicit origin allowlist | OWASP Web A05 |
| P4 | Content Security Policy | P1 | `next.config.js` CSP headers; `script-src 'self'` | OWASP Web A05 |
| P6 | No secrets in client bundle | P0 | Lint rule: no `process.env.GROQ_*` outside server boundaries | OWASP Web A02 |
| **Per-user (Lane 2)** | | | | |
| U1 | Auth library | P0 | Better Auth — credential + magic link providers configured | OWASP Web A07 |
| U2 | Postgres RLS w/ `app.current_user_id` + `app.current_tenant_id` GUCs | P0 | §7.4 migrations enable RLS + FORCE on `decisions`, `tenants`; policies reference `current_setting('app.current_tenant_id')`; transaction-scoped via §7.3 middleware | OWASP Web A01 |
| U3 | Session security | P0 | HTTPS-only cookie, SameSite=lax, rotating tokens | OWASP Web A07 |
| U4 | CSRF protection | P0 | Better Auth's built-in CSRF tokens | OWASP Web A01 |
| U6 | Account-takeover protection | P1 | Email verification on signup; rate-limited login | OWASP Web A07 |
| U7 | Argon2id password hashing | P0 | Better Auth default | OWASP Web A02 |
| **Agentic layer (Lane 4)** | | | | |
| A1 | LLM01 — Prompt injection mitigation | P0 | System prompt sealed; user input wrapped in `<user_intake>...</user_intake>`; never echo user input as instructions | OWASP LLM01 |
| A2 | LLM02 — Insecure output handling | P0 | Treat LLM output as untrusted; HTML-escape before rendering; reasoning content rendered in `<pre>` blocks | OWASP LLM02 |
| A4 | LLM06 — Sensitive info disclosure | P0 | No PHI accepted in intake (Zod rejects PHI-shaped fields); intake fields are categorical/numeric only | OWASP LLM06 |
| A5 | LLM08 — Excessive agency | P0 | LLM can only return structured Decision JSON; cannot trigger external actions or tool calls in v1 | OWASP LLM08 |
| BY2 | Per-user LLM rate limit | P0 | Counter per user-id; cap at 20 decisions/day to prevent runaway Groq costs | DefenseClaw Govern |
| AT1 | Audit log of LLM calls | P1 | Append-only `audit_events` row per decision: user_id, template_id, model, tokens_in, tokens_out, ts | NIST AI 600-1 GV-3.2 |

## 12. Permission Tiers

| Tool/service | Tier | Why this tier | Approval gate |
|---|---|---|---|
| **Groq API** | T2 | Read-only external call (prompt → text). No actions on user systems. Aggregate practice data only (no PHI). | None — automatic on form submit |
| **Resend API** | T4 | External communication — sends magic link / verification email. | Human action triggers it (sign-in attempt) |

Workload-reducer entries carry their own per-item `permission_tier` field (see §6.3 schema). V1 entries are all T0 (paste-ready prompts) or T1 (playbook text). V2 destinations like `calendar_event` (T3) and `drafted_email` (T4) inherit user-approval from this scale.

## 13. Risk Reason per Commit Class

Build-loop's plan-verify Item 16 routes high-consequence commits to thinking-tier orchestration.

| Commit class | `risk_reason` | Why |
|---|---|---|
| Auth implementation (F-06) | `security boundary` | Better Auth setup, magic link, email/password, session handling, RLS policies |
| Schema migration commits | `persistence contract` | Multi-tenant tables, FORCE RLS, FK CASCADE |
| Engine + transparent UI (F-03, F-04) | `user trust claim` | The "show the work" claim is load-bearing. A bug that fakes the reasoning trace, or shows wrong confidence, directly violates user trust |
| Other commits (F-01, F-02, F-05, F-07) | _omit_ | Default tier acceptable |

**PRD-level dominant `risk_reason`:** `user trust claim` (set in frontmatter).

## 14. Pre-Build Checklist

Before Claude Code / Codex starts:

- [ ] Verify in secrets-vault: `GROQ_API_KEY`, `DATABASE_URL`, `BETTER_AUTH_SECRET`, `RESEND_API_KEY`. Mark ✅ if cached, ⏳ if not.
- [ ] If ⏳ on `GROQ_API_KEY` → https://console.groq.com/keys
- [ ] If ⏳ on `DATABASE_URL` → https://console.neon.tech (create project, free tier)
- [ ] Generate `BETTER_AUTH_SECRET` via `openssl rand -base64 32`
- [ ] Set `BETTER_AUTH_URL` (dev: `http://localhost:3000`)
- [ ] If ⏳ on `RESEND_API_KEY` → https://resend.com (verify domain `decisiondoctor.app` if deploying to prod; localhost works without verification for dev)
- [ ] Set `AUTH_FROM_EMAIL` (e.g. `Decision Doctor <auth@decisiondoctor.app>`)
- [ ] Buy domain `decisiondoctor.app` (or pick a temp Vercel preview URL for hackathon)
- [ ] Confirm Groq pricing tier — pay-as-you-go is fine for hackathon volume

## 15. ADRs

### ADR-001 — LLM = Groq, model `openai/gpt-oss-120b`

**What's locked:** Groq, model pinned via `GROQ_MODEL` env var.

**What it means for the build:** Groq returns the model's reasoning content as a separate field (not buried in the answer text), which is what lets the UI show the math without us writing a parser. ~500 tokens/sec keeps the "submit form → see recommendation" round-trip under 6 seconds on a phone.

**Change cost later:** Swap models within Groq = env var change. Move off Groq = M (~6 hr) — adapter layer + prompt tweak.

**Maps to north-star:** "20 minutes" + "the math made it feel safe". Speed makes the time budget viable; reasoning extraction is what lets the UI show the math.

### ADR-002 — No PHI in v1 intake

**What's locked:** Intake fields are categorical or numeric only — no patient names, diagnoses, MRNs, or free-text fields long enough to plausibly contain them. Zod schema enforces it; UI tells the user "no PHI accepted."

**What it means for the build:** Sidesteps HIPAA entirely. No BAAs with Groq / Resend / Neon, no encryption-at-rest, no audit-log infrastructure. The practitioner describes her practice in aggregate (patient counts, hours/week, revenue ranges) — that's all the engine needs.

**Change cost later:** Adding PHI = ~3–5 days. BAAs to negotiate, encryption layer to add, audit log to wire up, intake schema to expand. Tracked as F-14 in P1 backlog.

**Maps to north-star:** "she'd been putting off". HIPAA risk is the largest blocker to using ANY healthcare-adjacent tool. Removing it from v1 turns "I should look at this someday" into "I can try this now."

### ADR-003 — Single-user UX, multi-tenant-ready architecture

**What's locked:** UI shows one practitioner per account (no org switcher, no team UI). Schema anticipates multi-tenant from day 1: every user-owned table includes `tenant_id` defaulting to a per-user "personal" tenant. RLS checks both `user_id` AND `tenant_id`.

**What it means for the build:** Single-user UX stays simple. F-06 (auth + history) is still S-effort. The small cost paid now: one extra column per user-owned table, two-condition RLS policies instead of one.

**Change cost later:** Enabling multi-tenant = M (add `memberships` table, RBAC enforcement, org switcher UI). NOT XL anymore because schema already supports it.

**Maps to north-star:** "20 minutes" + protects "the math made it feel safe". Single-user UI is fewer clicks. Multi-tenant arch keeps RLS correctness intact when v2 adds shared org workspaces — that correctness is what makes the trust claim defensible.

### ADR-004 — Engine logic = composable per-stage prompts, sidecar-ready

**What's locked:** MCDA Stages 1–5 may run as one prompt or multiple prompts (whichever performs better in dev), but every stage that could plausibly become a sidecar service must be invoked as a discrete, well-bounded prompt — not interleaved into one mega-prompt. Orchestrator calls each stage as a function (`runStage1Values()`, `runStage4Outranking()`, etc.).

**What it means for the build:** A future Railway sidecar can pick up any single stage (e.g., Stage 4 deterministic ELECTRE outranking) without refactoring the orchestrator. Whether that stage function calls Groq or a sidecar service becomes a one-flag config change.

**Change cost later:** Move any stage to a Railway service = S–M per stage. Add adapter for that stage, point flag at sidecar, leave the rest of the engine unchanged.

**Maps to north-star:** "the math made it feel safe". Discrete stages = discrete reasoning blocks the UI renders separately. A mega-prompt would collapse the trace into one wall of text and break the transparency UX. Sidecar-readiness protects (c) over time — Stage 4 outranking can move to deterministic ELECTRE later without breaking the rest.

### ADR-005 — Better Auth + Resend, magic link AND email/password

**What's locked:** Better Auth handles both sign-in methods on one backend. Resend delivers magic links and email-verification links.

**What it means for the build:** One Better Auth config, one Resend account (one DNS verification, one API key). User accounts unify regardless of sign-up method. F-06 implementation stays S-effort.

**Change cost later:** Add SSO (Google / Apple) = S — Better Auth supports natively, just add credentials. Drop one method (e.g., remove password) = S.

**Maps to north-star:** "she'd been putting off". Magic link removes the most common signup friction (forgotten password); email/password serves users who want a recoverable account. Either path keeps "putting off" from spreading from decisions to tool adoption.

## 16. Decision Log (runtime, distinct from §3 Locked Decisions)

Captures decisions made during the build. Empty on day 1; appended to as the build progresses.

| # | Date | Decision | Why | Reversibility |
|---|---|---|---|---|

## 17. Assumptions (sized for blast radius)

| # | Assumption | Size | Rationale |
|---|---|---|---|
| A-01 | UUID v7 primary keys | S | Drizzle helper; sortable; standard for new code |
| A-02 | English-only UI v1 | S | Equity prompt mentions English-fluency assumption is the access barrier; v1.1 can add i18n |
| A-03 | Mobile-first responsive design (vs separate mobile-only) | XS | Tailwind responsive utilities cover both with one codebase |
| A-04 | Static HTML "browser print to PDF" for F-05 (no `@react-pdf/renderer`) | S | Zero additional dep; renders consistently from existing recommendation view |
| A-05 | `@ducanh2912/next-pwa` Next.js 16 compatibility verified at install | M | Original `next-pwa` unmaintained; this fork is the active community choice. Verify on day 1 |
| A-06 | Groq's `reasoning_format: parsed` returns structured reasoning content | M | Confirmed at API-reference level; exact response shape sanity-checked with curl on day 1 |
| A-07 | Decision intake forms ≤ 7 fields per template | S | Concept card sets ~5 min input target |
| A-08 | No real-time / streaming UI for v1 | S | Groq's 500 t/s makes ~6s p95 realistic; can add streaming v1.1 |
| A-09 | Confidence (0–100) computed deterministically from TOPSIS top-1/top-2 margin | M | Open: exact formula. LLM-self-reported confidence is unreliable; derive from method_trace |
| A-10 | Demo data + real wife data both flow through same code path; no demo mode | XS | One code path is simpler for hackathon |
| A-11 | All v1 workloadReducers ship at `automationLevel: "user_executes"` | S | V1 is text-only artifacts; ai_assisted and fully_automated are v2 connectors |
| A-12 | Stage 5 (final ranking) generates ≥3 workloadReducers per recommendation | S | Bake into Stage 5 prompt template; verify in T-03 |

## 18. F-criteria (Functional) and Q-criteria (Quality)

### 18.1 F-criteria — does the feature do what it should

(Repeated from §5 tests for visibility — same content, different framing)

| ID | Pass condition | Grader |
|---|---|---|
| T-01 | Template selector reaches intake form in ≤3 taps | manual + e2e test |
| T-02 | Intake form: ≤7 fields, Zod-validated, PHI-rejecting; IndexedDB persistence | unit + e2e |
| T-03 | Decision JSON contract met; p95 latency <6s | integration test against Groq |
| T-04 | Recommendation UI renders all required elements at 375px viewport | visual + e2e |
| T-05 | Export contains all 5 elements; signed URL viewable without auth | unit + manual |
| T-06 | Magic link AND email/password both succeed; RLS prevents cross-user reads | integration |
| T-07 | PWA installs; templates cached; offline form survival; queued submission | manual on real phone |
| T-08 | Cross-user RLS: 404 not 403 | integration test |
| T-09 | PHI rejection at Zod layer | unit |
| T-10 | 21st Groq call/24h returns 429 | integration with rate-limit fixture |

### 18.2 Q-criteria — is the build clean

| ID | Pass condition | Grader |
|---|---|---|
| Q-01 | TypeScript: `tsc --noEmit` exits 0 | CI |
| Q-02 | Lint: `eslint` exits 0 on changed files | CI |
| Q-03 | Tests: all F-criteria tests green | CI |
| Q-04 | No `process.env.GROQ_*` outside server-only modules (lint rule) | CI |
| Q-05 | Drizzle migration runs cleanly on a fresh Neon DB | CI |
| Q-06 | npm audit: no HIGH or CRITICAL advisories with available fixes | CI |
| Q-07 | Lighthouse: PWA score ≥ 90 on mobile audit of `/app` | manual on day 3 |

## 19. Total Effort Estimate

- 3× S (~120k tokens, ~3 hr) — F-01, F-05, F-06
- 3× M (~600k tokens, ~9 hr) — F-02, F-04, F-07
- 1× L (~400k tokens, ~6 hr) — F-03 (decision engine pipeline)

**Total: ~1.1M tokens · ~18 hr wall-clock**

3-day hackathon = ~24 working hours. ~6 hr buffer for demo polish + integration debugging. After build, audit actuals and PR-back any rubric refinements.

⚠️ **Scope warning:** This is at the upper edge of one-shot feasibility. If F-03 over-runs, drop F-07 to v1.1.

## 20. Open Questions

Each must satisfy build-loop's blocking-and-novel gate: (a) changing the answer changes ≥1 P0 test, AND (b) not answerable from existing context.

| Q | What | blocking_test | What would resolve it |
|---|---|---|---|
| OQ-01 | Confirm Groq's `reasoning_format: parsed` exact response shape | T-03 | 10-min curl on day 1 against `gpt-oss-120b` |
| OQ-02 | Confirm `@ducanh2912/next-pwa` Next.js 16 compatibility | T-07 | `npm install` + smoke test on day 1; fallback = hand-rolled service worker (~30 min XS) |
| OQ-03 | Exact confidence-score formula (TOPSIS top-1/top-2 margin or alternative) | T-03, T-04 | 30-min eval comparing 3 formulas against 3 sample decisions |
| OQ-04 | Should the default confidence threshold for "high confidence" green badge be ≥75 or ≥80? | T-04 | Spot-check with 3–5 sample recommendations; tune based on UX feel |
| OQ-05 | Custom domain decision before May 12 | none directly | User decision |
| OQ-06 | Groq BAA path for v2 (if PHI ever accepted) | none in v1 (gates F-14, not P0) | Vendor inquiry to Groq enterprise sales |

OQ-05 and OQ-06 don't gate v1; tracked here for traceability.

## 21. Spec Object (JSON, source of truth)

Markdown above is the rendering layer. The structured object below is what downstream tooling (linters, traceability checkers) consumes.

```json
{
  "needs": [
    {"id": "U-01", "text": "Solo healthcare practitioners need to make recurring high-stakes business decisions without CFO/consultant/analyst access."},
    {"id": "U-02", "text": "Healthcare-adjacent users need to see the math behind every AI recommendation."},
    {"id": "U-03", "text": "Busy practitioners need decisions in ≤20 min using ≤5 min of structured intake on phone."},
    {"id": "U-04", "text": "Owner-operators need a robust fallback if assumptions shift."},
    {"id": "U-05", "text": "Compliance-conscious users need v1 to never accept or store PHI."},
    {"id": "U-06", "text": "Returning users need to see prior decisions and reasoning."},
    {"id": "U-07", "text": "Offline-tolerant users need intake to survive spotty connectivity."}
  ],
  "features": [
    {"id": "F-01", "name": "Template selector", "size": "S", "satisfies": ["U-01", "U-03"], "data": ["D-01"], "test": "T-01"},
    {"id": "F-02", "name": "Adaptive intake form", "size": "M", "satisfies": ["U-01", "U-03", "U-05", "U-07"], "data": ["D-02"], "test": "T-02"},
    {"id": "F-03", "name": "Decision engine pipeline", "size": "L", "satisfies": ["U-01", "U-02", "U-04"], "data": ["D-02", "D-03", "D-04", "D-05", "D-06", "D-09"], "test": "T-03"},
    {"id": "F-04", "name": "Transparent recommendation UI", "size": "M", "satisfies": ["U-02"], "data": ["D-03", "D-04", "D-05", "D-06", "D-09"], "test": "T-04"},
    {"id": "F-05", "name": "1-page summary export", "size": "S", "satisfies": ["U-02"], "data": ["D-03", "D-04", "D-05", "D-08"], "test": "T-05"},
    {"id": "F-06", "name": "Auth + decision history", "size": "S", "satisfies": ["U-06"], "data": ["D-07", "D-08"], "test": "T-06"},
    {"id": "F-07", "name": "PWA + IndexedDB cache + queued submission", "size": "M", "satisfies": ["U-07"], "data": ["D-01", "D-02"], "test": "T-07"}
  ],
  "tests": [
    {"id": "T-01", "type": "F", "verifies": "F-01", "grader": "manual+e2e"},
    {"id": "T-02", "type": "F", "verifies": "F-02", "grader": "unit+e2e"},
    {"id": "T-03", "type": "F", "verifies": "F-03", "grader": "integration"},
    {"id": "T-04", "type": "F", "verifies": "F-04", "grader": "visual+e2e"},
    {"id": "T-05", "type": "F", "verifies": "F-05", "grader": "unit+manual"},
    {"id": "T-06", "type": "F", "verifies": "F-06", "grader": "integration"},
    {"id": "T-07", "type": "F", "verifies": "F-07", "grader": "manual on real phone"},
    {"id": "T-08", "type": "F-security", "verifies": "RLS isolation", "grader": "integration"},
    {"id": "T-09", "type": "F-security", "verifies": "PHI rejection", "grader": "unit"},
    {"id": "T-10", "type": "F-cost", "verifies": "rate limit", "grader": "integration"},
    {"id": "Q-01", "type": "Q", "verifies": "TypeScript strict", "grader": "CI"},
    {"id": "Q-02", "type": "Q", "verifies": "ESLint clean", "grader": "CI"},
    {"id": "Q-03", "type": "Q", "verifies": "All F-tests green", "grader": "CI"},
    {"id": "Q-04", "type": "Q", "verifies": "no GROQ_* in client bundle", "grader": "CI lint"},
    {"id": "Q-05", "type": "Q", "verifies": "Drizzle migration on fresh DB", "grader": "CI"},
    {"id": "Q-06", "type": "Q", "verifies": "npm audit no HIGH/CRITICAL", "grader": "CI"},
    {"id": "Q-07", "type": "Q", "verifies": "Lighthouse PWA ≥90", "grader": "manual day 3"}
  ],
  "data_points": [
    {"id": "D-01", "entity": "DecisionTemplate"},
    {"id": "D-02", "entity": "DecisionInput"},
    {"id": "D-03", "entity": "Recommendation"},
    {"id": "D-04", "entity": "Alternatives"},
    {"id": "D-05", "entity": "RobustAlternative"},
    {"id": "D-06", "entity": "MethodTrace"},
    {"id": "D-07", "entity": "Session"},
    {"id": "D-08", "entity": "DecisionRecord"},
    {"id": "D-09", "entity": "WorkloadReducers"}
  ],
  "adrs": [
    {"id": "ADR-001", "title": "LLM = Groq, model gpt-oss-120b", "rollback": "M (~6 hr provider swap)"},
    {"id": "ADR-002", "title": "No PHI in v1 intake", "rollback": "L (~3-5 days for HIPAA path)"},
    {"id": "ADR-003", "title": "Single-user UX, multi-tenant-ready architecture", "rollback": "M to enable multi-tenant"},
    {"id": "ADR-004", "title": "Engine = composable per-stage prompts, sidecar-ready", "rollback": "S–M per stage to move to sidecar"},
    {"id": "ADR-005", "title": "Better Auth + Resend, magic link AND email/password", "rollback": "S to add SSO or drop a method"}
  ],
  "open_questions": [
    {"id": "OQ-01", "blocks": ["T-03"]},
    {"id": "OQ-02", "blocks": ["T-07"]},
    {"id": "OQ-03", "blocks": ["T-03", "T-04"]},
    {"id": "OQ-04", "blocks": ["T-04"]},
    {"id": "OQ-05", "blocks": []},
    {"id": "OQ-06", "blocks": []}
  ]
}
```

## 22. Scaffold & Key Configurations

The initial repo state Claude Code / Codex should produce in the first ~30 minutes of build (before any feature code).

### 22.1 Scaffold commands (day-1 morning)

```bash
# 1. Bootstrap Next.js 16 with TypeScript + App Router + Tailwind
pnpm create next-app@latest decision-doctor --typescript --tailwind --app --src-dir=false --no-import-alias --use-pnpm
cd decision-doctor

# 2. Add core deps
pnpm add @neondatabase/serverless drizzle-orm zod
pnpm add -D drizzle-kit @types/node

# 3. Add auth + email
pnpm add better-auth resend

# 4. Add LLM
pnpm add groq-sdk

# 5. Add PWA
pnpm add @ducanh2912/next-pwa

# 6. Add rate limiter (for security checklist P1)
pnpm add @upstash/ratelimit @upstash/redis  # or roll a simple in-memory limiter for hackathon

# 7. Add observability (optional)
pnpm add pino @sentry/nextjs

# 8. Add UI helpers (optional but speeds up F-04)
pnpm add lucide-react clsx tailwind-merge
pnpm add -D @tailwindcss/forms @tailwindcss/typography

# 9. Initialize git + first commit
git init && git add . && git commit -m "chore: bootstrap Next.js 16 + Tailwind + TS"
```

### 22.2 `package.json` scripts

```json
{
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "next lint",
    "typecheck": "tsc --noEmit",
    "db:generate": "drizzle-kit generate",
    "db:migrate": "drizzle-kit migrate",
    "db:push": "drizzle-kit push",
    "db:studio": "drizzle-kit studio",
    "test": "vitest"
  }
}
```

### 22.3 `drizzle.config.ts`

```typescript
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./lib/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { url: process.env.DATABASE_URL! },
  strict: true,
  verbose: true,
});
```

### 22.4 `next.config.ts` (PWA + headers + runtime hints)

```typescript
import type { NextConfig } from "next";
import withPWAInit from "@ducanh2912/next-pwa";

const withPWA = withPWAInit({
  dest: "public",
  disable: process.env.NODE_ENV === "development",
  register: true,
  workboxOptions: {
    disableDevLogs: true,
    runtimeCaching: [
      {
        urlPattern: /\/app\/decisions\/new\/.*$/,
        handler: "NetworkFirst",
        options: { cacheName: "intake-pages" },
      },
      {
        urlPattern: /\/api\/templates$/,
        handler: "CacheFirst",
        options: { cacheName: "decision-templates", expiration: { maxAgeSeconds: 60 * 60 * 24 } },
      },
    ],
  },
});

const config: NextConfig = {
  reactStrictMode: true,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Content-Security-Policy", value: "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; connect-src 'self' https://api.groq.com https://api.resend.com; frame-ancestors 'none';" },
        ],
      },
    ];
  },
};

export default withPWA(config);
```

### 22.5 `tsconfig.json` additions

```json
{
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "paths": {
      "@/*": ["./*"],
      "@/lib/*": ["./lib/*"],
      "@/components/*": ["./components/*"]
    }
  }
}
```

### 22.6 ESLint rule — no GROQ_* in client bundle (Q-04)

Add to `eslint.config.js`:

```javascript
{
  files: ["app/**/*.tsx", "components/**/*.tsx"],
  rules: {
    "no-restricted-syntax": ["error", {
      selector: "MemberExpression[object.object.name='process'][object.property.name='env'][property.name=/^GROQ_/]",
      message: "GROQ_* env vars must not be referenced in client components. Use server actions or API routes."
    }]
  }
}
```

### 22.7 Initial `.env.example`

```env
# Database (Neon)
DATABASE_URL=postgresql://user:pass@ep-xxx.aws.neon.tech/db?sslmode=require

# Better Auth
BETTER_AUTH_SECRET=replace-with-openssl-rand-base64-32
BETTER_AUTH_URL=http://localhost:3000

# Email (Resend)
RESEND_API_KEY=re_xxx
AUTH_FROM_EMAIL=Decision Doctor <auth@decisiondoctor.app>

# LLM (Groq)
GROQ_API_KEY=gsk_xxx
GROQ_MODEL=openai/gpt-oss-120b

# Observability (optional)
SENTRY_DSN=
LOG_LEVEL=info
```

### 22.8 Env validation at boot

`lib/env.ts` — fail fast with a Zod schema, runs once at server start:

```typescript
import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().url(),
  BETTER_AUTH_SECRET: z.string().min(32),
  BETTER_AUTH_URL: z.string().url(),
  RESEND_API_KEY: z.string().min(10),
  AUTH_FROM_EMAIL: z.string(),
  GROQ_API_KEY: z.string().min(10),
  GROQ_MODEL: z.string().default("openai/gpt-oss-120b"),
  SENTRY_DSN: z.string().optional(),
  LOG_LEVEL: z.enum(["trace","debug","info","warn","error","fatal"]).default("info"),
});

export const env = envSchema.parse(process.env);
```

Import `lib/env.ts` from `lib/auth.ts`, `lib/groq.ts`, `lib/db/actor.ts` so missing/malformed env fails at boot, not mid-request.

### 22.9 Vercel project configuration

| Setting | Value | Why |
|---|---|---|
| Framework preset | Next.js | auto-detected |
| Build command | `pnpm build` | default |
| Node.js version | 20.x or higher | required for `async_hooks` and modern features |
| Environment variables | All from `.env.example` | set in Vercel dashboard, not committed |
| Edge Functions | Disabled for `/api/decisions/*` and `/api/auth/*` | per LD-08 — these need Node runtime for WebSocket pool |

In each affected route handler, `export const runtime = "nodejs"` enforces this declaratively.

### 22.10 First migration (one-shot)

```bash
# Generate the migration from schema
pnpm db:generate

# Apply to dev DB
pnpm db:push

# Verify in Drizzle Studio
pnpm db:studio
```

The first migration creates `users`, `tenants`, `decisions`, plus Better Auth's `sessions`, `accounts`, `verification_tokens`. RLS policies (§7.4) added in a follow-up migration once basic schema is verified.

### 22.11 Initial test setup (Vitest)

`vitest.config.ts`:

```typescript
import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    environment: "node",
    setupFiles: ["./tests/setup.ts"],
  },
});
```

`tests/setup.ts` should bootstrap a test DB connection and reset between tests.

### 22.12 Scaffold validation checklist

After completing 22.1–22.11 (~30 min), verify before writing any feature code:

- [ ] `pnpm dev` starts without error; `/` renders default Next.js landing
- [ ] `pnpm typecheck` exits 0
- [ ] `pnpm lint` exits 0
- [ ] `pnpm db:push` applies the initial schema to a fresh Neon DB
- [ ] `lib/env.ts` throws clear error if any required env var is missing
- [ ] PWA manifest visible at `/manifest.json` after `pnpm build`
- [ ] `Authorization` headers reaching `/api/auth/*` work (placeholder test)

Only after all 7 are green: start on F-01.

## 23. Build Handoff Prompt

Paste-ready for Claude Code or Codex. Self-contained.

```
You are building Decision Doctor for the MLT20 Equity & Access to AI Buildathon.
Round 1 due 2026-05-12. Round 1 rubric weights: Problem & Audience Fit 30%, Impact 25%, Demo & Storytelling 25%, Prototype Quality 10%, Sustainability 10%.

## Goal
A transparent decision engine for solo healthcare practitioners. ~5-min intake → one recommendation per high-stakes decision, with the math made visible. Each recommendation ships with paste-ready prompts, playbooks, and MCP-tool hooks that turn the decision into action.

v1 ships three decision templates (capacity, pricing, admin-hire) to a Next.js mobile-first PWA an owner-operator uses from her phone between patients.

## North-star
A practitioner makes 3 decisions in 20 minutes that she'd been putting off. Reported in her own words: "the math made it feel safe."

## Stack
- Next.js 16 (App Router) — mobile-first responsive Tailwind UI
- Neon Postgres (free tier) + Drizzle ORM, WebSocket Pool driver in Vercel Node runtime
- Better Auth (magic link + email+password)
- Groq SDK with `openai/gpt-oss-120b` and `reasoning_format: 'parsed'`
- @ducanh2912/next-pwa for PWA + service worker (verify Next 16 compat at install — fallback in §20 OQ-02)
- Resend for magic link / email verification
- Vercel deploy

## Folder layout
app/
  api/
    decisions/   (POST: run engine; GET /:id: fetch)
    auth/        (Better Auth handler)
  (public)/      (landing, marketing)
  (app)/         (authenticated; layout enforces auth)
    decisions/
      new/[templateId]/page.tsx
      [id]/page.tsx
      page.tsx
    layout.tsx
components/
  intake/
  recommendation/
  workload-reducers/
  pwa/
lib/
  auth.ts
  db/
    schema.ts            (Drizzle: users, tenants, decisions)
    actor.ts             (AsyncLocalStorage + withActor + runWithActor)
    index.ts
  engine/
    orchestrator.ts      (chains Stages 1-5)
    stage1-values.ts
    stage2-constraints.ts
    stage3-weights.ts
    stage4-outranking.ts
    stage5-ranking.ts
    templates/
      capacity.ts
      pricing.ts
      admin-hire.ts
    schema.ts            (DecisionInput + DecisionOutput Zod schemas)
  groq.ts                (Groq client; reasoning_format: parsed)
public/
  manifest.json
  icons/
.env.example
drizzle/

## Data model
[See PRD §7 — multi-tenant schema with FORCE RLS, GUC-scoped transactions]

## Auth model
[See PRD §9]

## Required env vars (verify in secrets-vault first)
GROQ_API_KEY, GROQ_MODEL=openai/gpt-oss-120b, DATABASE_URL, BETTER_AUTH_SECRET, BETTER_AUTH_URL, RESEND_API_KEY, AUTH_FROM_EMAIL.
SENTRY_DSN and LOG_LEVEL optional.

## Decision engine pipeline (PEDE / Layered MCDA)
The "show the work" magic. For each decision template, the orchestrator runs Stages 1-5 as discrete bounded functions:

1. VFT (Value-Focused Thinking) — restate user's stated objectives in standardized form
2. Veto / Hard constraints — eliminate options failing constraints (mark elimination_at_stage: 2)
3. Adaptive preference elicitation — derive criterion weights (PAPRIKA / BOED / TTM)
4. ELECTRE outranking — eliminate dominated options (mark elimination_at_stage: 4)
5. WSM or TOPSIS final ranking + minimax-regret robust alternative + LLM justification

Each stage is a separate Groq call (or future Railway sidecar). Orchestrator chains them.

Return JSON conforming to DecisionOutput schema (see §6.3). Confidence (0-100) computed deterministically from TOPSIS top-1/top-2 margin (see OQ-03 — finalize formula on day 1).

WorkloadReducers are generated at the end of Stage 5: ≥3 paste-ready artifacts per recommendation (prompt to draft a job description; playbook of vendor shortlist; MCP-tool hook for calendar reminder). All v1 entries are automationLevel: "user_executes".

## Security controls (must implement — see §11.4)
Lane 2 (Per-user) + Lane 4 (Agentic). All P0 controls implemented before declaring done. Notably:
- Postgres RLS w/ FORCE on `decisions` and `tenants`; tenant_id GUC scoped per transaction
- Per-user LLM rate limit (20/day)
- No PHI in intake — Zod schema is categorical/numeric only (T-09 verifies)
- Prompt injection mitigation: user input wrapped in <user_intake> tags
- LLM output rendered as untrusted: HTML-escape; reasoning in <pre>

## MVP scope (P0 only)
F-01 (S), F-02 (M), F-03 (L), F-04 (M), F-05 (S), F-06 (S), F-07 (M)

## Decision log
Empty. Append as build progresses (see §16).

## Assumptions (challenge before building if any feel wrong — see §17 for full list with sizes)

## Open Questions (PAUSE if you hit one — see §20)
OQ-01: Verify Groq reasoning_format: parsed response shape with curl on day 1
OQ-02: Verify @ducanh2912/next-pwa × Next 16 compat at npm install
OQ-03: Choose confidence formula (default: TOPSIS top-1/top-2 margin)
OQ-04: Confidence threshold for green badge (default: ≥75)

## Skills to load
- calm-precision (for transparent recommendation UI design)
- prompt-builder (for the per-stage MCDA prompts; this is the most leveraged set of prompts in the codebase)
- claude-api: NOT NEEDED (Groq, not Anthropic)
- apple-dev: NOT NEEDED (web only)

## Build rules
1. Build only P0 features. Stop before P1.
2. Run unit tests after each step. Schema test for Decision JSON shape is non-negotiable.
3. If you hit an Open Question, pause and ask the user.
4. If an assumption (§17) doesn't match user intent, ask before changing scope.
5. Commit after each logical chunk per §13 commit-class table.
6. After build, audit actuals vs estimate (~1.1M tokens, ~18 hr) and report.
7. Mobile-first: test every screen at 375px width before declaring done.

## Total budget
~1.1M tokens · ~18 hr wall-clock. If F-03 over-runs, drop F-07 to v1.1.

## When you're done
- ✅ All 7 P0 features pass acceptance criteria
- ✅ Demo URL on Vercel (preview is fine)
- ✅ A wife-recorded session would work end-to-end
- ⚠️ Any P1/v1.1 deferrals listed
- ❓ Any open question that surfaced during build

Begin.
```
