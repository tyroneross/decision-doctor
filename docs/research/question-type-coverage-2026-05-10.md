# Decision Doctor — Question-Type Coverage Tracker

**Date created:** 2026-05-10
**Source taxonomy:** `~/Downloads/Decision Science Problem Taxonomy by Question Type.md` (300 lines, copied below for reference under §Appendix A) — Gartner analytics-maturity hierarchy (Descriptive / Diagnostic / Predictive / Prescriptive) with the prescriptive tier split into three (Decision Analysis / Optimization / Sequential Policy).
**Companion doc:** `docs/research/algorithm-problem-fit-2026-05-10.md` (PEDE structural taxonomy — orthogonal axis).
**Purpose:** track which question types Decision Doctor's engine *currently* covers, *partially* covers, and *does not* cover. Update on every engine change.

---

## Tracking philosophy

Two orthogonal axes describe every decision Decision Doctor encounters:

1. **Question-type axis** (this doc) — *what is the user asking?* (epistemic goal: characterize / diagnose / predict / choose / optimize / strategize)
2. **PEDE structural axis** (`algorithm-problem-fit-2026-05-10.md`) — *what shape is the option space?* (SED / GDD / VDD / EDD / TCLD)

A complete decision routing decision uses **both axes**. Example: "Should I sell the practice?" is **Type 4 (Decision Analysis) × VDD (Values-Dominant)** — meaning *which option to choose* in a *values-dominant* frame, so we run AHP weights + minimax regret without claiming a single "best" rank.

This doc tracks the **question-type** axis. Update it whenever:
- A new algorithm lands in `lib/engine/`.
- A new F-criterion is added to the PRD that addresses one of the 7 rows.
- A user complaint reveals we mis-routed (e.g., we returned a Type-4 ranking on what was a Type-2 diagnostic question).

---

## Status snapshot — 2026-05-10

| # | Question type | Coverage | Confidence | Sized for |
|---|---|---|---|---|
| **PSM** | Problem Structuring (pre-type) | ⚠️ Partial | Medium | LLM chat does informal structuring; formal PSM/VFT/RGT not implemented |
| **1** | Descriptive ("what is true?") | ❌ Mostly absent | n/a | Weekly-audit feature (v1.1) addresses it |
| **2** | Diagnostic ("why?") | ❌ Out of scope | n/a | Not a near-term Decision Doctor priority |
| **3** | Predictive ("what will happen?") | ❌ Out of scope | n/a | Forecasting could complement Type 4 in v2 |
| **4** | Decision Analysis ("which option?") | ✅ **Strong fit — home turf** | High | Engine ships F-08+F-09+F-10 next |
| **5** | Optimization ("best possible outcome?") | ❌ Out of scope | n/a | Railway sidecar candidate if pricing-optimization materializes |
| **6** | Sequential / Policy ("what next?") | ⚠️ Partial | Low-medium | Weekly-audit (v1.1) is the natural landing |

**Headline:** Decision Doctor is fundamentally a **Type 4 (Decision Analysis / MCDM) tool**, with planned extensions into **PSM** (chat-driven structuring), **Type 1** (descriptive workflow audit), and **Type 6** (sequential policy via weekly audit). Types 2, 3, 5 are explicitly out of scope for v1 and v1.1 — and that's the right call, not a gap to fix.

---

## Per-type tracker

### PSM — Problem Structuring Methods (pre-type)

**What the user is doing:** can't yet name which question type they're in. Stakeholders or symptoms don't agree.

**Examples:**
- "Something's off with my practice but I don't know what."
- "I want to use AI but I don't know where to start."
- "I'm overwhelmed but I can't say what's actually the problem."

**Research-recommended methods:** Soft Systems Methodology (SSM), SODA (Strategic Options Development and Analysis), Strategic Choice Approach, Drama Theory.

#### Coverage

