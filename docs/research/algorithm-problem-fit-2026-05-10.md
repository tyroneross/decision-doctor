# Decision Doctor — Algorithm / Framework × Problem-Type Fit

**Date:** 2026-05-10
**Sources:** internal research folder (`Reference files/Decisio Science Research/` — 4 docs, 2,302 lines) + PEDE framework (Stage classifier) + 2026 MCDM/MCDA literature (Belton & Stewart axioms; Mardani et al. compensatory/non-compensatory typology).
**Purpose:** for each algorithm in the engine (current + research-recommended), state **which problem types it solves** and **how**. Use this as the routing table when deciding which pipeline to fire for a new user question.

---

## TL;DR

1. The research folder's **PEDE framework defines five MECE decision types** (SED, GDD, VDD, EDD, TCLD) plus six modifiers. The engine should route every user question into one of those five and run the matching sub-pipeline.
2. **One algorithm does not fit every problem.** Each method has a sweet-spot problem type; mis-routing produces false-precision answers or wasted user burden.
3. The current build covers **structured enumerable decisions (SED) well** — the 3 templates ride this pipeline. Other decision types (VDD, EDD, GDD, TCLD) are research-recommended but partially implemented or absent.
4. **AHP is a great fit for SED and VDD when the user trusts their own pairwise judgments.** Adding F-10 AHP-elicitation gives users the explicit "I'll set the weights myself" path for high-stakes decisions like "sell vs keep my practice."

---

## Part 1 — The PEDE problem typology (from `decision_engine_master_report.md` §3.2)

### Five MECE decision types

| Type | Definition | Practitioner examples | Default pipeline |
|---|---|---|---|
| **SED** — Structured Enumerable Decision | Options are finite and describable by known attributes | Hire a part-time VA · Raise rates 8% Jul 1 · Cap intakes 8 wks | Veto filter → Bayesian / PAPRIKA / AHP elicitation → ELECTRE → TOPSIS |
| **GDD** — Generative Design Decision | The option must be *built* from components, not picked from a list | "Design the right admin-help workflow" · "What AI tool to ship first for my practice" | VFT → RGT if needed → sparse BOED / conjoint → constraint satisfaction |
| **VDD** — Values-Dominant Decision | Mainly about values, identity, life direction, irreversible meaning | Sell vs keep the practice · Take insurance or stay self-pay · Change patient population (kids → adults) | VFT → RGT → constraints → minimax-regret reflection. **No final ranking** — return a values map. |
| **EDD** — Exploratory Discovery Decision | User doesn't know the option space *or* the feature space yet | "Where should I start using AI in my practice?" · "What academic CME path fits me?" | RGT → VFT → option generation → BOED → progressive profiling |
| **TCLD** — Time-Critical / Low-Data | Decision needed fast with incomplete info | Urgent referral routing · Same-day pharmacy callback prioritization | Fast-and-frugal tree → minimax regret → optional one-shot ranking |

### Six secondary modifiers (apply on top of the type)

| Flag | Meaning | Pipeline effect |
|---|---|---|
| **HC** | High consequence / low reversibility | Raise confidence threshold; add minimax-regret guard |
| **SP** | Sparse preferences (user cares about only k of d criteria) | Use sparse prior; skip weak-dimension questions |
| **GD** | Group decision (spouse, partners) | Stakeholder weighting + aggregation |
| **MS** | Multi-session decision (evolves over weeks) | Persist preference graph; update across sessions |
| **UD** | Unstructured source documents (need parsing) | Build option-scoring matrix before elicitation |
| **NF** | No fixed option set | Use generative design + constraint satisfaction, not ranking |

> Example routing: "Should I sell the practice?" → **VDD + HC + MS + GD** → Pipeline: VFT (what does success mean?) → RGT (what dimensions do you keep coming back to?) → constraint check (financial floor, family obligations) → minimax-regret reflection. Output: a values map and a tradeoffs summary, **not** a ranked recommendation.

---

## Part 2 — Algorithm × problem-type fit matrix

Every algorithm or framework available to Decision Doctor, what it does, the **problem types it solves**, **how** it solves them, and when *not* to use it.

### A. Preference elicitation methods

#### A1. Value-Focused Thinking (VFT)

