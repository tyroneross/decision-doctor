# Preference Elicitation Decision Engine: Equations, Logic Structures, and System Architecture

***

## Overview

This document is a technical specification and system design for a **Preference Elicitation Decision Engine (PEDE)** — a modular, composable system that routes decision problems to the optimal algorithmic pipeline, narrows a large option space to a confident recommendation in 7–15 user interactions, and is designed for embedding in AI, web, and mobile applications. Every major algorithm is presented with its mathematical formulation, logic structure, implementation notes, and integration role.

***

## Section 1: MECE Decision Taxonomy

Before routing a problem to an algorithm, the system must classify the decision type. The following taxonomy is MECE — every decision belongs to exactly one primary type, with secondary attributes that modify the algorithm selection.

### Primary Decision Dimensions

| Dimension | Values | Routing Impact |
|---|---|---|
| **Reversibility** | Reversible ↔ Irreversible | Irreversible → more rigor, more questions, confidence threshold higher |
| **Consequence magnitude** | Low ↔ High | High → add robustness/regret layer |
| **Attribute space** | Known (structured) ↔ Unknown (open-ended) | Unknown → start with RGT/VFT before BOED |
| **Option set** | Enumerable (finite, pre-defined) ↔ Generative (constructed from preferences) | Enumerable → ELECTRE pre-filter feasible; Generative → BOED constructs ideal profile |
| **Preference structure** | Compensatory (tradeoffs allowed) ↔ Non-compensatory (veto logic) | Non-compensatory → FFT layer first |
| **Stakeholder count** | Individual ↔ Multi-stakeholder | Multi-stakeholder → add AHP group weighting layer |
| **Time horizon** | One-shot ↔ Progressive (learns over sessions) | Progressive → add persistent preference graph |

### MECE Decision Categories (5 Primary Types)

**Type I — Structured Enumerable Decisions (SED)**
Finite, pre-defined option set. Attributes known. Examples: house purchase, car selection, vendor selection, cloud provider choice, job offer comparison.
*Primary pipeline: FFT veto → BOED/Conjoint → ELECTRE → TOPSIS*

**Type II — Generative Design Decisions (GDD)**
Option space is constructed from preferences, not pre-enumerated. Examples: app design, product feature selection, travel itinerary, hiring profile.
*Primary pipeline: VFT → BOED → Constraint Satisfaction → Conjoint*

**Type III — Values-Dominant Decisions (VDD)**
Decision is fundamentally about values clarification, not option comparison. Examples: should I have kids, should I leave my job, what career should I pursue.
*Primary pipeline: VFT → RGT → FFT → Minimax Regret (no ranking algorithm)*

**Type IV — Exploratory Discovery Decisions (EDD)**
User doesn't know what they want or what the options are. Examples: where should I travel, what hobby should I pick up, what AI use case should I start with.
*Primary pipeline: RGT triads → VFT → BOED → Progressive Profiling*

**Type V — Time-Critical / Low-Reversibility Decisions (TCLD)**
High stakes, some time pressure, incomplete information available. Examples: emergency vendor selection, rapid investment thesis, incident response.
*Primary pipeline: FFT (veto-only) → Minimax Regret recommendation → BOED refinement if time allows*

### Secondary Modifiers

- **Sparse preference flag** (SP): User likely cares about only 3–5 dimensions. Activate sparse BOED prior.
- **Multi-session flag** (MS): Preferences can be refined over time. Activate progressive profiling layer.
- **Group decision flag** (GD): Multiple stakeholders. Activate AHP group aggregation.
- **High-stakes confidence flag** (HC): Recommendation must meet confidence threshold \( \tau \) before delivery. Activate minimax regret guard.

***

## Section 2: Core Equations and Logic Structures

### 2.1 Information Entropy and Information Gain (Foundation)

Shannon entropy measures uncertainty over a set of options \( \mathcal{O} \):

\[ H(\mathcal{O}) = -\sum_{o \in \mathcal{O}} p(o) \log_2 p(o) \]

For a uniform distribution over \( N \) options, \( H = \log_2 N \). For 1,000 options, \( H \approx 10 \) bits. Each perfectly balanced binary question eliminates exactly 1 bit.

**Information Gain** from asking question \( q \) with observed answer \( a \):

\[ IG(q) = H(\mathcal{O}) - \sum_a p(a) \cdot H(\mathcal{O}|a) \]

**Implementation note:** This is the objective function maximized at every question-selection step in adaptive systems. The question with highest \( IG \) is always asked next. A perfectly balanced question (50/50 answer split) achieves maximum IG = 1 bit. In practice, 7 maximally informative questions eliminate 7 bits of uncertainty, reducing a 128-option set to ~1 option.[^1]

**Routing role:** Used as the scoring function in BOED (Section 2.3) and decision tree question selection (Section 2.6).

***

### 2.2 Fast-and-Frugal Trees (FFT) — Veto and Hard Constraint Layer

An FFT for \( m \) cues has \( m+1 \) exits: one exit per cue (except the last cue which has two exits). Cues are ranked by **validity** — the probability that the cue correctly classifies an option as acceptable or unacceptable.[^2]

**Cue validity:**

\[ v_i = \frac{\text{correct classifications using cue } c_i}{\text{total comparisons using cue } c_i} \]

**Lexicographic classification rule** (splitting profile):[^3][^4]

For a cue profile \( \mathbf{x} = [x_1, x_2, \ldots, x_n] \) and a splitting profile \( \mathbf{S} = [s_1, s_2, \ldots, s_n] \):

- Option \( x \) is assigned to *acceptable* class iff \( \mathbf{x} >_L \mathbf{S} \) (lexicographically greater than splitting profile)
- Cues inspected in validity-ranked order; exit occurs at first discriminating cue

**Algorithm:**
```
For each option x in option_set:
  For i = 1 to n (ordered by descending validity):
    if x[i] satisfies exit_condition[i]:
      classify(x) → REJECT  // veto triggered
      break
  else:
    → PASS to next layer
```

**Mathematical formulation as linear model with non-compensatory weights:**