| What | Where | Status |
|---|---|---|
| LLM-driven open-ended chat that surfaces pain points before formal intake | `components/chat/Chat.tsx:38-200` (OPENING + `runQuery`) | ✅ Informal — works for ~80% of users |
| Pain-point chips on first session ("hiring admin help" / "raising rates" / "adding capacity") | `components/chat/Chat.tsx:266-282` | ✅ Light PSM via canned framings |
| **PEDE Stage-0 decision-type classifier (formal PSM)** | Planned **F-11** per `algorithm-problem-fit-2026-05-10.md` | 🟡 Planned |
| **VFT — Value-Focused Thinking** ("what are you trying to achieve?") | Research only — `decision_engine_master_report.md:84-86` | 🟡 Planned F-12 |
| **RGT — Repertory Grid Technique** ("which two of these three are most similar?") | Research only — `Cross-Disciplinary.md:23` | 🟡 Planned F-13 |

**Gap analysis:** The chat-based informal PSM is GOOD ENOUGH for the demo anchor (solo psychiatrist with focused decisions). Formal VFT/RGT becomes important when the **EDD path** (Exploratory Discovery Decision) is opened — "where should I start with AI?" — because that question CANNOT be answered with the SED/Type-4 pipeline and instead needs construct elicitation first.

**Next action:** Hold formal PSM for after F-08/F-09/F-10 ship. F-11 (PEDE Stage-0 classifier) is the unblocker — once we can DETECT a question is EDD or VDD, then F-12 (VFT) and F-13 (RGT) become productive.

---

### Type 1 — Descriptive ("what happened / what is true?")

**Core ask:** characterize current or historical state. No decision yet — shared understanding first.

**Examples relevant to Decision Doctor's audience:**
- "What ate the most time last week?"
- "How did my reimbursement mix change Q1 → Q2?"
- "Who are my highest-no-show patient cohorts?"

**Research-recommended methods:** descriptive statistics, EDA, BI dashboards, Kepner-Tregoe Situation Appraisal, clustering & classification.

#### Coverage

| What | Where | Status |
|---|---|---|
| Decision history list with category chips + time-back metrics | `app/app/decisions/page.tsx` + `components/decisions/DecisionsListClient.tsx` (commit `0164268`) | ⚠️ Descriptive of *past Decision Doctor outputs*, not of the practice's underlying state |
| Time-back ledger card ("23 hrs/wk back since you started") | `components/decisions/DecisionsListClient.tsx` per v2-06 mockup | ⚠️ Descriptive of cumulative effect of shipped skills |
| Intake-summary card ("here's what I heard about your week") before engine runs | ❌ Not implemented | ❌ Easy add — high-leverage trust signal |
| **Weekly workflow audit** ("here's what your AI tools did last week + new recommendations") | Planned **v1.1** per `algorithm-problem-fit-2026-05-10.md` and PRD §1 TL;DR | 🟡 Planned for Railway worker |
| Practice-state descriptive (e.g., "your patient mix is 60% adult / 40% adolescent — here's what changed") | ❌ Not implemented; would require EHR integration (out of scope per PRD ADR-002) | ❌ Out of scope v1 |

**Gap analysis:** Decision Doctor today is mostly *prescriptive* (Type 4), with descriptive surfaces limited to *its own* output history. The weekly audit (v1.1) is the canonical Type-1 surface — it characterizes the user's practice trajectory based on what they've decided AND what shipped AI tools have measured.

**Next action:** When wiring the weekly audit, add an "intake summary" card to the chat flow as a pre-step. It's a small add and closes the loop on Type-1 coverage at the per-session granularity.

---

### Type 2 — Diagnostic ("why did this happen?")

**Core ask:** identify causal driver of a known outcome. Counterfactual reasoning required.

**Examples:**
- "Why is my Monday admin time creeping up?"
- "Why did my no-show rate jump in March?"
- "Why are patients in this referral cohort harder to retain?"

**Research-recommended methods:** Root Cause Analysis (5 Whys, Fishbone), Kepner-Tregoe Problem Analysis, causal inference (DiD, regression discontinuity), fault trees.

#### Coverage

| What | Where | Status |
|---|---|---|
| (Anything diagnostic) | ❌ Not implemented anywhere | ❌ Out of scope v1, v1.1 |

