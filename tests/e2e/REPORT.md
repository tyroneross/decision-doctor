# Decision Doctor — End-to-End Test Findings & Simplification Proposal

**Run:** 2026-05-10 against `lib/engine/orchestrator.runDecision()` directly (no auth/UI).
**Scope:** 5 personas × full engine pipeline + 25-concurrent scalability + architecture dep map.
**Verdict so far:** Engine ships and runs at scale; **3 correctness bugs** + **5 UX/AI-workflow gaps** that materially affect the trust claim. None are show-stoppers; all are tractable. Detailed below.

---

## §1 Per-persona scoring (decision-accuracy rubric, 0-2 / dim, pass = 8/12)

| Persona | Got | Confidence | A1 Capture | A2 Conf calib | A3 Reasons | A4 Trace | A5 Robust | A6 Reducers | **Total** |
|---|---|---|---|---|---|---|---|---|---|
| **P1 Sarah** (admin-hire) | Hire PT virtual asst | 51 | 2 | 1 | 1 | 2 | **0** | 1 | **7/12** ⚠ |
| **P2 Marcus** (pricing) | Raise 12-20% | 53 | 2 | **0** | 1 | 2 | **0** | 1 | **6/12** ❌ |
| **P3 Priya** (capacity) | Build waitlist | 53 | **0** | 2 | **0** | 2 | **0** | 1 | **5/12** ❌ |
| **P4 Linda** (pricing) | Tiered/premium | 59 | 1 | 2 | 2 | 2 | **0** | 1 | **8/12** ✅ |
| **P5 Diane** (admin-hire) | Hire PT virtual asst | 50 | 1 | 1 | 1 | 2 | 2 | 1 | **8/12** ✅ |

**Pass rate: 2/5 personas hit 8/12.** PRD threshold was 4/5. **Fail.** Three patterns explain it.

---

## §2 Three correctness bugs (must fix)

### Bug #1 — Confidence formula is biased low (affects every persona)

**Symptom.** Marcus's case is textbook: rates frozen 3 yr, 95% fill, waitlist, 22% gap to benchmark. Any human consultant says "raise rates, confidence > 85%". Engine returns `confidence: 53`.

**Root cause.** `lib/engine/stage5-ranking.ts:74` —
```ts
const confidence = Math.max(25, Math.min(100, Math.round(50 + 50 * margin)));
```
where `margin = closeness(top1) - closeness(top2)`. TOPSIS closenesses on normalized criteria scores typically span [0.4, 0.8], so margins are 0.05-0.3. Plug in: confidence = 50 + 50 × 0.06 = 53. Even the best case gives 65.

**Impact.** PRD §8 confidence band says ≥75 = green. **No persona ever hit green.** This breaks F-04's color coding (green/amber/red) — everything is amber. The trust claim "the math made it feel safe" requires *calibrated* confidence, not perma-amber.

**Fix options** (pick one):
- **(a) Recalibrate formula.** `confidence = 30 + 350 × margin` clamped [25, 95], so margin=0.2 → 100, margin=0.05 → 47. Empirically tune over the 5 personas.
- **(b) Use text labels.** Replace numeric with three buckets — *Strong call* / *Lean* / *Coin flip — see robust alt*. Simpler, less false precision, aligns with PRD §8 "confident but qualified" tone. **Recommended.**
- **(c) Multi-signal confidence.** Margin + dominance ratio + how many criteria favor top-1. More work; may overfit.

### Bug #2 — Robust alternative is degenerate (4/5 personas)

**Symptom.** P1, P2, P3, P4: `robustAlternative.option === recommendation.option`. The whole feature is a no-op.

**Root cause.** `lib/engine/stage5-ranking.ts:160 computeMinimaxRegret()` picks the candidate with the **smallest worst-case weighted regret under fixed weights**. That's mathematically correlated with TOPSIS top-1 — both reward the candidate that's strong across criteria. They will agree most of the time on typical templates.

The PRD §6.3 / U-04 intent is *"a robust fallback if my assumptions shift"* — i.e., perturb the weights, see which candidate stays good. The current implementation doesn't perturb anything.