\[ \text{classify}(\mathbf{x}) = \text{sign}\left(\sum_{i=1}^{n} w_i^{FFT} \cdot x_i - \theta\right) \]

Where \( w_i^{FFT} \) are non-compensatory weights (no lower criterion can compensate for a higher one). The key property: \( w_1 > \sum_{i=2}^{n} w_i \) — the top cue outweighs all others combined.[^4]

**Implementation decision:** FFTs run *computationally* against the full option database before any user interaction. The system pre-filters the option set using hard constraints from the intake form (budget max, geography, required features). This is the cheapest possible operation — eliminating 80–95% of options with 2–4 user inputs.

**Pros:** Near-zero cognitive load; eliminates dominated options deterministically; mathematically equivalent to veto logic in ELECTRE.
**Cons:** Misses tradeoffs; rank ordering of cues matters greatly; optimal cue ordering is NP-hard to find (approximated by validity sorting).

***

### 2.3 Bayesian Optimal Experimental Design (BOED) — Adaptive Elicitation Layer

The core adaptive engine. Selects the next question to maximize Expected Information Gain (EIG) over the posterior distribution of user preferences.[^5][^6]

**User preference model:** Latent utility vector \( \boldsymbol{\theta} \in \mathbb{R}^d \) where \( d \) is the number of attributes. Prior: \( p(\boldsymbol{\theta}) \).

**EIG for candidate question \( \xi \):**

\[ \text{EIG}(\xi) = \mathbb{E}_{p(y|\xi)}\left[ H[p(\boldsymbol{\theta})] - H[p(\boldsymbol{\theta}|y, \xi)] \right] \]

Equivalently, as mutual information between the latent parameter and the observed response:

\[ \text{EIG}(\xi) = I(\boldsymbol{\theta}; y | \xi) = H(y|\xi) - H(y|\boldsymbol{\theta}, \xi) \]

**Posterior update** after observing response \( y \) to question \( \xi \):

\[ p(\boldsymbol{\theta}|y, \xi) \propto p(y|\xi, \boldsymbol{\theta}) \cdot p(\boldsymbol{\theta}) \]

**Pairwise comparison response model** (Bradley-Terry): Probability that user prefers option \( A \) over \( B \):[^7][^8]

\[ P(A \succ B | \boldsymbol{\theta}) = \sigma\left( \boldsymbol{\theta}^T (\mathbf{f}_A - \mathbf{f}_B) \right) = \frac{1}{1 + e^{-\boldsymbol{\theta}^T (\mathbf{f}_A - \mathbf{f}_B)}} \]

Where \( \mathbf{f}_A \) and \( \mathbf{f}_B \) are feature vectors for options A and B, and \( \sigma(\cdot) \) is the logistic function.

**After each comparison, Bayesian posterior update:**

\[ p(\boldsymbol{\theta}|y_{1:t}) \propto p(\boldsymbol{\theta}) \prod_{k=1}^{t} \sigma\left( y_k \cdot \boldsymbol{\theta}^T (\mathbf{f}_{A_k} - \mathbf{f}_{B_k}) \right) \]

**Sparse preference prior** (for sparse BOED variant): Place a sparsity-inducing prior on \( \boldsymbol{\theta} \):[^9]

\[ p(\boldsymbol{\theta}) = \text{Laplace}(0, \lambda) \quad \text{or} \quad p(\boldsymbol{\theta}) = \text{Spike-and-Slab}(k\text{-sparse}) \]

This reduces the effective dimensionality from \( d \) to \( k \), changing the minimax sample complexity from \( \Theta(d/n) \) to \( \Theta(\frac{k}{n}\log(d/k)) \) — potentially a 10–20x reduction in required comparisons for typical real-world decisions.[^9]

**Implementation note:** Full BOED is computationally expensive. The TrueSkill-based approximation from real-time multiattribute PE enables closed-form updates:[^10]

\[ p(\boldsymbol{\theta}|y) \approx \mathcal{N}(\boldsymbol{\mu}_{t+1}, \boldsymbol{\Sigma}_{t+1}) \]

Where mean and covariance are updated analytically using moment matching — enabling millisecond latency per question selection.

**Question selection algorithm:**
```
For each candidate question q in question_pool:
  Compute EIG(q) via Monte Carlo or closed-form approximation
  
Select q* = argmax_{q} EIG(q)
Present q* to user
Update posterior with response
Repeat until convergence criterion met
```

**Convergence criterion:** Stop when posterior variance falls below threshold \( \epsilon \), or when the expected regret of the current best recommendation \( r^* \) falls below tolerance \( \delta \):

\[ \text{Stop when: } \mathbb{E}[R(r^*)] \leq \delta \]

**Pros:** Theoretically optimal per-question information extraction; adapts to each user's specific response pattern; robust to noisy answers; provides uncertainty quantification.
**Cons:** Computationally intensive without approximations; requires pre-defined feature space; cold-start problem when feature space is unknown.

***

### 2.4 PAPRIKA / Pairwise Ranking — Structured Tradeoff Elicitation

PAPRIKA elicits a linear additive utility model by presenting pairwise comparisons on exactly two criteria at a time. Each comparison is either explicit (user answers) or implicit (derived as a logical consequence of prior answers).[^11][^12]

**Additive utility model:**

\[ U(a) = \sum_{j=1}^{m} w_j \cdot v_j(a_j) \]

Where \( w_j \geq 0 \), \( \sum_{j=1}^{m} w_j = 1 \), \( v_j(a_j) \) is the part-worth utility for level \( a_j \) of criterion \( j \), and \( 0 \leq v_j(a_j) \leq 1 \) with min = 0 and max = 1 for each criterion.

**PAPRIKA comparison structure:** Each question presents two hypothetical alternatives defined on exactly two criteria \( j \) and \( k \), with all other criteria equal:

\[ \text{Alt 1}: (a_j^{high}, a_k^{low}) \quad \text{vs} \quad \text{Alt 2}: (a_j^{low}, a_k^{high}) \]