**Gap analysis:** Decision Doctor is explicitly forward-looking. Diagnostic questions ("why did X happen") would require historical practice data + causal inference, which is a fundamentally different product. **Recommended posture: stay out of Type 2.** If a user asks a Type-2 question, the chat should reframe it: "I help you decide what to do next, not diagnose past patterns. What forward decision would benefit from understanding this?"

**Next action:** None for v1/v1.1. Add a Type-2 reframing branch to the chat's `runQuery` logic when the PEDE Stage-0 classifier (F-11) detects a diagnostic question.

---

### Type 3 — Predictive ("what will happen?")

**Core ask:** forecast a future state, outcome, or value with confidence measure.

**Examples:**
- "If I hire this VA, what's my projected revenue next quarter?"
- "What's the probability I hit 35 patient hours/week by July?"
- "If I raise rates 8%, how many patients churn?"

**Research-recommended methods:** regression, time-series forecasting (ARIMA, Prophet), Bayesian inference, Monte Carlo simulation, scenario planning, ML classification/regression, Delphi method.

#### Coverage

| What | Where | Status |
|---|---|---|
| Decision confidence (TOPSIS closeness margin) | `lib/engine/stage5-ranking.ts:72-74` | ❌ **NOT a forecast** — common confusion. This measures preference-similarity to ideal, not future-state probability. |
| Forecast revenue / hours / patient mix impact of a decision | ❌ Not implemented | ❌ Out of scope v1 |
| Predict which workload reducers a user will keep using | ❌ Not implemented | ❌ Out of scope v1 |

**Gap analysis:** Decision Doctor does NOT do prediction. Important honesty signal: the confidence % is preference-fidelity, not a probability that the recommended action will succeed. The PRD §11 transparency clause mandates this distinction be visible in the UI ("confidence in fit to your stated values," not "probability this works out").

**Next action:** Audit the UI copy to ensure the confidence % is never framed as a forecast. v2 could add a forecast layer (predict-then-decide chain per the Cisco example in the source doc), but only if the demo anchor's data is rich enough to support it.

**→ note:** Type 3 + Type 4 chained = "predict outcome → choose option given prediction." This is the *Cisco market entry chain* in the source doc. Adding Type 3 would extend the engine into "decide given uncertain forecasts" — powerful but a v2 scope expansion.

---

### Type 4 — Decision Analysis ("which option should I choose?") · **Decision Doctor's home turf**

**Core ask:** select from a defined, discrete set of options against explicit criteria.

**Examples (matches all 3 v1 templates):**
- "Should I hire a part-time VA, full-time admin, or cap intakes?" (Capacity template)
- "Should I raise rates 8% on 1 Jul, raise 12% on 1 Sep, or hold?" (Pricing template)
- "Should I expand referrals via Hospital A, B, or community PCPs?" (Referral-network template)

**Plus high-leverage Type 4 decisions the user surfaced:**
- "Should I sell vs keep my practice?" (Type 4 × VDD modifier)
- "Should I take insurance or stay self-pay?" (Type 4 × HC modifier)
- "Which patient population should I serve?" (Type 4 × VDD modifier)

**Research-recommended methods:** decision matrix / weighted scoring (Pugh), MCDM (AHP, TOPSIS, ELECTRE), decision trees with expected value, influence diagrams, Kepner-Tregoe Decision Analysis (must-haves / wants), regret minimization.

#### Coverage