**Fix.** Replace with weight-perturbation sensitivity:
```ts
// Sample N (say, 20) weight vectors by jittering each weight ±20% (renormalized).
// For each sample, run TOPSIS, record top-1.
// "Robust alternative" = the candidate that is top-1 most often *when not equal to the unperturbed top-1*.
// "Why" = the criterion(ia) whose weight shift flipped the ranking.
```

This actually answers "what changes my mind?" — which is the deeper user need.

### Bug #3 — P3 logical inconsistency (capacity template)

**Symptom.** Priya has `waitlistLength: 0`. Engine recommends *"Build a structured waitlist + tiered intake"*. The Stage 2 explanation for eliminating *"Cap new intakes"* says *"If the waitlist is essentially empty, capping intakes adds no protection."* — but the recommended option requires a waitlist that doesn't exist.

**Root cause.** Capacity template's candidate set includes "Build a structured waitlist" without a precondition that demand exceeds capacity. Stage 2 didn't filter it because the candidate isn't gated on the same field.

**Fix.** In `lib/engine/templates/capacity.ts`, add a Stage 2 constraint:
```ts
{ kind: "veto", appliesTo: ["build-structured-waitlist"], rule: "waitlistLength === 0 && currentWeeklyPatients < weeklyClinicalHours * 1.0" }
```
Or simpler: filter the candidate set per-template in Stage 2 via a `preconditions` array on each Candidate.

---

## §3 AI-workflow generation rubric (§4 of PLAN.md)

| Dim | Pass count | Detail |
|---|---|---|
| **AI-1 Identification** | **5 / 5 ✅** | Every persona got ≥1 prompt-type reducer. |
| **AI-2 Prompt structure** | **3 / 5 ⚠** | Only P3 has a proper role frame. P1/P2/P4/P5 are just instruction-only. **No prompt has explicit output-format spec.** |
| **AI-3 Tool-syntax accuracy** | **0 / 5 ❌** | All 5 `skill`-type reducers reference fictional names (`task-tracker`, `rate-analysis`, `waitlist-manager`, `tiered-pricing-calculator`, `calendar-sync`). None exist as real Claude Code skills, Codex agents, or Perplexity Spaces. |
| **AI-4 Run-it-now instructions** | **1 / 5 ❌** | Descriptions are passive ("Generate a tiered pricing table"). None say *"Paste this into ChatGPT"* / *"Save as `.claude/skills/<name>/SKILL.md` then `/<name>`"* / *"Run `claude --skill <name>`"*. |
| **AI-5 Permission tier honesty** | **3 / 5 ⚠** | All reducers tagged T0. T0 means "paste-into-LLM only". Skill-type reducers like *"Sync calendar"* imply real calendar access (T2-T3), so the tier is technically wrong-but-harmless because the artifact doesn't actually do the access. |

**Synthesis.** The engine identifies *that* AI helps, but doesn't deliver tool-specific, run-it-now artifacts. For high-maturity users (Marcus), this is a missed opportunity — he could be handed an actual `.claude/skills/rate-analysis/SKILL.md` with frontmatter and instructions; instead he gets a slug name with no payload.

**Fix in Stage 5 system prompt** — extend the workloadReducer schema and prompt to:
1. For `type: "skill"` — require `artifact.skillContent: string` containing real SKILL.md frontmatter + body when target = Claude Code, OR an `AGENTS.md` block when target = Codex.
2. For every reducer — require `artifact.runItNowInstructions: string`. E.g., *"Open ChatGPT, paste the prompt above, edit the patient list, send."*
3. Add `target?: "chatgpt" | "claude" | "claude-code" | "codex" | "perplexity"` so the artifact is tool-specific.

(Sample reducer in §6 below shows the upgraded shape.)

---

## §4 AI maturity assessment