If user prefers Alt 1: \( w_j \cdot [v_j(a_j^{high}) - v_j(a_j^{low})] > w_k \cdot [v_k(a_k^{high}) - v_k(a_k^{low})] \)

This generates a system of linear inequalities:[^12]

\[ \mathbf{w}^T \mathbf{c}_r \geq 0 \quad \text{for each comparison } r \]

Where \( \mathbf{c}_r \) is the constraint vector for comparison \( r \). Weights are recovered via linear programming:

\[ \text{Find } \mathbf{w} \text{ such that: } \mathbf{A}\mathbf{w} \geq \mathbf{0}, \quad \mathbf{1}^T\mathbf{w} = 1, \quad \mathbf{w} \geq \mathbf{0} \]

**Implicit ranking exploitation:** Any pair \( (A, B) \) where \( A \) dominates \( B \) on all criteria is automatically ranked without user input (eliminated by dominance). Pairs implicitly ranked as corollaries of prior answers are eliminated via transitivity. This minimizes the number of explicit comparisons.[^11]

**Pros:** Cognitively simple (one tradeoff at a time); adapts question selection to prior answers; linear programming recovery is exact; handles indifference; rated highest in patient preference studies.[^13]
**Cons:** Assumes additive utility (no interaction effects between criteria); number of comparisons grows with \( O(m^2) \) for \( m \) criteria before implicit reduction; poorly suited to non-compensatory preferences.

***

### 2.5 ELECTRE — Outranking / Dominance Elimination Layer

ELECTRE operates computationally against a scored option database. It eliminates alternatives dominated under the user's elicited weights, without requiring user interaction.[^14][^15]

**Concordance Index** \( c(a, b) \): measures strength of evidence that alternative \( a \) is at least as good as \( b \):

\[ c(a, b) = \sum_{j \in C^+(a,b)} w_j \]

Where \( C^+(a,b) = \{j : g_j(a) \geq g_j(b)\} \) is the concordant coalition — criteria where \( a \) is no worse than \( b \) — and \( w_j \) are the elicited criterion weights with \( \sum_j w_j = 1 \).[^15]

**Discordance Index** \( d_j(a, b) \): measures strength of opposition on criterion \( j \):

\[ d_j(a, b) = \frac{\max\{0, g_j(b) - g_j(a)\}}{g_j^{max} - g_j^{min}} \]

**Credibility Index** \( \rho(a, b) \) (ELECTRE III): combines concordance and discordance:

\[ \rho(a, b) = c(a, b) \cdot \prod_{j \in D(a,b)} \frac{1 - d_j(a,b)}{1 - c(a,b)} \]

Where \( D(a,b) = \{j : d_j(a,b) > c(a,b)\} \) is the set of criteria with strong enough discordance to partially veto the outranking.[^15]

**Outranking threshold:** Alternative \( a \) outranks \( b \) iff \( \rho(a,b) \geq \lambda \) where \( \lambda \in [0.5, 1] \) is the credibility threshold (typically 0.75 default).

**Concordance Dominance Matrix** \( F \):

\[ f_{kl} = \begin{cases} 1 & \text{if } c(k,l) \geq \bar{c} \\ 0 & \text{otherwise} \end{cases} \]

Where \( \bar{c} = \frac{1}{m(m-1)} \sum_{k \neq l} c(k,l) \) is the average concordance threshold.[^16]

**Elimination rule:** Alternative \( a \) is eliminated if there exists some \( b \) such that \( b \) outranks \( a \) AND \( a \) does not outrank \( b \).

**Implementation note:** ELECTRE runs silently in the background after BOED/PAPRIKA produces weights \( \mathbf{w} \). The user sees only the result: a collapsed option set. For a database of 100 alternatives with 5 criteria, ELECTRE typically eliminates 60–80% of the remaining candidates.

**Pros:** No additional user questions; handles conflicting criteria gracefully; veto logic maps to real preferences; eliminates "incomparable" options cleanly.
**Cons:** Sensitive to threshold parameters; does not produce a final ranking (only eliminates dominated options); requires pre-scored alternatives database.

***

### 2.6 TOPSIS — Final Scoring and Ranking

TOPSIS ranks the shortlisted alternatives (post-ELECTRE, typically 5–15) by their geometric proximity to the ideal solution and distance from the anti-ideal.[^17][^18]

**Step 1 — Normalized decision matrix:**

\[ r_{ij} = \frac{x_{ij}}{\sqrt{\sum_{k=1}^{m} x_{kj}^2}} \]

Where \( x_{ij} \) is the performance of alternative \( i \) on criterion \( j \), \( m \) is the number of alternatives.

**Step 2 — Weighted normalized matrix:**

\[ v_{ij} = w_j \cdot r_{ij} \]

**Step 3 — Positive ideal solution** \( A^+ \) **and negative ideal solution** \( A^- \):

\[ A^+ = \left\{ v_1^+, v_2^+, \ldots, v_n^+ \right\} = \left\{ \max_i v_{ij} \text{ (benefit)} \text{ or } \min_i v_{ij} \text{ (cost)} \right\} \]

\[ A^- = \left\{ v_1^-, v_2^-, \ldots, v_n^- \right\} = \left\{ \min_i v_{ij} \text{ (benefit)} \text{ or } \max_i v_{ij} \text{ (cost)} \right\} \]

**Step 4 — Euclidean separation distances:**

\[ S_i^+ = \sqrt{\sum_{j=1}^{n} (v_{ij} - v_j^+)^2}, \quad S_i^- = \sqrt{\sum_{j=1}^{n} (v_{ij} - v_j^-)^2} \]

**Step 5 — Relative closeness coefficient (final score):**

\[ C_i^* = \frac{S_i^-}{S_i^+ + S_i^-} \in [0, 1] \]

Higher \( C_i^* \) = better. Rank alternatives by descending \( C_i^* \).

**Explanation string generation:** For each top-ranked alternative, attribute contribution to score:

\[ \Delta_j(i) = w_j \cdot \frac{v_{ij} - v_j^-}{(v_j^+ - v_j^-)} \]

This is the natural-language explanation engine: "\( X \) ranked #1 primarily because of its proximity to your ideal on [criterion \( j \) with highest \( \Delta_j \)]."