| Method | Where | Status |
|---|---|---|
| Hard-constraint vetoes (Pugh-style must-haves; Kepner-Tregoe must-haves) | `lib/engine/stage2-constraints.ts:1-111` | ✅ Implemented |
| LLM-anchored weight estimation (Pugh-style wants) | `lib/engine/stage1-values.ts:1-103` | ✅ Implemented |
| Weight normalization | `lib/engine/stage3-weights.ts:1-34` | ✅ Implemented (passthrough; BOED future) |
| **ELECTRE pairwise outranking** | `lib/engine/stage4-outranking.ts:1-113` | ✅ Implemented |
| **TOPSIS ranking** | `lib/engine/stage5-ranking.ts:105-157` | ✅ Implemented |
| **Minimax regret** (robust alternative) | `lib/engine/stage5-ranking.ts:160-196` | ✅ Implemented |
| Confidence via TOPSIS top-1/top-2 margin | `lib/engine/stage5-ranking.ts:72-74` | ✅ Implemented |
| **AHP elicitation (user-driven pairwise comparisons)** | Planned **F-10 / T-13** | 🟡 Planned (this commit) |
| Decision tree with expected value | ❌ Not implemented | ❌ Future — applicable to "decide given uncertain branches" |
| Influence diagram | ❌ Not implemented | ❌ Future — overlaps with method-trace UI |
| Kepner-Tregoe Decision Analysis (must-haves + wants matrix) | ⚠️ Effectively covered by Stage 2 (must-haves) + Stage 1/3 (wants) | ⚠️ Equivalent, not labeled as K-T |
| Pugh decision matrix | ⚠️ TOPSIS subsumes this | ⚠️ Equivalent |
| Regret minimization for unclear preferences | ✅ Minimax regret already implemented; **F-10 AHP CR check adds detection of unclear preferences** | ✅ Partially; F-10 strengthens |

**Gap analysis:** Type 4 is **comprehensively covered**. The current engine implements the deterministic core of MCDM (ELECTRE + TOPSIS + minimax regret), with F-10 AHP adding the high-trust user-driven weight elicitation path. Decision trees with expected value would be the next add for Type-4 problems with branching uncertainty (e.g., "hire VA, then either revenue grows or doesn't — what's the best decision under each branch?").

**Next action:** Ship F-08/F-09/F-10 per the plan. Decision trees added in v2 only if a real user-decision surfaces that the current pipeline can't handle.

---

### Type 5 — Optimization ("what is the best possible outcome?")

**Core ask:** find optimal solution over continuous or combinatorial space. Options not pre-enumerated.

**Examples relevant to Decision Doctor's audience:**
- "What's the optimal price across self-pay / insurance / sliding-scale tiers?"
- "What's the optimal staffing mix across my 20 weekly slots?"
- "How should I allocate my marketing budget across referral channels?"

**Research-recommended methods:** LP / MIP, nonlinear optimization, metaheuristics (GA, SA), portfolio optimization (Markowitz), satisficing (Simon), multi-objective optimization (Pareto frontier).

#### Coverage

| Method | Where | Status |
|---|---|---|
| (Anything Type 5) | ❌ Not implemented | ❌ Out of scope v1, v1.1 |

**Gap analysis:** Decision Doctor's option-set today is always finite and pre-enumerated (the templates define the candidate set). Type 5 problems require an OPTIMIZER (LP solver, MIP solver, or metaheuristic) and most are CPU-heavy (would fit Railway, not Vercel — per `f08-f09-plan-2026-05-10.md` §2 architecture assessment).

**Next action:** Add Type 5 only when a real user-decision demands it. Most plausible candidate: a "pricing tier optimizer" (continuous over price; constrained by patient attrition curves) — but this requires the practitioner to provide elasticity data we don't have. Defer to v2.

**→ note:** Type 5 vs Type 4 distinction is *option-space*: if the user can list the options in a table, it's Type 4 (TOPSIS works). If the option is "any number from $0 to $500" or "any combination of 50 vendors," it's Type 5 (LP/MIP works).

---

### Type 6 — Sequential / Policy ("what should I do next?")

**Core ask:** determine a *policy* (rule for acting across a sequence of states), not a one-time choice.

**Examples:**
- "What's the optimal pricing strategy as competitive conditions evolve?"
- "When should I trigger a pivot vs stay the course?"
- "How should I sequence my AI-tool adoption across quarters?"
- "What's the treatment escalation policy for this patient?" (Clinical; out of scope per ADR-002)