| Persona maturity | Today's experience | Should be |
|---|---|---|
| **Very-low** (P4 Linda, P5 Diane) | Top card alone is actionable ✅. But the prompts assume ChatGPT access with no link / setup hint ⚠. | Add a "If you've never used ChatGPT: 1. Go to chat.openai.com, 2. Paste this." footer on prompt-type reducers. |
| **Low** (P1 Sarah) | Same as very-low. Same gap. | Same fix. |
| **Medium** (P3 Priya) | Pasteable prompts work for her. Skill-name references are dead-ends ❌. | Either drop `skill` type entirely or generate real artifact bodies. |
| **High** (P2 Marcus) | Same prompts as everyone else. He could use a real Claude Code skill or Codex agent. | Add `target` discrimination: when present, generate the actual file shape (SKILL.md / AGENTS.md / Perplexity Space) with paste-in instructions. |

**Bottom line.** The tool *works* at very-low maturity (just paste the prompt). It **doesn't get any better** at higher maturity — Marcus gets the same surface as Linda. That's a missed product moat.

**Minimum AI maturity to use this:** *Low* — must know how to open ChatGPT and paste. Anyone below that needs a 30-second video link in the empty-state copy.

---

## §5 Can we make this simpler? — ranked simplifications

Effort: XS = <30 min. S = ≤2 hr. M = ≤6 hr.
Expected impact ranges from "trust claim defensible" to "polish".