**Pros:** Computationally trivial; intuitive geometric interpretation; generates explainable rankings; handles quantitative data natively.
**Cons:** Sensitive to normalization method choice; weights must already be elicited; rank reversal possible when adding alternatives (mitigated by ELECTRE pre-filtering).

***

### 2.7 Minimax Regret — Robust Recommendation Under Incomplete Information

When preference elicitation is incomplete (user interrupted, insufficient questions answered), minimax regret provides a defensible recommendation with worst-case guarantees.[^19][^20]

**Regret of choosing alternative \( x \) under utility function \( \mathbf{u} \):**

\[ \text{Regret}(x, \mathbf{u}) = \max_{x' \in \mathcal{X}} \mathbf{u}(x') - \mathbf{u}(x) \]

**Max regret** of \( x \) over all consistent utility functions in feasible region \( \mathcal{F} \):

\[ \text{MaxRegret}(x) = \max_{\mathbf{u} \in \mathcal{F}} \text{Regret}(x, \mathbf{u}) \]

**Minimax Regret recommendation:**

\[ x^* = \arg\min_{x \in \mathcal{X}} \text{MaxRegret}(x) \]

This is computed via linear programming:[^21]

\[ \min_x \max_{\mathbf{u} \in \mathcal{F}} \left[ \max_{x'} \mathbf{u}(x') - \mathbf{u}(x) \right] \]

**Incremental elicitation:** After each question, the feasible region \( \mathcal{F} \) shrinks. The question selected is the one that most reduces the current minimax regret bound:

\[ q^* = \arg\min_q \mathbb{E}[\text{MMR after answer to } q] \]

**Implementation decision rule:** If \( \text{MMR}(x^*) \leq \delta \) (acceptable regret tolerance), recommend \( x^* \) immediately without further questions. This provides a principled stopping condition that doesn't exist in pure BOED.

**Pros:** Provides worst-case guarantees (not just expected performance); works with incomplete elicitation; natural stopping criterion; robust to noise.
**Cons:** Conservative — may delay recommendation unnecessarily; computationally harder than expected utility approaches; LP solving adds latency.

***

### 2.8 Conjoint Analysis / Part-Worth Estimation — Attribute Weight Recovery

Used as an alternative or complement to BOED in structured domains with known attribute levels.

**Additive part-worth model:**

\[ U_j = \sum_{p=1}^{P} \beta_{jp} \cdot x_{jp} + \epsilon_j \]

Where \( \beta_{jp} \) is the part-worth utility for level \( p \) of attribute \( j \), \( x_{jp} \) is a dummy variable indicator, and \( \epsilon_j \) is the error term.

**OLS estimation** from \( T \) choice tasks:

\[ \hat{\boldsymbol{\beta}} = (\mathbf{X}^T \mathbf{X})^{-1} \mathbf{X}^T \mathbf{y} \]

**Relative attribute importance:**

\[ I_j = \frac{\max_p \beta_{jp} - \min_p \beta_{jp}}{\sum_{j=1}^{m} \left(\max_p \beta_{jp} - \min_p \beta_{jp}\right)} \times 100 \]

**Hierarchical Bayes extension** (for individual-level estimation with limited data):

\[ \boldsymbol{\beta}_i \sim \mathcal{N}(\boldsymbol{\mu}, \boldsymbol{\Sigma}) \]
\[ \boldsymbol{\mu} \sim \mathcal{N}(\mathbf{0}, \tau^2 \mathbf{I}), \quad \boldsymbol{\Sigma} \sim \text{Wishart}(\nu, \mathbf{V}) \]

HB estimation provides robust individual-level estimates even from 6–8 choice tasks by borrowing strength from population-level distributions — enabling micro-session use cases (5-minute preference capture).[^22]

***

### 2.9 Repertory Grid Technique (RGT) — Construct Elicitation

RGT surfaces the dimensions a user personally uses to differentiate options, before any algorithm is run.[^23][^24]

**Triadic elicitation protocol:**

```
Present user with three options: {O_a, O_b, O_c} (sampled from option space)
Ask: "In what important way are two of these similar and different from the third?"
Record: construct (bipolar label, e.g., "fast/slow") and which options share each pole
Repeat T times with different triads (T = 5–8 is sufficient for most decision contexts)
```

**Grid matrix construction:** Create \( n \times m \) matrix where rows = elicited constructs, columns = options, cells = ratings (1–5 scale). Apply principal component analysis (PCA) or multi-dimensional scaling (MDS) to identify primary construct dimensions:

\[ \mathbf{G} = \mathbf{U} \boldsymbol{\Sigma} \mathbf{V}^T \]

The top \( k \) singular values identify the most discriminating construct dimensions for this user's mental model. These dimensions become the feature space fed into BOED.

**Bridge to BOED:** RGT output \( \rightarrow \) attribute set \( \mathcal{A} = \{a_1, \ldots, a_k\} \) \( \rightarrow \) BOED feature space initialization. This solves BOED's "unknown feature space" cold-start problem.

***

### 2.10 Value-Focused Thinking (VFT) — Objective Hierarchy

VFT structures the decision as a hierarchy before options are considered.[^25]

**Objective hierarchy:**

```
Strategic goal (top-level)
  ├── Fundamental objective 1 (what you ultimately care about)
  │     ├── Means objective 1a (lever to achieve FO1)
  │     └── Means objective 1b
  └── Fundamental objective 2
        └── Means objective 2a
```

**Algorithmic formulation:** VFT generates a constraint on the utility function structure. If the user declares that FO1 and FO2 are their fundamental objectives, the utility function is constrained to:

\[ U(a) = f(g_1(a), g_2(a)) \]

Where \( g_1 \) and \( g_2 \) are multi-attribute performance scores on the two fundamental objectives only. All means objectives are modeled as inputs to \( g_1 \) and \( g_2 \), not directly into \( U \).

**Practical question sequence:**
1. "What would make this decision a complete success?" → identifies FO1
2. "What would make you regret this choice in 5 years?" → identifies FO2 (avoidance)
3. "What are the 3 most important things this decision needs to deliver?" → confirms the objective set