| Aspect | Detail |
|---|---|
| **What** | Surface *fundamental* objectives ("what are you trying to achieve in life/business?") before considering options. Distinguishes ends from means. |
| **Problem types** | **VDD ✓** (primary), **EDD ✓**, **GDD ✓**, SED ⚠ optional |
| **How it solves** | Asks "why does that matter?" repeatedly, peeling means objectives off fundamental ones. Builds an objective hierarchy that frames everything downstream. |
| **When to use** | User goal is broad or unclear; criteria not yet articulated; high-consequence decisions. |
| **When NOT to use** | User has a clear shortlist and known criteria — VFT just adds friction. |
| **Status in code** | ❌ Not implemented. Stage 1 currently estimates weights, doesn't elicit fundamental objectives. |
| **Cost on Vercel** | Trivial (LLM-mediated). |

#### A2. Repertory Grid Technique (RGT)

| Aspect | Detail |
|---|---|
| **What** | Triadic comparison ("which two of these three are most similar, and why?") to surface the user's *personal constructs* — the dimensions they actually use that they can't always name. |
| **Problem types** | **EDD ✓** (primary), **VDD ✓**, **GDD ✓** |
| **How it solves** | When the user doesn't know what features matter, RGT extracts them indirectly via comparison patterns. Powerful for the "I'll know it when I see it" problem. |
| **When to use** | User can't name criteria; "I don't know what I want" decisions. |
| **When NOT to use** | Criteria are obvious. Skip to AHP/PAPRIKA. |
| **Status in code** | ❌ Not implemented. |
| **Cost on Vercel** | Trivial (LLM-mediated). |

#### A3. AHP — Analytic Hierarchy Process

| Aspect | Detail |
|---|---|
| **What** | User does pairwise comparisons of criteria using Saaty's 1–9 scale (or a coarsened 5-point version). Eigenvector math produces weights. Consistency Ratio (CR) flags contradictions. |
| **Problem types** | **SED ✓** (excellent), **VDD ✓** (excellent for the weighting step), GDD ⚠ if criteria are known |
| **How it solves** | High-trust weight elicitation: the user *believes* the weights because they chose them. CR catches "I said I value X most but my comparisons say I value Y most." |
| **When to use** | User wants the audit trail. Stakes are high. Criteria are bounded (3–8). User trusts their own judgment. **The "buying a house" / "selling the practice" / "take insurance or not" archetype.** |
| **When NOT to use** | >8 criteria (pairwise count C(n,2) explodes); user is fatigued or impatient; criteria are vague. |
| **Status in code** | ❌ Not implemented. **Adding as F-10 (this commit).** |
| **Cost on Vercel** | Trivial. Eigenvector of 8×8 matrix = microseconds. |

#### A4. PAPRIKA — Potentially All Pairwise RanKings of all possible Alternatives

| Aspect | Detail |
|---|---|
| **What** | Adaptive pairwise tradeoff elicitation — but at the *option level* rather than criterion level. Uses logical implications between pairwise judgments to skip redundant questions. |
| **Problem types** | **SED ✓** (primary), GDD ⚠ if option set generated first |
| **How it solves** | After each "would you trade $X for Y minutes shorter commute?" answer, PAPRIKA infers a cone of other answers and skips them. Typically 15–25 questions for problems that would need 100+ in naive form. |
| **When to use** | Mid-sized SED problems (5–20 alternatives, 3–6 criteria); user willing to do real tradeoff thinking. |
| **When NOT to use** | User wants 30-second elicitation; preferences are sparse (BOED is better). |
| **Status in code** | ❌ Not implemented. Theoretical reference at `Cross-Disciplinary.md:8`, `Preference Elicitation Equations.md:7-12`. |
| **Cost on Vercel** | Light (linear-programming check after each answer). |

#### A5. BOED — Bayesian Optimal Experimental Design (the "smart-question loop")

| Aspect | Detail |
|---|---|
| **What** | Adaptive elicitation that picks the *next* question to maximize Expected Information Gain (EIG) over the posterior preference distribution. |
| **Problem types** | **SED ✓**, **EDD ✓**, GDD ⚠ |
| **How it solves** | Starts with a prior over preferences. After each answer, updates the posterior. Picks the next question that most reduces remaining uncertainty. Stops when uncertainty < threshold or regret < δ. |
| **When to use** | User wants least burden, criteria are bounded, you have a reasonable prior (template defaults work). Stage 3 placeholder is the slot. |
| **When NOT to use** | High-stakes decisions where user wants the audit trail (use AHP); domains where you can't define a meaningful prior. |
| **Status in code** | ❌ Stage 3 is a pass-through placeholder; full BOED is research-only. |
| **Cost on Vercel** | Approximations (amortized, sparse): ~1–2s per question selection in Node. Full Monte Carlo BOED: 5–30s — would move to Railway. |