**Research-recommended methods:** sequential decision analysis / decision trees over time, MDPs + dynamic programming, real options analysis, reinforcement learning, Bayesian adaptive decision-making, stochastic programming, stage-gate frameworks with decision triggers, scenario planning + robust decision-making.

#### Coverage

| Method | Where | Status |
|---|---|---|
| **Minimax regret as robust alternative** | `lib/engine/stage5-ranking.ts:160-196` | ⚠️ Single-shot, not sequential — but captures "what if preferences shift" |
| Trigger-revisit metadata on decisions (e.g., "revisit Jun 7") | `components/decisions/DecisionsListClient.tsx` per v2-06 mockup | ⚠️ Manual trigger, not policy |
| **Weekly workflow audit (multi-armed bandit over active AI tools)** | Planned **v1.1** on Railway | 🟡 Planned — canonical Type 6 surface |
| Real options for "when to sell," "when to pivot" | ❌ Not implemented | ❌ Future v2 |
| Stage-gate framework with explicit decision triggers | ⚠️ Implicit via "revisit by date X" metadata | ⚠️ Soft form |
| Markov Decision Process / dynamic programming | ❌ Not implemented | ❌ Out of scope (CPU-heavy; would fit Railway) |
| Reinforcement learning over user choices | ❌ Not implemented | ❌ Future v2 (privacy-sensitive) |

**Gap analysis:** Type 6 is **partially covered** via minimax regret (single-shot robustness) and revisit metadata (manual stage-gate). The canonical Type-6 surface is the **weekly workflow audit** — a multi-armed bandit running on Railway, eliminating poorly-performing AI tools and surfacing new ones over time. That's the v1.1 unlock.

**Next action:** Land F-08 + F-09 + F-10 first. Then design the weekly-audit Railway worker. Then add multi-armed bandit as `lib/audit/bandit.ts` plus a `workflow_audit_runs` table.

---

## Composite mapping — what the engine routes today