These 3 questions can eliminate entire decision domains before enumeration.

***

## Section 3: System Architecture — The PEDE Router

### 3.1 Master Routing Logic

```
FUNCTION route_decision(user_input, context):

  1. CLASSIFY decision type:
     TYPE ← classify(user_input) ∈ {SED, GDD, VDD, EDD, TCLD}
     FLAGS ← detect_flags(user_input)  // SP, MS, GD, HC

  2. IF attribute_space == UNKNOWN:
     RUN VFT(questions=3) → fundamental_objectives
     RUN RGT(triads=5) → construct_space
     SET feature_space = union(fundamental_objectives, construct_space)

  3. RUN FFT(option_set, hard_constraints) → pruned_set
     IF |pruned_set| == 0: RETURN "No options meet hard constraints"
     IF |pruned_set| <= 3: SKIP to TOPSIS

  4. IF TYPE in {SED, GDD}:
     IF SP_flag: SET prior = sparse_laplace(λ=sparsity_param)
     RUN BOED_or_PAPRIKA(pruned_set, feature_space) → weight_vector w
     
  5. IF TYPE in {VDD}: 
     RUN minimax_regret_values(w) → RETURN structured_values_report
     // No ranking algorithm — return values map, not recommendation

  6. IF |pruned_set| > 15:
     RUN ELECTRE(pruned_set, w, lambda=0.75) → shortlist
  
  7. RUN TOPSIS(shortlist, w) → ranked_list with C* scores

  8. IF HC_flag:
     COMPUTE MMR(top_recommendation)
     IF MMR > delta: ASK one more clarifying BOED question, loop

  9. RETURN recommendation(ranked_list, explanation_strings, confidence_score)
```

***

### 3.2 Decision Routing Matrix by Type

| Decision Type | Layer 1 | Layer 2 | Layer 3 | Layer 4 | Layer 5 | Typical Q Count |
|---|---|---|---|---|---|---|
| SED (house, car, vendor) | FFT (hard constraints) | BOED or PAPRIKA | ELECTRE (silent) | TOPSIS | MMR guard (if HC) | 8–12 |
| GDD (app design, product) | VFT (3Q) | BOED (sparse) | Constraint satisfaction | Conjoint simulation | — | 10–15 |
| VDD (kids, career) | VFT (3Q) | RGT (5 triads) | FFT (life constraints) | MMR (no ranking) | — | 10–15 |
| EDD (travel, AI use case) | RGT (5 triads) | VFT (2Q) | BOED | Progressive profiling | — | 8–12 |
| TCLD (emergency, time pressure) | FFT only | MMR immediate | (BOED if time) | — | — | 2–5 |

***

## Section 4: Configuration Hypotheses by Use Case

### Hypothesis A: "Where should I buy a house?" — Type SED

**Assumed decision space:** 500–5,000 MLS listings in a metro area

**Layer 1 — FFT (hard constraints, 3 questions, eliminates 85–95% of listings):**
- Max budget: eliminates all listings > $X
- Required school district or ZIP: eliminates geographic mismatches
- Min bedrooms: eliminates undersized properties

FFT computation against MLS database is silent to user — runs in <100ms.

**Layer 2 — Sparse BOED (5–7 pairwise questions, identifies top 3–5 driving dimensions from ~15):**

Prior: \( p(\boldsymbol{\theta}) = \text{Laplace}(0, 0.3) \) — assumes ~4 of 15 attributes drive choice

Sample question sequence generated by maximizing EIG:
1. "Bigger lot with longer commute vs. smaller lot near work?" → separates commute vs. space preference
2. "New construction, smaller footprint vs. older home, more space?" → age vs. size tradeoff
3. "Walkable neighborhood but dated finishes vs. suburban with modern kitchen?" → lifestyle vs. aesthetics

After 5–7 questions, posterior \( p(\boldsymbol{\theta}|\text{data}) \) concentrates around the user's true weight vector.

**Layer 3 — ELECTRE (silent, runs on 50–150 remaining listings):**

Concordance threshold \( \bar{c} \) set at 0.70. Veto threshold \( v_j \) on price set at 15% above budget. Typically eliminates 60–70% of remaining listings.

**Layer 4 — TOPSIS (ranks 5–20 final candidates):**

Score explanation: "123 Oak Street ranked #1: closest to your ideal on commute time, above-average on school rating, within 8% of budget target."

**Layer 5 — Progressive Profiling (session 2+):**
After viewing homes, user provides feedback. Preference graph updates: negative feedback on a specific home is modeled as a hard constraint that updates \( \mathcal{F} \) in real time.

**Rationale for this configuration:** SED problems have pre-scored databases (MLS data) enabling silent ELECTRE. BOED is optimal for the weight elicitation phase because home preferences are sparse (most buyers care mainly about 3–5 factors). TOPSIS produces an interpretable score with attribution, which drives confidence to act.

**Assumption:** User preference is primarily compensatory (can trade off commute for space) with soft constraints rather than hard vetoes on most attributes.

***

### Hypothesis B: "Help me build an app to make people happy" — Type GDD

**Layer 1 — VFT (3 questions, domain elimination):**
- "What does happiness mean to you in this context — connection, calm, achievement, discovery?"
  → Answer "connection" eliminates productivity apps, creative tools, solo wellness apps
- "Who is this for — yourself, a specific person, or a broad audience?"
  → Answer "myself and 5 close friends" eliminates B2C mass market design patterns
- "What would success look like in 6 months?"
  → Answer "we actually use it weekly" adds a retention/habit constraint

**Layer 2 — BOED on feature space (6–8 pairwise questions):**

Feature space: {notification cadence, social vs. solo, gamification level, creation vs. consumption, async vs. real-time, platform, depth vs. breadth}

Sample BOED-selected questions:
1. "Daily 2-minute shared prompts vs. weekly richer shared moments?" → cadence × depth tradeoff (highest IG given connection goal)
2. "Accountability features vs. no pressure, just memory sharing?" → tone tradeoff
3. "Photos + captions vs. text-only vs. voice notes?" → medium preference