#### A6. Conjoint Analysis (ACA / ACBC)

| Aspect | Detail |
|---|---|
| **What** | Partial-profile attribute elicitation — present a few "concept cards" and ask which is preferred. Regress preferences to recover attribute utilities. |
| **Problem types** | **SED ✓** when criteria have natural levels (e.g., price tiers, plan features) |
| **How it solves** | Statistical recovery of part-worth utilities from a small number of profile comparisons. Mature commercial method (Sawtooth Software etc.). |
| **When to use** | Pricing/packaging decisions; you need part-worths not just rankings. |
| **When NOT to use** | Criteria don't have discrete levels; small option sets where direct ranking is easier. |
| **Status in code** | ❌ Not implemented. |
| **Cost on Vercel** | Light (linear regression after responses). |

### B. Constraint / non-compensatory methods

#### B1. Fast-and-Frugal Trees (FFT)

| Aspect | Detail |
|---|---|
| **What** | Lexicographic sequential cues with early exit. Apply hard constraints in order; first failure eliminates the option. |
| **Problem types** | **TCLD ✓** (primary), SED ✓ as pre-filter, GDD ⚠ early-stage |
| **How it solves** | Non-compensatory: an unfavourable value cannot be offset. Matches how people actually decide under time pressure (Gigerenzer et al.). |
| **When to use** | Time pressure; high-consequence vetoes (PHI, budget, legal); first-pass pruning before any compensatory method. |
| **When NOT to use** | Compensatory tradeoffs are essential to the user's goal. |
| **Status in code** | ✅ Partial — Stage 2 (`stage2-constraints.ts:1–111`) implements veto filtering. Not yet a *lexicographic* tree; just one-pass boolean filtering. |
| **Cost on Vercel** | Negligible. |

#### B2. Conjunctive / Disjunctive constraints

| Aspect | Detail |
|---|---|
| **What** | "Must have X AND Y" (conjunctive) or "Must have X OR Y" (disjunctive). |
| **Problem types** | **SED ✓**, **GDD ✓**, **TCLD ✓** |
| **How it solves** | Hard-filters the option space before any preference computation. |
| **When to use** | Always, as a first pass. |
| **Status in code** | ✅ Stage 2 implements conjunctive vetoes. Disjunctive support partial. |

### C. Outranking methods

#### C1. ELECTRE I/III

| Aspect | Detail |
|---|---|
| **What** | Pairwise outranking: for each pair (a, b), compute *concordance* (% weighted criteria where a ≥ b) and *discordance* (max gap where b > a). If concordance ≥ θ_c and discordance ≤ θ_d, then a dominates b. |
| **Problem types** | **SED ✓** (primary), GDD ⚠ after option generation |
| **How it solves** | Eliminates options that are *strictly* worse without forcing a total order. Honest about ties and incomparability. |
| **When to use** | When the user is OK with "we eliminated these and kept these" but not "here's #1 vs #2 vs #3." Pruning, not ranking. |
| **When NOT to use** | Need a strict rank order. Use TOPSIS. |
| **Status in code** | ✅ `lib/engine/stage4-outranking.ts` — fully implemented. Thresholds `0.7` / `0.2` hardcoded (gap; research suggests adaptive). |
| **Cost on Vercel** | O(n²·k). <50ms for n=100. |

#### C2. PROMETHEE I/II

| Aspect | Detail |
|---|---|
| **What** | Like ELECTRE but uses preference *functions* (linear, quasi-linear, Gaussian, etc.) per criterion. Produces a net flow ranking. |
| **Problem types** | **SED ✓** |
| **How it solves** | Smoother than ELECTRE — preference *strength* matters, not just dominance. PROMETHEE II gives a total order; PROMETHEE I gives partial order. |
| **When to use** | When you have ordinal or partly-ordinal criteria with thresholds (e.g., "I don't care about price differences < $50"). |
| **When NOT to use** | Default to ELECTRE if you don't have tuned preference functions. |
| **Status in code** | ❌ Not implemented. ELECTRE serves the same niche. |
| **Cost on Vercel** | O(n²·k). Similar to ELECTRE. |

