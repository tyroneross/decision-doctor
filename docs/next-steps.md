# Decision Doctor — Next Steps Execution Plan

**Date:** 2026-05-10
**HEAD:** `8dcb98b` (live deploy on Vercel)
**Buildathon round 1 deadline:** 2026-05-12 (~48h remaining)

This doc is the **execution playbook** for what to dispatch next. Items are ordered: round-1 commitments first, round-2+ second, hygiene last.

---

## Status snapshot

| Layer | Status |
|---|---|
| Core engine (Stages 1-5: ELECTRE + TOPSIS + minimax + LLM) | ✅ shipped |
| Sunrise UI overhaul (chat + history + detail) | ✅ shipped on `main` (commit `8dcb98b`); live on Vercel |
| Upstash Redis rate-limit | ✅ shipped (commit `73d1dc1`) |
| Better Auth integration test | ✅ shipped (commit `9793ca7`) |
| Chat-query tests T-CHAT-1..4 | ✅ shipped (commit `9793ca7`) |
| F-08 AI-feasibility scoring (Chunk A, ~1 day) | 🟡 planned — PRD must-have; design north star set (v2-07 chip pattern) |
| F-09 Skill/plugin scaffold generator (Chunk B, ~2 days) | 🟡 planned — needs v2-08 mockup before dispatch |
| F-10 AHP elicitation (Chunk C, ~1 day; runs alongside A) | 🟡 planned — new component + Stage 1B |
| F-11 PEDE Stage-0 classifier (Chunk D, ~1-2 days) | 🟡 planned — routing intelligence; post-buildathon |
| Visual diff vs mockups | ❌ not yet (no IBR/Playwright run on live deploy) |
| Sign-in screen Sunrise treatment | ❌ not yet (out of last round's scope) |
| Weekly workflow audit (v1.1) | ❌ not yet — Railway worker design pending |

---

## Recommended next-3 dispatches

### Dispatch #1 — Build-loop Chunk A: F-08 AI-feasibility scoring (~1 day wall-clock)

**Why next:** unblocks F-09 (scaffold viewer needs the feasibility field to render) and is the smallest-risk chunk that lands a visible product improvement. Round-1 still feasible if dispatched immediately.

**Command:**
```
/build-loop:build-loop  Implement F-08 per docs/research/f08-f09-plan-2026-05-10.md Chunk A.
                        Architecture target: lib/engine/stage6-feasibility.ts (NEW).
                        UI target: 4-tier feasibility chip on every workloadReducer card across
                        components/recommendation/RecommendationView.tsx and
                        components/decisions/DecisionsListClient.tsx.
                        Honor "LLM-classifies, TS-computes" architecture: Stage 6 LLM emits
                        {category, signals, rationale}; deterministic TS computes feasibilityScore
                        from category + signals per the rule table in the plan.
                        T-11 test required.
```

**Pre-dispatch checks:**
- Verify Groq API key is still valid (env var on Vercel)
- Confirm Stage 5's `stage5-ranking.ts` output schema can accept the new fields additively (it should — JSONB column)
- Ensure `temperature: 0` and structured-output JSON on the new LLM call (critical for determinism)

**Definition of done:**
- `pnpm typecheck` + `pnpm build` clean
- T-11 passes
- Live URL renders the new chip on a real decision (manual smoke)
- Architecture diff captured in `.navgator/architecture/<new-scan>/` per the 2B.1 standard

---

### Dispatch #2 — Build-loop Chunk C: F-10 AHP elicitation (~1 day, parallel-safe with Chunk A)

**Why next:** independent file set from F-08 (touches Stage 1B + new AhpPairwise component, not Stage 6 or RecommendationView's reducer chips). Can dispatch in parallel.

**Command:**
```
/build-loop:build-loop  Implement F-10 per docs/research/algorithm-problem-fit-2026-05-10.md
                        Part 4 (AHP row) + docs/PRD.md F-10 spec.
                        Architecture: lib/engine/stage1b-ahp.ts (NEW; eigenvector + CR).
                        UI: components/elicitation/AhpPairwise.tsx (NEW; mobile-friendly
                        pairwise comparison with Saaty 1-9 default OR coarsened 5-chip).
                        Wire branch on /app/decisions/new/[templateId]: "Let AI propose" (default)
                        vs "Set weights myself (AHP)".
                        T-13 test required: Saaty's 4-criteria textbook example must produce the
                        documented eigenvector within tolerance.
```

**Pre-dispatch checks:**
- Pick a numerical linear-algebra approach: power iteration (light, ~10 iterations for n≤8) vs `mathjs.eigs` (heavier but battle-tested). Plan suggests power iteration; T-13 will catch wrong implementations.

**Definition of done:**
- T-13 passes against Saaty's textbook fixture
- CR > 0.10 surfaces the "your judgments conflict" UI with the most-inconsistent pair flagged
- Live URL: a user can opt into AHP weights on a real decision; the resulting `methodTrace.weightSource` is `"ahp"`

---

### Dispatch #3 — Build-loop Chunk B: F-09 Skill/plugin scaffold generator (~2 days)

**Why third:** depends on F-08 (the feasibility field decides which reducers get a scaffold). Bigger surface (new drawer component + template module + Codex spec verification). Best as a focused build-loop run with v2-08 mockup as design north star.

**Pre-requisites BEFORE this dispatch:**
1. Write the v2-08 scaffold-viewer mockup per `f08-f09-plan-2026-05-10.md` §"UI surfaces"
2. Verify Codex `AGENTS.md` format via Context7 (`resolve-library-id` for openai/codex docs)
3. Verify Claude Code plugin schema is current — fetch latest from official docs

**Command (issue after the two prereqs):**
```
/build-loop:build-loop  Implement F-09 per docs/research/f08-f09-plan-2026-05-10.md Chunk B.
                        Architecture: lib/engine/stage7-scaffold.ts (NEW; deterministic), plus
                        lib/scaffold-generator.ts + lib/scaffold-templates/{skill,plugin,agents}.*.
                        UI: components/scaffold/ScaffoldViewer.tsx (NEW drawer) + CodeBlock.tsx (NEW).
                        Wire "Open scaffold" CTA on the Skill-ready card in RecommendationView.
                        T-12 test required: emitted SKILL.md + plugin.json + AGENTS.md block all
                        validate against their respective official schemas; copy-to-clipboard works.
```

---

## Roadmap beyond buildathon round 1

### Round 2 priorities (within ~1 week)

| # | Item | Owner | Notes |
|---|---|---|---|
| 1 | **Dispatch F-11 PEDE classifier** | Build-loop Chunk D | The routing unlock for VDD/EDD decisions. Closes the "false precision on identity questions" gap surfaced in `question-type-coverage-2026-05-10.md`. |
| 2 | Visual diff vs v2 mockups | IBR or Playwright | Run at 1320px and 375px against live deploy. Surface fidelity gaps. |
| 3 | Stabilize the `tests/e2e/concurrent.test.ts` flake | One-line threshold change | Preexisting; not from any recent build-loop run. |
| 4 | Apply Sunrise treatment to `/sign-in` | Build-loop or direct edit | First-impression match. |
| 5 | Wire `axe-core` into CI | Direct config edit | Closes the WCAG runtime check gap noted in `ux/considerations.md` |
| 6 | Add intake-summary card before engine fires | Build-loop small chunk | Closes Type-1 (Descriptive) coverage at per-session granularity per `question-type-coverage-2026-05-10.md`. |

### v1.1 (next 4-6 weeks)

| # | Item | Notes |
|---|---|---|
| 1 | **Weekly workflow audit** (Railway worker) | The Type-1 + Type-6 unlock. Multi-armed bandit over active AI tools. Per `f08-f09-plan-2026-05-10.md` §2 Vercel-vs-Railway sizing. |
| 2 | F-07 PWA installable | Hand-rolled SW per OQ-02 fallback. "Next step after core" per PRD. |
| 3 | F-12 VFT + F-13 RGT | Unlock the proper VDD pipeline (no false ranks on identity questions). |
| 4 | LLM response semantic cache via Upstash | High-leverage cost + latency win. Same drains across users hit cache. |
| 5 | Activation analytics | Wire events for "decision started → decision completed → skill copied" so time-to-first-value becomes measurable. |
| 6 | Schema migration: `decisions.workload_reducers` Zod-on-read guard | Drift detection as F-08/F-09/F-10 fields land. |

### v2 (deferred)

- F-14 BOED (replaces Stage-3 placeholder; CPU-heavier — consider Railway)
- F-15 Decision trees with expected value (Type-4 with branching uncertainty)
- F-16 Forecast layer (Type-3 chained before Type-4)
- F-17 Sobol sensitivity (offline threshold tuning)
- F-18 Multi-stakeholder AHP-group aggregation (couple/group decisions)
- F-19 Real options for "when to sell / when to pivot" (true Type-6)
- F-20 Adjacent verticals (LCSW/LMFT decision libraries)

---

## Execution rules during dispatches

1. **Always run an architecture scan before AND after each build-loop dispatch.** Per PRD §2B.1, scans land in `.navgator/architecture/`. Build-loop's Phase 4 Review must include the diff section.
2. **Update the docs index in PRD §2B.2 when a new doc is added.** Don't let `docs/` accumulate orphan files.
3. **Honor the LLM-vs-TS architecture invariant.** LLMs classify and propose; TS computes. Validated for Stage 6 (F-08) in `question-type-coverage-2026-05-10.md` validation pass. New stages must follow.
4. **Question-type-aware decline-and-reframe.** F-11 will make this automatic. Until then, when a user asks a Type-2/3/5 question, the chat handler should NOT push it into the Type-4 pipeline. Add chat-level detection as a near-term safeguard.
5. **Update `docs/architecture/architecture.md` + `docs/ux/considerations.md` + `docs/research/question-type-coverage-2026-05-10.md` after each F-criteria lands.** They're tracking docs; let them go stale and the routing decisions stop being trustworthy.

---

## Open questions blocking nothing but worth raising

1. **Codex `AGENTS.md` spec** — fetch the current format before F-09 Chunk B dispatches. Listed as Risk #1 in `f08-f09-plan-2026-05-10.md`.
2. **Decision-tree-driven decisions** — if a user has uncertain branches ("if VA works out then X else Y"), the current engine can't model. F-15 in v2.
3. **Multi-user / group decisions** — VIKOR-style compromise ranking is documented but unimplemented. Most relevant for "we as a couple should sell the practice" type decisions. F-18 v2.
4. **EHR integrations** — explicitly out per ADR-002 (no PHI). Revisit only if a compliant integration partner emerges.

---

## Cross-references

- `docs/PRD.md` §2A must-haves + §2B project-wide standards + §5 P0/P0+/P1/P2
- `docs/architecture/architecture.md` — current architecture topology + integration policy details
- `docs/ux/considerations.md` — nav paths + actions + I/O contracts
- `docs/research/f08-f09-plan-2026-05-10.md` — concrete file diffs for the next 2 chunks
- `docs/research/algorithm-problem-fit-2026-05-10.md` — algorithm × problem-type matrix
- `docs/research/question-type-coverage-2026-05-10.md` — coverage tracker with status + F-criteria mapping
- `STATUS.md` — historical build phases + open follow-ups (Vercel preview env, Resend domain, Sentry)