**Layer 3 — Constraint satisfaction:**

The feature space is now parameterized as a design vector \( \mathbf{d} = [d_1, \ldots, d_k] \) with values constrained by user responses. The output is not a ranked list of existing apps — it's a **design specification** for a novel app: platform = iOS, interaction cadence = daily async prompt, social graph = closed friend group (5–8 people), content type = photo + caption, gamification = minimal, retention mechanic = streak + shared memory archive.

**Layer 4 — Conjoint simulation for feature prioritization:**

Given MVP constraints (8-week build), run a simulated conjoint on feature subsets to rank which features to build first, using the elicited part-worths as input:

\[ \text{MVP score}(F) = \sum_{j \in F} \beta_j \cdot \text{BuildCost}_j^{-1} \]

This identifies the highest utility-per-build-effort feature subset.

**Rationale:** GDD decisions have no pre-enumerable option set — the "option" is constructed from the preference elicitation process. VFT is critical first because without knowing whether "happiness" means connection vs. achievement, the entire feature space is undefined. BOED on design parameters produces a quantitative design brief, not a recommendation from a catalog.

**Assumption:** The user's preference for the app is fundamentally about a desired behavioral outcome, not about technical features. Features are means objectives; connection/calm/achievement are fundamental objectives.

***

### Hypothesis C: "Should I have kids?" — Type VDD

**No ranking algorithm is appropriate.** This is a values-dominant, irreversible, high-consequence decision. The system's role is structured values clarification, not optimization.

**Layer 1 — VFT (3 questions, identify fundamental objectives):**
- "What does a deeply fulfilling life look like to you at age 70?"
- "What role do family and legacy play in your sense of meaning?"
- "What do you imagine you would regret more: having had kids or not having had kids?"

These are not answered with a score — they are narrative inputs processed by an LLM to extract the fundamental objective set.

**Layer 2 — RGT (5 triads, surfacing latent constructs):**

Triads composed of people the user knows who have made this decision both ways:
- "Think of three people you know — two who have kids and one who doesn't. In what important way are two of them similar and different from the third?"

This surfaces the user's own personal constructs about parenting, not social scripts.

**Layer 3 — FFT (life constraints, 2–3 questions):**
- "Are there circumstances (health, relationship status, financial floor) under which this question is already answered?"
- Hard constraints eliminate not *options* but *false uncertainty* — clarifying that the decision is genuinely open.

**Layer 4 — MMR values output (no recommendation):**

The system does not say "you should have kids." It produces a structured output:

```
Fundamental objectives identified: [legacy, daily meaning, partnership deepening]
Key tensions: [career ambition vs. time commitment], [current relationship readiness]
Your dominant constructs: [family = continuity], [parenting = transformation]
Unresolved dimensions: financial readiness, partner alignment
Recommended next steps: [structured dialogue with partner on 3 unresolved dimensions]
```

**Rationale:** VDD decisions are not optimization problems. Applying TOPSIS to "should I have kids" would be actively harmful — it would create false precision and false confidence. The correct output is a structured map of the decision landscape that empowers the user to make their own well-informed choice. Minimax regret in this context means: "given my values, which choice do I least risk regretting?" — a question only the user can answer.

***

### Hypothesis D: "Where should I start using AI?" — Type EDD

**Layer 1 — RGT (5 triads, discover valuation dimensions):**

Present 3 AI use cases (e.g., copilot, data extraction, customer service bot):
- "In what way are two of these applications similar and different from the third?"
→ Surfaces user's operative dimensions: control vs. automation, near-term ROI vs. capability building, individual vs. organizational, etc.

**Layer 2 — VFT (2 questions, anchor objectives):**
- "Is the goal to reduce cost, increase capability, accelerate speed, or demonstrate to leadership?"
- "Are you solving for your own productivity or for a team/org-wide transformation?"

**Layer 3 — BOED (5–7 questions, weight the dimensions):**

Sparse BOED since most decision-makers weight ~3 dimensions heavily (ROI speed, implementation risk, strategic visibility).

Sample EIG-maximizing questions:
1. "Quick win in 30 days vs. foundational capability in 6 months?" → time horizon splits the space
2. "Self-service individual productivity vs. team workflow automation?" → scope question
3. "High control/low automation vs. autonomous agent handling routine tasks?" → autonomy preference

**Output:** Not "use ChatGPT" but "Begin with AI-assisted document extraction and summarization on your sales call transcripts. This maps to your priorities: 30-day visible ROI, low implementation risk, individual-level proof point before org rollout. Estimated 3 hours/week saved per rep."

**Rationale:** EDD problems are discovery problems. The user doesn't know what they want because they don't know the space. RGT before BOED is essential — without it, BOED would ask questions about irrelevant feature dimensions. Progressive profiling is particularly valuable here because AI use case preferences evolve with capability maturity.

***

## Section 5: Novel Synthesized Configurations

### Novel Config 1: Veto-First Sparse BOED (VF-SBOED)

**Hypothesis:** Combining FFT hard-constraint elimination with sparse Bayesian prior reduces total questions from ~12 to ~5 for well-structured decisions.

**Architecture:**
```
1. FFT veto layer (silent, 0 questions, eliminates hard mismatches)
2. Sparse BOED with Laplace(0, λ) prior where λ calibrated to expected sparsity
3. Early stopping when MMR < δ (typically after 4–6 questions)
```

**Key equation — Sparse BOED posterior:**

\[ p(\boldsymbol{\theta}|y_{1:t}) \propto \prod_{k=1}^t \sigma(y_k \boldsymbol{\theta}^T \Delta \mathbf{f}_k) \cdot \prod_{i=1}^d \exp(-\lambda |\theta_i|) \]

The Laplace prior enforces sparsity — dimensions the user doesn't respond differentially to are automatically shrunk toward zero, effectively removing them from subsequent questions.

**Tradeoff:** ✅ Fast convergence. ✅ Lower user burden. ⚠️ Risk of incorrectly zeroing a relevant dimension if early comparisons don't probe it. Mitigation: include at least one question per dimension in the first round.