For each user question, the engine's routing should look up:
1. **Question type** (this doc, Types 1-6, or PSM)
2. **PEDE structural type** (`algorithm-problem-fit-2026-05-10.md` — SED/GDD/VDD/EDD/TCLD)
3. **Modifiers** (HC / SP / GD / MS / UD / NF; Information State / Reversibility / etc. from this doc's §"Second-order tags")

Then dispatch to the right sub-pipeline. Today, **no routing exists** — every decision is forced through the Type-4 / SED pipeline. That's correct for the three templates (which are all Type-4 / SED), but produces:

| Symptom | Root cause | Fix |
|---|---|---|
| False precision on VDD questions ("75% confidence you should sell") | Routing into TOPSIS when the decision is Values-Dominant | F-11 PEDE Stage-0 classifier → routes to VFT pipeline with NO final rank |
| Analysis paralysis on EDD questions ("where do I start with AI?") | Routing into ELECTRE before the option set is discovered | F-12 + F-13 (VFT + RGT) → discover options before ranking |
| "Why did X happen?" returning a recommendation | Type-2 question mis-routed to Type-4 pipeline | Chat-level Type-2 detection → reframe to a forward decision |
| User wants forecast, gets ranking | Type-3 question mis-routed | Defer Type-3 to v2; reframe in chat ("I help with the decision, not the forecast") |

---

## Tracking — F-criteria mapped to question types

| F-criterion | Status | Primary type covered | Secondary type | Notes |
|---|---|---|---|---|
| F-01 Template selector | ✅ Shipped | Type 4 | PSM (lightweight) | The 3 templates are all Type-4 / SED |
| F-02 Adaptive intake | ✅ Shipped | Type 4 | PSM | Form structure is light PSM |
| F-03 MCDA pipeline (Stages 1-5) | ✅ Shipped | **Type 4** | Type 6 (via minimax regret) | The engine's core |
| F-04 Transparent recommendation UI | ✅ Shipped | Type 4 | — | Pyramid-restructured per `186d09c` |
| F-05 Print/PDF export | ✅ Shipped, demoted to nice-to-have | Type 4 | — | — |
| F-06 Auth + history | ✅ Shipped | Type 1 (history list) | — | History view is partial Type-1 |
| F-07 PWA installable | ⚠️ Demoted to "next after core" | (any) | — | Cross-cuts; not type-specific |
| **F-08 AI-feasibility scoring** | 🟡 Planned | Type 4 | — | Per-reducer classification refines Type-4 output |
| **F-09 Skill/plugin scaffold generator** | 🟡 Planned | Type 4 | — | Output side of Type-4; ships the *tool*, not just the decision |
| **F-10 AHP elicitation** | 🟡 Planned (this commit) | **Type 4** | — | High-trust weight path for VDD-flagged Type-4 decisions |
| **F-11 PEDE Stage-0 classifier (future)** | ❌ Not yet a PRD F-criterion | **Routing across all types** | — | Unlock for Type 2/3 reframing + VDD/EDD routing |
| **F-12 VFT (future)** | ❌ Not yet | PSM, Type 4 (VDD-flagged) | — | Required for non-false-precision VDD output |
| **F-13 RGT (future)** | ❌ Not yet | PSM, EDD problems | — | Required when option/feature space is unknown |
| **F-14 Weekly workflow audit (future)** | ❌ Not yet | **Type 1 + Type 6** | — | Railway worker; multi-armed bandit |
| **F-15 BOED adaptive elicitation (future)** | ❌ Not yet | Type 4 (refinement) | — | Replaces Stage-3 placeholder |

---

## Validation evidence

Each row above was validated against the source taxonomy + secondary literature. Method-to-type mappings checked against:

| Mapping I made | Validated against |
|---|---|
| ELECTRE + TOPSIS → Type 4 | Source doc line 214 + Belton & Stewart (2002) Ch. 7-8 |
| Minimax regret → Type 4 + Type 6 + HC modifier | Source doc line 226 + Savage (1951) regret theory |
| AHP → Type 4 | Source doc line 214 + Saaty (1980) |
| Multi-armed bandit → Type 6 | Source doc line 222-223 (RL); Robbins (1952) bandits |
| Decision Doctor confidence ≠ Type 3 forecast | Source doc lines 85-86 (Type 3 distinct from Type 4); cross-checked against `stage5-ranking.ts:72-74` which is preference-fidelity, not probability of success |
| PSM as pre-type | Source doc line 233-235 |
| Gartner 4-stage analytics hierarchy → user's 6 types is an extension | WebSearch confirmed Gartner D-D-P-P with prescriptive tier split as legitimate extension (Belton & Stewart, Bertsimas, Bellman map cleanly) |
| Kepner-Tregoe components (Situation Appraisal / Problem Analysis / Decision Analysis / Potential Problem Analysis) → Types 1 / 2 / 4 + defensive layer | WebSearch confirmed K-T canonical structure; mapping is sound |

Cross-references:
- `algorithm-problem-fit-2026-05-10.md` (PEDE structural axis)
- `f08-f09-plan-2026-05-10.md` (architecture + Vercel/Railway/Redis sizing)
- `ui-overhaul-2026-05-10.md` (UI grounding research)

---

## Update protocol

Update this doc when:
1. **An algorithm lands** in `lib/engine/` → update the relevant Type row's coverage table with `file:line` + status.
2. **A new F-criterion is added** to the PRD → add a row to §"Tracking — F-criteria mapped to question types."
3. **A user complaint reveals mis-routing** (e.g., we returned a ranking when the user wanted a forecast) → add the symptom + root cause + planned fix to §"Composite mapping."
4. **Research deepens our understanding** (e.g., a new framework gets cited in the research folder) → add the framework to the relevant Type row + update `algorithm-problem-fit-2026-05-10.md`.

Convention:
- ✅ Implemented and shipped (cite file:line + commit SHA)
- 🟡 Planned (cite F-criterion + chunk)
- ⚠️ Partial / informal (explain the gap)
- ❌ Out of scope (cite reason — v1/v1.1/v2 or "not Decision Doctor's job")

Status history:
| Date | Change | Author |
|---|---|---|
| 2026-05-10 | Initial creation | Claude Opus 4.7 |

---

## Appendix A — Source taxonomy (verbatim from `~/Downloads/Decision Science Problem Taxonomy by Question Type.md`)

> *Stored here for repo-completeness; original lives in the user's Downloads. If the source changes, update both.*

### The Core Insight

> The most natural and practically useful primary axis for classifying problems is **the question being asked** — not structural properties of the problem. Question type determines the *goal* of the analysis, which in turn determines which frameworks and algorithms are valid. Structural properties (reversibility, uncertainty, time horizon) are second-order *tags* that modify *how* you apply those methods, not which category you're in.

### The six question types

| # | Question | Decision Science Label | Example |
|---|---|---|---|
| 1 | What happened / what is true? | Descriptive | Current market share, state of a system |
| 2 | Why did this happen? | Diagnostic / Root Cause | Why did win rate drop? |
| 3 | What will happen? | Predictive | Q3 revenue forecast, deal probability |
| 4 | Which option should I choose? | Decision Analysis / MCDM | Build vs. buy vs. partner |
| 5 | What is the best possible outcome? | Optimization | Optimal pricing, resource allocation |
| 6 | What should I do next? | Prescriptive / Sequential Policy | When to pivot, how to sequence markets |

### Second-order tags (modifiers)

| Tag | Values | Effect on Method Selection |
|---|---|---|
| Information State | Certainty / Risk / Uncertainty / Ambiguity | Shifts from deterministic to probabilistic to robust methods |
| Reversibility | Reversible / Sequential / Irreversible | Governs decision velocity and required rigor |
| Criteria Count | Single / Multi-criteria | Single → optimization; multi → MCDM or Pareto |
| Stakeholder Structure | Individual / Group / Adversarial | Group → voting / negotiation; adversarial → game theory |
| Causal Clarity | Clear / Complicated / Complex / Chaotic | Complex → probe-and-learn (Cynefin) |
| Time Horizon | Static / Sequential / Continuous | Sequential → dynamic programming; continuous → MDPs |

### Problem Structuring Methods (pre-type)

> Used upstream of question-type classification when stakeholders can't yet agree on which question type they're in. Soft Systems Methodology (SSM), SODA, Strategic Options Development and Analysis.

---

## Sources

External validation (this pass):
- [Gartner Analytics Maturity Model — Digital.ai](https://digital.ai/catalyst-blog/it-decision-making-through-the-lens-of-gartners-analytics-maturity-model/)
- [4 Types of Analytics — sranalytics.io](https://sranalytics.io/blog/types-of-analytics/)
- [Descriptive / Predictive / Diagnostic / Prescriptive Analytics Explained — Adobe Business](https://business.adobe.com/blog/basics/descriptive-predictive-prescriptive-analytics-explained)
- [Kepner-Tregoe Method — Purple Griffon](https://purplegriffon.com/blog/kepner-tregoe-method)
- [Kepner-Tregoe Framework — Microsoft Tech Community](https://techcommunity.microsoft.com/blog/azuredbsupport/kepner%E2%80%91tregoe-a-structured-and-rational-approach-to-problem-solving-and-decision/4482643)

Prior research (carried forward — see also docs in `docs/research/`):
- Miller's Law, Gestalt principles, NN/g whitespace, WCAG, Pyramid Principle, MECE, F/Z patterns, onboarding activation, Microsoft Work Lab metrics — all in `ui-overhaul-2026-05-10.md`
- PEDE 5-type taxonomy + 26 algorithm fit matrix — in `algorithm-problem-fit-2026-05-10.md`
- Vercel/Railway/Redis sizing — in `f08-f09-plan-2026-05-10.md`
- Belton, V. & Stewart, T. J. (2002). *Multiple Criteria Decision Analysis: An Integrated Approach.* Springer.
- Saaty, T. L. (1980). *The Analytic Hierarchy Process.* McGraw-Hill.

---

*This doc is canonical for question-type coverage. When in doubt about whether Decision Doctor should answer a given question, check the appropriate row here. If the row is ❌, decline gracefully and reframe.*