| # | Change | Effort | Impact | Why |
|---|---|---|---|---|
| **1** | Replace numeric `confidence` with text label *Strong call / Lean / Coin flip — see robust alt* | XS | High | Fixes Bug #1 user-visibly without recalibration. PRD §8 already wants "confident but qualified". |
| **2** | Fix robust alt via weight-perturbation (Bug #2) | S | High | Trust claim depends on this feature being meaningful. |
| **3** | Add per-template precondition gates (Bug #3) | S | High | Logical-consistency floor. Different code path than just constraint vetoes. |
| **4** | Add `runItNowInstructions` + `target` to workloadReducer schema; update Stage 5 system prompt | S | High | Closes AI-3, AI-4 gaps. Makes the AI-maturity ladder real. |
| **5** | When `type: "skill"` and `target: "claude-code"`, generate a complete SKILL.md body | M | Med | High-maturity users get a real moat. Lower-maturity users won't see the field. |
| **6** | Hide methodTrace by default; only show on "show the work" expand | XS | Med | Already in F-04 spec — verify implemented. |
| **7** | Drop the 3-card carousel for very-low-maturity users; show only top reducer + "and 2 others" peek | S | Low-Med | Reduces decision fatigue for Linda/Diane. |
| **8** | Plain-language alternative-elimination reasons (replace "Lower TOPSIS closeness 0.62" with "Higher cost without proportional time saved") | S | Med | Math-jargon leak; ranks A3 from generic to grounded. |
| **9** | Remove unused intake fields where two fields encode one signal (e.g., `currentRateUSD` + `competitorBenchmarkUSD` → store gap %) | S | Low | Faster intake; ≤7-fields target met but density helps. |
| **10** | First-run animated mini-tour (single screen) explaining the 3 templates + what "show the work" reveals | XS | Low | Onboarding for very-low maturity. |

**Recommended Round-1 scope (4-6 hours):** items 1, 2, 3, 4, 6 — that's the trust-claim hardening pass. Defer 5, 7, 8, 9, 10 to v1.1.

---

## §6 Sample of upgraded workloadReducer (proposed schema)

Compare today's (left) vs proposed (right):

**Today**
```json
{
  "type": "skill",
  "title": "Rate analysis calculator",
  "description": "Compute new service rates based on a chosen percentage increase and benchmark.",
  "artifact": { "skillName": "rate-analysis" },
  "automationLevel": "user_executes",
  "permission_tier": "T0"
}
```

**Proposed (Marcus, high-maturity, target=Claude Code)**
```json
{
  "type": "skill",
  "title": "Rate analysis (Claude Code skill)",
  "description": "Compute revenue impact of any % rate change against your fill rate.",
  "target": "claude-code",
  "artifact": {
    "skillName": "rate-analysis",
    "skillContent": "---\nname: rate-analysis\ndescription: Compute revenue impact of rate changes for a solo cash-pay practice. Use when the user asks 'what if I raised rates X%'.\n---\n\n# Rate analysis\n\nWhen invoked, ask the user for current rate, target %, fill rate, and weekly slots. Then compute:\n- new rate = current × (1 + target%)\n- weekly revenue current = current × slots × fill%\n- weekly revenue projected = new × slots × fill% × (1 - 0.5 × elasticity)\n- show both as a table\n\nElasticity defaults to 0.2 (mild) but ask the user.\n"
  },
  "runItNowInstructions": "1. Save the skill body above as `.claude/skills/rate-analysis/SKILL.md` in your project. 2. Restart Claude Code. 3. Type `/rate-analysis` and answer the prompts.",
  "automationLevel": "ai_assisted",
  "permission_tier": "T1"
}
```

**Proposed (Linda, very-low maturity, target=chatgpt)**
```json
{
  "type": "prompt",
  "title": "Tiered pricing draft (paste into ChatGPT)",
  "description": "Get a starter pricing table you can edit.",
  "target": "chatgpt",
  "artifact": { "promptText": "<full prompt>" },
  "runItNowInstructions": "First time using ChatGPT? 1. Go to chat.openai.com (free). 2. Click \"New chat\". 3. Paste this whole message and press Enter. The reply is a draft you can edit.",
  "automationLevel": "user_executes",
  "permission_tier": "T0"
}
```

The same engine output adapts per persona by selecting `target` based on the user's stored AI-maturity profile (a future user-pref field, default = `chatgpt` for safety).

---

## §7 Scalability

| Wave | n | wall ms | p50 | p95 | p99 | err % |
|---|---|---|---|---|---|---|
| Persona series | 5 | 14,855 | 3,226 | 3,585 | 3,586 | 0% |
| **Concurrent 10** | 10 | ~3,900 | ~3,200 | **3,895** | 3,895 | **0%** |
| **Concurrent 25** | 25 | 4,155 | 3,107 | **3,711** | 4,155 | **0%** |

- ✅ All under PRD T-03 budget of **p95 < 6 s**.
- ✅ Groq absorbed 25-concurrent fan-out without throttling.
- ⚠️ Not yet measured: 50-concurrent (would saturate Neon WebSocket pool `max=10` in `lib/db/actor.ts`); cold-start (Vercel serverless function init); Neon endpoint cold-start (the user's hibernated branch took ~2 s to wake the first time).
- ⚠️ Not measured here but worth pre-deploy: end-to-end latency *including* auth + DB write — engine is 3.7 s p95, but `runWithActor` + Neon pool acquire + Better Auth session check could add another 200-800 ms each, putting end-to-end at p95 ~4.7 s — still within budget but tighter.

---

## §8 Architecture dependencies & failure-mode matrix

```
┌────────────────────────────────────────────────────────────┐
│ Browser (intake form, IndexedDB cache, sw.js)              │
└──────────────────┬─────────────────────────────────────────┘
                   │ HTTPS
┌──────────────────▼─────────────────────────────────────────┐
│ Vercel (Next.js Node runtime, single region)               │
│   ├─ /api/auth/*   → Better Auth → authDb (owner pool)     │
│   ├─ /api/decisions → ratelimit (in-memory) → engine       │
│   │                                ↓                       │
│   │                       lib/engine/orchestrator          │
│   │             ┌───────────┼───────────┐                 │
│   │       Stage 1            Stage 2-4   Stage 5          │
│   │       (Groq)             (TS only)   (Groq + TS)      │
│   │                                                        │
│   └─ DB writes via lib/db/actor (app_user pool, RLS-FORCEd)│
└──────────────────┬───────────────────────────────────────┬─┘
                   │ WebSocket                             │ HTTPS
┌──────────────────▼─────────────────────┐  ┌──────────────▼────┐
│ Neon Postgres (single project, single  │  │ Groq API          │
│ branch, 2 roles: neondb_owner + app_user)  │ (gpt-oss-120b)    │
└────────────────────────────────────────┘  └───────────────────┘
                                            ┌──────────────────┐
                                            │ Resend (magic-link│
                                            │ delivery only)    │
                                            └──────────────────┘
```

| Dep | Failure → user impact | Mitigation in v1 | Open risk |
|---|---|---|---|
| **Neon** | Total DB outage. All routes 500. | None. | SPOF. PRD-acceptable for v1 (single-tenant data; Neon has 99.95% SLA). |
| Neon WebSocket pool (max=10) | "no available connections" at >10 concurrent DB-touching requests per Vercel function instance. Connections released per-tx but bursts can starve. | Pool size tunable; PRD §7.5 noted ~50-100ms cold start. | Increase to 25 if real traffic crosses 10 RPS sustained. |
| **Groq** | Stage 1 + Stage 5 fail. Engine unusable. | None. | LD-02 ADR-001 says swap = M effort. Add a circuit-breaker fallback to "decision-engine-degraded" UI with cached templates only. |
| Groq rate-limit | 429s under spike. PRD §11 BY2 caps at 20/user/day, but Groq's account-level cap can bite first. | None. | Watch usage on Groq dashboard. Add an exponential-backoff retry (1 retry, 2 s) before 5xx-ing. |
| Vercel | Total outage. | None. | Acceptable. |
| **Better Auth** | All `/app/*` blocked. | None. | In-process library; vendored deps risk = pin major version. |
| **In-memory ratelimit** | Across multiple Vercel function instances, the cap is per-instance, not per-user globally. A burst that lands across 3 instances = 60/day, not 20. | Acceptable per PRD §3 hackathon scope. | **Promote to Upstash Redis at any real traffic** (`@upstash/ratelimit` already a dep). |
| Resend | Sign-up via magic link breaks; email/password still works. | Email/password fallback. | Acceptable. |
| `server-only` package | Throws if accidentally imported in client. | Vitest alias-shim; lint Q-04. | Catches the leak. ✅ |

**Single-points-of-failure** (count = 4): Neon, Groq, Vercel, Better Auth. All expected for hackathon scope. None blocking Round 1.

---

## §9 Open items + next-session work order

### Locked-in this run (no action needed)
- ✅ Engine runs at scale (25 concurrent, 0 errors, p95 < 4 s)
- ✅ Architecture dep map captured + failure modes enumerated
- ✅ Persona-level decision capture works for 4/5 templates × intake combinations

### Round-1 hardening (recommended next session, 4-6 hr)
1. **Bug #1** — replace numeric confidence with text labels (XS, ~20 min) — see PROPOSAL §5 item 1
2. **Bug #2** — weight-perturbation robust alt (S, ~90 min) — item 2
3. **Bug #3** — per-template preconditions (S, ~60 min) — item 3
4. **AI-3/AI-4** — extend reducer schema with `target` + `runItNowInstructions` + Stage 5 prompt update (S, ~120 min) — item 4

### Defer to v1.1
- Item 5 (full SKILL.md generation per target tool)
- Items 7-10 (UX polish)

### Not from this test, but related
- **IBR scan** at 375 px viewport for `/sign-in` + `/app/decisions/new/admin-hire` + the rendered F-04 page (user requested via `/ibr:ibr` after this run completes).
- **Magic-link smoke** in prod once domain verified in Resend.
- **Promote rate-limit to Upstash** before any real-user exposure.

---

## §10 Appendix — methodology notes

- All persona scenarios are deterministic (no clock dependency in fields). Re-run gives the same engine output modulo Groq sampling temperature (0.2 default).
- Concurrent test waves shared the same Groq account; did not exhaust account-level rate limit at 25 RPS. If we'd see 429s here, T-10's per-user 20/day would already be moot.
- Permissions: persona test bypasses auth + DB by calling `runDecision()` directly. T-08 RLS isolation already covered separately in `tests/rls-isolation.test.ts`.
- Findings JSON saved to `tests/e2e/findings/` — re-runnable, diffable across builds.