***

### Novel Config 2: LLM-as-RGT-Operator → BOED Handoff (LRBO)

**Hypothesis:** Using an LLM to run conversational RGT (via natural dialogue rather than formal triads) and extracting the construct space to initialize BOED's feature space eliminates BOED's cold-start limitation.

**Architecture:**
```
1. LLM session (3–5 turns): "Tell me about a decision you made recently that felt similar. What made it hard? What mattered most?"
   → LLM extracts: entities, dimensions, contrast pairs
   → Output: feature_space = {d1="proximity to family", d2="career growth rate", d3="cost of living", ...}

2. BOED initialized with LLM-extracted feature_space
   → EIG-maximizing pairwise questions generated in natural language
   → BOED posterior updated from user responses

3. ELECTRE + TOPSIS final ranking
```

**The LLM acts as an automatic RGT analyst:** extracting personal constructs from natural language without requiring the user to engage with a formal grid interface. This is a novel architecture not present in current literature.

**Tradeoff:** ✅ Natural UX (conversational). ✅ Handles open-ended domains. ⚠️ LLM construct extraction may be biased by training data; requires validation. ⚠️ Adds 2–3 turns before BOED starts.

***

### Novel Config 3: Progressive Preference Graph (PPG)

**Hypothesis:** Treating user preferences as a DAG (directed acyclic graph) rather than a static vector enables conditional elicitation — skipping irrelevant branches based on prior answers.

**Structure:**

```
Node: preference_dimension (e.g., "budget flexibility")
Edge: conditional dependency (e.g., "budget flexibility → neighborhood quality preference IF budget < $800K")
Value: posterior distribution p(w_j | w_{parent_j})
```

**Routing rule:** Only ask about child nodes in the graph if the parent node's value is within a specified range. If budget = $2M, neighborhood quality preferences are likely moot for elimination (can afford any neighborhood). If budget = $600K, neighborhood quality is a critical discriminator.

**Benefit:** For a 20-attribute decision space, the effective number of relevant attributes per user may be 4–7. The PPG identifies and elicits only those, reducing questions by 40–60% without accuracy loss.

**Implementation:** Store PPG as a JSON schema per decision domain. Update edge weights based on population-level preference co-occurrence patterns (learned from aggregate user data).

***

## Section 6: API Design for Embedding in Apps

### Core Data Contracts

**Decision intake object:**
```json
{
  "decision_type": "SED",
  "decision_domain": "real_estate",
  "option_set": [...],          // pre-loaded from database OR null (generative)
  "hard_constraints": {},        // optional pre-populated from context
  "flags": ["sparse", "high_confidence"],
  "session_id": "uuid",          // for progressive profiling
  "prior_preference_graph": {}   // null for first session
}
```

**Question response object (streaming):**
```json
{
  "question_id": "q3",
  "question_text": "Which matters more to you: walking distance to coffee shops or a quieter street?",
  "question_type": "pairwise",
  "current_ig": 0.87,            // normalized 0–1
  "posterior_entropy": 3.2,      // remaining uncertainty in bits
  "options_remaining": 47,       // current option count
  "confidence_score": 0.61       // toward recommendation
}
```

**Recommendation delivery object:**
```json
{
  "recommendation": [...],       // ranked list
  "topsis_scores": {...},
  "mmr_bound": 0.04,             // worst-case regret
  "confidence": 0.94,
  "explanation": {
    "top_drivers": ["commute_time", "school_district"],
    "tradeoffs_accepted": ["older_construction", "smaller_yard"],
    "alternatives_considered": 312,
    "questions_asked": 9
  },
  "preference_vector": {...}     // stored for progressive profiling
}
```

### Confidence-to-Act Signal

The single most important UX element for "confident enough to act on": a real-time confidence meter updated after each question. Computed as:

\[ \text{Confidence} = 1 - \frac{H[p(\boldsymbol{\theta}|y_{1:t})]}{H[p(\boldsymbol{\theta})]} \]

This is the normalized reduction in preference entropy — intuitively: "we've eliminated X% of your preference uncertainty." Shown as a visual meter, this builds user trust as questions progress, reducing decision anxiety even before the recommendation is delivered.

***

## Section 7: Pros, Cons, and Failure Modes by Configuration

| Configuration | Best Fit | Pros | Cons | Failure Mode |
|---|---|---|---|---|
| FFT-only (TCLD) | Emergency, time-pressured | Near-instant; zero cognitive load | No tradeoffs; may over-prune | Missets veto threshold; valid options eliminated |
| VFT → BOED (GDD) | App design, product strategy | Discovers right feature space; quantifies design preferences | Requires LLM + BOED integration; 10+ turns | VFT fails if user has no clear values yet |
| VFT → RGT (VDD) | Life decisions, values-heavy | Surfaces unarticulated values; avoids false precision | No recommendation delivered; may feel incomplete | User wants a direct answer; RGT feels abstract |
| FFT → BOED → ELECTRE → TOPSIS (SED) | House, car, vendor | Full pipeline; highly accurate; explainable | Requires pre-scored database; 8–12 turns | Cold database (missing attribute scores) breaks ELECTRE |
| RGT → BOED (EDD) | Exploratory, unknown domain | Handles open-ended space; user-led discovery | Most time-intensive; 12–15 turns | RGT constructs don't map cleanly to enumerable options |
| VF-SBOED (SED, sparse) | Efficient product recommendation | Fastest convergence (4–6 turns) | Assumes sparsity; may miss complex preferences | Wrong sparsity assumption; important dimension zeroed |
| LRBO (hybrid LLM+BOED) | Conversational apps, voice interfaces | Natural UX; no formal elicitation visible to user | LLM hallucination risk in construct extraction | LLM imposes common-sense constructs vs. user's actual ones |
| PPG (multi-session) | Relationship apps, long-decision cycles | Compounds accuracy; reduces future burden | Requires session persistence; privacy surface | Stale preferences from past sessions override current ones |

***

## Section 8: Design Principles for Confident Action