### D. Aggregation / ranking methods

#### D1. TOPSIS — Technique for Order Preference by Similarity to Ideal Solution

| Aspect | Detail |
|---|---|
| **What** | Compute the geometric distance of each alternative from the ideal solution (best on every criterion) and the anti-ideal (worst on every criterion). Rank by *closeness*: `cl = d⁻ / (d⁺ + d⁻)`. |
| **Problem types** | **SED ✓** (primary). Works on small option sets after pruning. |
| **How it solves** | Single-number total order. Easy to explain to users ("closest to your ideal"). Closeness margin between top-1 and top-2 → confidence number. |
| **When to use** | After ELECTRE has pruned; need a clear #1 and a margin. |
| **When NOT to use** | High dimensionality where vector normalization loses info; values-dominant decisions (VDD — don't reduce identity questions to a number). |
| **Status in code** | ✅ `lib/engine/stage5-ranking.ts:105–157` — fully implemented. `computeTopsis()` is canonical confidence source. |
| **Cost on Vercel** | O(n·k²). <10ms for n=50. |

#### D2. Weighted Sum Method (WSM) / Simple Additive Weighting (SAW)

| Aspect | Detail |
|---|---|
| **What** | Score = Σ w_i × normalized_score_i. The simplest compensatory aggregation. |
| **Problem types** | **SED ✓** for sanity-check baselines. |
| **How it solves** | Simple, transparent. Easy to defend in non-technical settings. |
| **When to use** | When criteria are all roughly the same kind (e.g., all currency, all 0–100 scores). Sanity baseline alongside TOPSIS. |
| **When NOT to use** | Heterogeneous criteria (mixing $ with hours with stress level) — vector normalization (TOPSIS) handles this better. |
| **Status in code** | ⚠ Implicit (TOPSIS subsumes it). Not exposed as a separate output. |

#### D3. VIKOR

| Aspect | Detail |
|---|---|
| **What** | Compromise ranking method. Produces a *compromise* solution that's "closest to ideal" with a tunable preference for majority agreement vs. minimum regret. |
| **Problem types** | **SED ✓**, **GD ✓** (group decisions). |
| **How it solves** | Like TOPSIS but explicitly optimizes both "best group agreement" and "worst individual loss" — useful when the practitioner is deciding with a spouse/partner. |
| **When to use** | Group decisions; explicit compromise needed. |
| **When NOT to use** | Single decision-maker — TOPSIS is simpler. |
| **Status in code** | ❌ Not implemented. |

### E. Robust / regret methods

#### E1. Minimax regret

| Aspect | Detail |
|---|---|
| **What** | For each option, compute the worst-case regret if you picked it and the world turned out differently. Choose the option whose *maximum* regret is smallest. |
| **Problem types** | **SED ✓**, **VDD ✓**, **TCLD ✓**, **HC modifier ✓** |
| **How it solves** | Robust under preference uncertainty. Doesn't claim "the best" — claims "least worst." Honest in low-confidence regimes. |
| **When to use** | High-consequence decisions; preferences are incomplete; user wants safety net. |
| **When NOT to use** | Low-stakes decisions — overly cautious; TOPSIS gives more decisive output. |
| **Status in code** | ✅ `lib/engine/stage5-ranking.ts:160–196` — fully implemented as the *robust alternative* surfaced in the UI. |

#### E2. Info-gap decision theory

| Aspect | Detail |
|---|---|
| **What** | Quantifies the "horizon of uncertainty" — how far reality can deviate from your model before your decision fails. |
| **Problem types** | **HC modifier**, **TCLD ✓** under deep uncertainty |
| **How it solves** | When you don't know enough to do Bayesian — info-gap is "robust to ignorance." |
| **When to use** | When even priors are unreliable (rare for practitioner decisions). |
| **Status in code** | ❌ Not implemented. Probably overkill for v1. |

### F. Sensitivity & validation methods

#### F1. One-at-a-time sensitivity (OAT)

| Aspect | Detail |
|---|---|
| **What** | Vary one parameter (a weight, a threshold) at a time and observe rank changes. |
| **Problem types** | All — validation step |
| **How it solves** | Tells the user "your answer is stable" or "your answer would flip if you cared 10% more about reimbursement." |
| **When to use** | Every recommendation, optionally. |
| **Status in code** | ❌ Not implemented. **Easy add — high user-trust value.** |

#### F2. Sobol global sensitivity

| Aspect | Detail |
|---|---|
| **What** | Variance-decomposition sensitivity — how much of the output variance is attributable to each input. |
| **Problem types** | **HC modifier**, model validation. |
| **How it solves** | Catches non-linear interactions OAT misses. |
| **When to use** | Engine threshold-tuning; auditing the ELECTRE 0.7/0.2 thresholds. |
| **When NOT to use** | Per-user runs — too expensive (~3s JS). |
| **Cost on Vercel** | ~3s for k=8, ~10s for k=20. Acceptable as offline analysis, not per-request. |
| **Status in code** | ❌ Not implemented. R&D candidate. |

### G. Decision-type-specific methods

#### G1. Multi-Armed Bandits (Successive Elimination)

| Aspect | Detail |
|---|---|
| **What** | Sequential decision-making with online feedback. "Test these options on real outcomes; eliminate the worst as evidence accumulates." |
| **Problem types** | **MS modifier** (multi-session), **EDD ✓** in iterated form |
| **How it solves** | Useful for the weekly-audit feature: track which AI tools the user kept using, which they retired. Bandit eliminates poor performers over time. |
| **When to use** | Weekly workflow audit (v1.1+); A/B testing skills. |
| **Status in code** | ❌ Not implemented. **High-fit for the weekly-audit feature.** |

#### G2. Progressive preference graph (DAG)

| Aspect | Detail |
|---|---|
| **What** | Persisted graph of user preferences with conditional dependencies. "Patient population only matters if take-insurance is decided." |
| **Problem types** | **MS modifier**, **EDD**, **GDD** |
| **How it solves** | Skips redundant questions across sessions. Detects preference drift. Adapts the engine to *this user over time*, not just this session. |
| **When to use** | Once the practitioner is on session 3+. |
| **Status in code** | ❌ Stage 1 re-elicits every session. Easy SQL add. |

### H. Tournament Tree Method (TTM)

| Aspect | Detail |
|---|---|
| **What** | Reduced pairwise comparison: m−1 comparisons vs m(m−1)/2 naive. Builds a single-elimination bracket. |
| **Problem types** | **SED ✓** when criteria are independent |
| **How it solves** | Far fewer comparisons; loses info on second-place rankings. |
| **When to use** | Large criteria sets (>8) where AHP gets painful. |
| **When NOT to use** | When you need a full ranking, not just the top one. |
| **Status in code** | ❌ Not implemented. Recent preprint; treat cautiously. |

---

## Part 3 — Pipeline routing for the practitioner's actual decisions

Concrete mapping of psychiatrist-relevant decisions to the right pipeline. Useful as a routing table for the engine's classifier (Stage 0, not yet implemented but the next add after F-10).

| User question | PEDE type | Flags | Pipeline | Why this fit |
|---|---|---|---|---|
| "Should I hire a part-time VA?" | **SED** | HC- | Veto (budget, no-evening-hrs) → Stage 1 weight estimate (or AHP if user opts in) → ELECTRE → TOPSIS → minimax-regret fallback | Finite options, known criteria, mid-stakes |
| "Should I raise rates 8%?" | **SED** | HC | Veto (patient attrition floor) → AHP for weights (high-trust) → ELECTRE → TOPSIS | Finite options, financial, defensibility matters |
| "Should I sell the practice?" | **VDD** | HC, MS, GD | VFT → RGT → constraints → minimax-regret reflection. No final ranking. | Identity / life direction. Returning a single number would be false precision. |
| "Should I take insurance or stay self-pay?" | **SED / VDD hybrid** | HC | AHP for weights → ELECTRE → TOPSIS, BUT also surface a values map (VFT-style) | Financial *and* identity dimensions. AHP for the financial axis; VFT for the identity axis. |
| "What patient population should I serve?" | **VDD** | HC, MS | VFT → RGT → constraints → minimax-regret. Values map output. | Identity-laden; pure ranking misses the point. |
| "Where should I start using AI in my practice?" | **EDD** | UD, MS | RGT (what dimensions do you care about?) → option generation → BOED (or sparse-prior estimate) → progressive profiling | Option space *and* feature space initially unclear. **This is the primary path of Decision Doctor — F-08 + F-09 land here.** |
| "What AI skill should I ship first?" | **GDD** | NF, UD | VFT → constraint check (data, time, trust) → ranked drains × feasibility (F-08) → top skill scaffold (F-09) | Option must be built (skill/plugin), not picked off a list |
| "How should I handle pharmacy callbacks this week?" | **TCLD** | — | FFT (urgent vs not) → minimax-regret on the urgents → one-shot ranking | Time-bound, low-data |
| "How should I plan referral expansion?" | **GDD / SED hybrid** | MS | VFT → constraints (geography, specialties) → option generation → ELECTRE → TOPSIS | The third decision template per PRD §3 |
| "Weekly workflow audit — what's working and what's not?" | **MS-flagged across sessions** | MS, UD | Multi-armed bandit (successive elimination) over active AI tools | The v1.1 weekly-audit feature |

---

## Part 4 — Implementation status by algorithm

| Algorithm | Status | File / location | F-criteria |
|---|---|---|---|
| Hard-constraint vetoes (FFT-like) | ✅ Implemented | `lib/engine/stage2-constraints.ts` | F-03 / T-03 |
| ELECTRE pairwise outranking | ✅ Implemented | `lib/engine/stage4-outranking.ts` | F-03 / T-03 |
| TOPSIS ranking | ✅ Implemented | `lib/engine/stage5-ranking.ts:105` | F-03 / T-03 |
| Minimax regret | ✅ Implemented | `lib/engine/stage5-ranking.ts:160` | F-03 / T-03 |
| Confidence (TOPSIS margin) | ✅ Implemented | `lib/engine/stage5-ranking.ts:72` | F-03 / T-03 |
| Weight normalization | ✅ Implemented (pass-through) | `lib/engine/stage3-weights.ts` | F-03 / T-03 |
| LLM-adjusted weights | ✅ Implemented | `lib/engine/stage1-values.ts` | F-03 / T-03 |
| AI-feasibility classifier | 🟡 Planned (F-08, chunk A next) | `lib/engine/stage6-feasibility.ts` (NEW) | F-08 / T-11 |
| Skill/plugin scaffold generator | 🟡 Planned (F-09, chunk B after A) | `lib/engine/stage7-scaffold.ts` (NEW), `lib/scaffold-generator.ts` (NEW) | F-09 / T-12 |
| **AHP elicitation** | 🟡 **Planned (F-10, this commit)** | `lib/engine/stage1b-ahp.ts` (NEW), `components/elicitation/AhpPairwise.tsx` (NEW) | **F-10 / T-13** |
| Decision-type classifier (PEDE Stage 0) | ❌ Research-only | Would be `lib/engine/stage0-classifier.ts` | Future F-11 |
| VFT — Value-Focused Thinking | ❌ Research-only | Would be `lib/engine/vft.ts` | Future F-12 |
| RGT — Repertory Grid | ❌ Research-only | Would be `lib/engine/rgt.ts` | Future F-13 |
| PAPRIKA | ❌ Research-only | Would be `lib/engine/paprika.ts` | Future F-14 |
| BOED — Bayesian Optimal Experimental Design | ❌ Research-only | Would be `lib/engine/stage3b-boed.ts` (replaces pass-through) | Future F-15 |
| Multi-armed bandit | ❌ Research-only | Tied to weekly-audit feature on Railway | Future F-16 |
| Progressive preference graph (DAG) | ❌ Research-only | Schema + `lib/engine/preference-graph.ts` | Future F-17 |
| Sensitivity analysis (OAT) | ❌ Easy add | `lib/engine/sensitivity-oat.ts` | Future F-18 |
| PROMETHEE | ❌ Not planned | (ELECTRE serves the niche) | — |
| Conjoint Analysis | ❌ Not planned | (PAPRIKA serves the niche) | — |
| Sobol global sensitivity | ❌ Not planned | (Offline tuning only; not per-request) | — |

---

## Part 5 — Routing decision tree (engine Stage 0)

The PEDE framework's biggest leverage is **routing**: send each user question to the right pipeline. This is a Stage-0 classifier the engine doesn't have yet.

```
USER QUESTION
   │
   ├─► [LLM classifier] → PEDE type ∈ {SED, GDD, VDD, EDD, TCLD}
   │                    → Modifiers ⊆ {HC, SP, GD, MS, UD, NF}
   │
   ▼
┌─────────────┬─────────────────────────────────────────────────────────┐
│ SED         │ Veto → AHP or LLM-weights → ELECTRE → TOPSIS → minimax  │
├─────────────┼─────────────────────────────────────────────────────────┤
│ GDD         │ VFT → constraints → option generation → BOED → rank     │
├─────────────┼─────────────────────────────────────────────────────────┤
│ VDD         │ VFT → RGT → constraints → minimax reflection. NO RANK.  │
├─────────────┼─────────────────────────────────────────────────────────┤
│ EDD         │ RGT → VFT → option generation → BOED → progressive      │
├─────────────┼─────────────────────────────────────────────────────────┤
│ TCLD        │ FFT → minimax regret → optional one-shot rank           │
└─────────────┴─────────────────────────────────────────────────────────┘
                                │
                                ▼
                       [Stage 6: F-08]  AI-feasibility per workloadReducer
                                │
                                ▼
                       [Stage 7: F-09]  Scaffold for skill/plugin reducers
                                │
                                ▼
                        AUDIT TRAIL + UI RENDER
```

**Why the routing matters:** the current build forces every decision through the SED pipeline. That's correct for the three v1 templates (capacity / pricing / referral-network are all SED), but it produces false precision when applied to VDD ("should I sell?") or EDD ("where do I start?"). The PEDE classifier is the unlock.

**Recommended sequencing post-buildathon-round-1:**
1. F-08 (chunk A) — adds feasibility chips. Unlocks the primary path narrative.
2. F-09 (chunk B) — adds scaffold viewer. Closes the "build me the tool" loop.
3. F-10 (this commit) — adds AHP elicitation. Gives users the high-trust weight-setting path for VDD-ish decisions like sell-the-practice.
4. F-11 PEDE classifier — adds the routing intelligence so the engine picks the right pipeline for each question.
5. F-12 VFT + F-13 RGT — unlocks the VDD and EDD pipelines properly.
6. F-15 BOED — unlocks adaptive elicitation; cuts user burden in EDD/GDD cases.

This sequencing gets the secondary path (decide-given-constraints) progressively richer without bottlenecking on any one heavy R&D track.

---

## Part 6 — How to read this doc

This is a routing table, not a tutorial.

- **Building a new template?** Find the PEDE type, look up the default pipeline in Part 1, cross-reference the algorithms in Part 2.
- **Adding an algorithm?** Check Part 4 status, place it correctly in the Part 5 routing tree.
- **Debugging why a recommendation feels off?** Probably mis-routed. Re-classify the question; check whether you're forcing a VDD into an SED pipeline (false-precision symptom) or an SED into a VDD (analysis-paralysis symptom).

---

## Sources

- `Reference files/Decisio Science Research/decision_engine_master_report.md` (879 lines) — PEDE framework canonical reference
- `Reference files/Decisio Science Research/Preference Elicitation Decision Engine  Equations, Logic Structures, and System Architecture.md` (797 lines) — equation library
- `Reference files/Decisio Science Research/Decision Science for Radical Preference Simplification  A Cross-Disciplinary Framework.md` (450 lines) — framework comparison
- `Reference files/Decisio Science Research/deep-research-report.md` (176 lines) — sparse-preference & BOED theory
- `~/dev/git-folder/decision-doctor-codex/.build-loop/decision-science-framework-review.md` — sibling-branch framework review (codex branch)

External:
- [Multi-Criteria Decision Making (MCDM) Methods and Concepts — MDPI](https://www.mdpi.com/2673-8392/3/1/6)
- [MCDA Overview — 1000minds](https://www.1000minds.com/decision-making/what-is-mcdm-mcda)
- [Comparison of Compensatory and Non-Compensatory MCDM — Springer](https://link.springer.com/article/10.1007/s11269-017-1702-x)
- [AHP/TOPSIS/ELECTRE/PROMETHEE comparison — ResearchGate](https://www.researchgate.net/figure/Comparison-of-AHP-ELECTRE-SAW-and-TOPSIS-Methods-1_tbl1_331545630)
- [Comparison of AHP, PAPRIKA, PROMETHEE, DEX, TOPSIS on employee selection — Springer](https://link.springer.com/chapter/10.1007/978-3-030-73976-8_4)
- [ARL Survey of Multi-Criteria Decision-Making — DTIC AD1109940](https://apps.dtic.mil/sti/trecms/pdf/AD1109940.pdf)
- Belton & Stewart (2002), *Multiple Criteria Decision Analysis: An Integrated Approach* — Springer.

---

*This doc is the engine's design-decision authority for "which algorithm fits which problem." Update it whenever an algorithm lands or routing logic changes.*