The engineering goal is not merely *accuracy* but *confidence to act* — a psychologically distinct state. Three evidence-based design principles from behavioral science:

**Principle 1 — Cognitive load reduction:** Never present more than 2 options in a single interaction. Every comparison is pairwise. Present progress as a meter ("You've narrowed from 500 to 23 options"), which reduces decision anxiety by showing momentum.[^10]

**Principle 2 — Attribution transparency:** Every recommendation must state *why* in terms of the user's own answers. "We recommend 123 Oak Street because you said commute matters more than yard size, and this property ranked #1 on commute proximity while staying within budget." This maps back to the TOPSIS \( \Delta_j \) attribution scores.

**Principle 3 — Bounded regret promise:** At the moment of recommendation delivery, present the worst-case regret bound: "Even if we're wrong about your preferences, the difference between this recommendation and any alternative is estimated at less than 4% on your own stated criteria." Minimax regret provides the mathematical basis; the UX provides the behavioral signal that makes acting feel safe.

---

## References

1. [Information gain (decision tree) - Wikipedia](https://en.wikipedia.org/wiki/Information_gain_(decision_tree)) - In machine learning, this concept can be used to define a preferred sequence of attributes to invest...

2. [Fast-and-frugal trees - Wikipedia](https://en.wikipedia.org/wiki/Fast-and-frugal_trees)

3. [Naïve, Fast, and Frugal Trees for Classification](https://academic.oup.com/book/5561/chapter/148528252) - Abstract. Naïve, fast, and frugal trees model simple classification strategies that ignore cue depen...

4. [Categorization with Limited Resources: A Family of Simple Heuristics](https://academic.oup.com/book/16560/chapter/173254863) - Abstract. In categorization tasks where resources such as time, information, and computation are lim...

5. [Bayesian Optimal Experimental Design, Integral Probability Metrics ...](https://arxiv.org/html/2604.21849v1) - Traditionally, BOED typically selects designs by maximizing expected information gain (EIG), commonl...

6. [Optimal Experiment Design - Pyro documentation](https://docs.pyro.ai/en/dev/contrib.oed.html) - Bayesian optimal experimental design (BOED) is a powerful methodology for tackling experimental desi...

7. [Recent advances in the Bradley--Terry Model: theory, algorithms, and applications](https://www.arxiv.org/pdf/2601.14727.pdf)

8. [Bayesian paired comparison with the bpcs package](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC9374650/) - This article introduces the bpcs R package (Bayesian Paired Comparison in Stan) and the statistical ...

9. [Leveraging Sparsity for Sample-Efficient Preference Learning](https://www.arxiv.org/pdf/2501.18282v3.pdf)

10. [Real-time Multiattribute Bayesian Preference Elicitation with ...](https://proceedings.mlr.press/v9/guo10b.html) - We introduce an approximate PE framework based on TrueSkill for performing efficient closed-form Bay...

11. [A new method for scoring additive multi‐attribute value models using pairwise rankings of alternatives](https://onlinelibrary.wiley.com/doi/pdf/10.1002/mcda.428) - ## Abstract

We present a new method for determining the point values for additive multi‐attribute v...

12. [Conjoint Analysis: A Comprehensive Guide - 1000minds](https://www.1000minds.com/conjoint-analysis/comprehensive-guide-to-ca) - Conjoint analysis is a survey-based research method for eliciting people's preferences by asking the...

13. [Patients choose PAPRIKA as top preference elicitation method in ...](https://www.1000minds.com/articles/patient-preferences) - New research shows patients rate 1000minds' PAPRIKA method as their preferred approach among five pr...

14. [[PDF] The ELECTRE family (member of the Outranking methods)](http://www1.aegean.gr/environment/energy/mcda/library/The%20ELECTRE%20family.pdf) - If concordance measures the strength of support for the hypothesis α is preferred to b, then the dis...

15. [[PDF] Chapter 1 ELECTRE METHODS](https://orzpics.oss-cn-hangzhou.aliyuncs.com/blog/Literature%20review/ELECTRE%20METHODS.pdf) - Both concordance and discordance indices have to be computed for every pair of actions (a, b) in the...

16. [A New ELECTRE Method Based on Left and Right Score for ... - PMC](https://pmc.ncbi.nlm.nih.gov/articles/PMC10656203/) - The concordance threshold is obtained by averaging the agreement indices (the matrix elements of the...

17. [[PDF] Normalization in TOPSIS-based approaches with data of different ...](https://www.uv.es/liern/LABIPE/Annals.pdf) - Through this normalization procedure, the nature of the transformed normalized data will reflect the...

18. [[PDF] Effect of Normalization on TOPSIS and Fuzzy TOPSIS](https://iscap.us/proceedings/conisar/2021/pdf/5551.pdf) - Normalization is a crucial step of. MCDM methods to transform the measurements in the matrix of alte...

19. [minimax.dvi](http://www.cs.toronto.edu/kr/publications/minimax.pdf)

20. [[PDF] Incremental Utility Elicitation with Minimax Regret Decision Criterion](https://www.ijcai.org/Proceedings/03/Papers/046.pdf)

21. [Incremental Utility Elicitation with the Minimax Regret ...](https://www.cs.toronto.edu/kr/publications/minimax.pdf)

22. [Estimating Part-Worth Utilities - Sawtooth Software](https://sawtoothsoftware.com/help/lighthouse-studio/manual/cva-estimating-part-worth-utilities.html) - CVA employs different statistical methods for estimating the separate part-worths for the attribute ...

23. [Repertory Grids - George Kelly Societykellysociety.org › repgrids](https://kellysociety.org/repgrids.html)

24. [Repertory grid technique - EduTech Wiki](https://edutechwiki.unige.ch/en/repertory_grid_technique) - A) Elicitation of constructs using triads of elements. This is the original method used by Kelly. It...

25. [Creativity in Decision Making with Value-Focused Thinking](https://sloanreview.mit.edu/article/creativity-in-decision-making-with-valuefocused-thinking/) - Value-focused thinking is designed to focus the decision maker on the essential activities that must...

