# Preference Elicitation Decision Engine: Validated Research, Practical System, and Formula Library

**Date:** May 9, 2026  
**Scope reviewed:** prior markdown files (`report.md`, `ai_skill_blueprint.md`, `decision_system_formulas.md`) plus the Perplexity research provided by the user.  
**Purpose:** consolidate the research into an implementable AI-agent framework that moves from decision science → product architecture → formulas → pseudocode.

---

## 1. Executive Summary

The core hypothesis is directionally correct: a large decision space can often be collapsed quickly when the system applies the right decision framework in the right order. The strongest practical architecture is a **layered decision engine** that uses values discovery first, hard constraints second, adaptive preference elicitation third, computational pruning fourth, and final ranking last.

The key correction is that “7–12 questions from 1,000 options to a confident recommendation” is not a universal guarantee. It is feasible under specific conditions: structured option data, sparse user preferences, meaningful hard constraints, and high-quality adaptive question selection. Without those conditions, the system should shift from “few-shot recommendation” to “progressive profiling,” where confidence compounds across sessions.

---

## 2. Validation of Major Claims

### 2.1 Claims that hold up strongly

| Claim | Verdict | Practical implication |
|---|---|---|
| Choice overload is real but context-dependent. | Validated. Choice overload depends on choice complexity, decision difficulty, preference uncertainty, and decision goal. | The system should reduce option exposure early and present only small choice sets. |
| VFT should come before option ranking when the user’s goal is broad. | Validated. Value-Focused Thinking distinguishes fundamental objectives from means objectives and prevents double-counting. | Start with “what are you trying to achieve?” before “which option is best?” |
| RGT is useful when the feature space is unknown. | Validated. Repertory Grid Technique uses triadic elicitation to surface the user’s own constructs. | Use LLM-guided construct discovery before BOED when the user cannot name the relevant criteria. |
| Fast-and-frugal / veto trees are appropriate for hard constraints. | Validated. Fast-and-frugal trees use simple sequential cues and can exit early. | Use hard filters before adaptive preference modeling. |
| Bayesian preference elicitation is a strong core engine. | Validated. Real-time Bayesian PE and BOED-style methods support active querying, low cognitive load, and uncertainty management. | Use pairwise questions selected by expected information gain or value of information. |
| LLM-only preference inference is insufficient. | Validated. Recent preference-following benchmarks show current LLMs struggle to infer and adhere to user preferences over long conversations. | Use the LLM as an interface and feature extractor, not as the only preference model. |
| ELECTRE/TOPSIS are useful late-stage deterministic methods. | Validated. ELECTRE is suited for outranking/pruning; TOPSIS is suited for final ranking against an ideal profile. | Run them after the candidate set and preference weights are already structured. |
| Minimax regret is useful when preferences are incomplete. | Validated. Regret-based elicitation supports robust decisions under incomplete utility information. | Use for high-stakes, time-constrained, or confidence-threshold recommendations. |

### 2.2 Claims that need qualification

| Claim | Correction | Why it matters |
|---|---|---|
| “7–12 questions can collapse 1,000 options.” | True only with structured data, sparse preferences, and strong filters. The information-theoretic minimum is not the same as human preference elicitation in messy domains. | The product should show confidence, not promise universal question counts. |
| “Fast-and-frugal trees can eliminate 90%+ with 1–2 questions.” | Plausible in domains with strong constraints; not guaranteed. | Avoid hardcoded claims. Report actual option-count reduction in-session. |
| “Sparse BOED + veto-first can converge in 3–5 questions.” | This is a promising design hypothesis, not established product performance. Preference sparsity theory supports reduced sample complexity, but integration with BOED/veto pipelines requires validation. | Treat as an R&D track and test empirically. |
| “TTM solves large-scale pairwise elicitation.” | TTM is promising and reduces comparisons, but appears as a recent preprint. | Use carefully; do not rely on it as the production default until tested. |
| “ELECTRE eliminates dominated options automatically.” | ELECTRE requires threshold choices and good scoring data. Bad thresholds can over-prune. | Thresholds should be configurable and auditable. |
| “TOPSIS gives the best option.” | TOPSIS gives a ranking under a specific normalization, scoring matrix, and weights. | Present as “best under your stated criteria,” not absolute truth. |
| “Life decisions can be optimized.” | Values-dominant decisions should not be reduced to false-precision ranking. | Return a structured values map, not a prescriptive answer. |

---

## 3. Recommended System: Preference Elicitation Decision Engine (PEDE)

PEDE is a modular AI-agent framework that classifies the decision, chooses a pipeline, asks adaptive questions, prunes options, ranks shortlists, and produces transparent explanations.

### 3.1 Core design rule

**Do not use one decision framework everywhere.** Route each decision through the lightest rigorous pipeline that fits the problem structure.

### 3.2 Five MECE decision types

| Type | Definition | Examples | Default pipeline |
|---|---|---|---|
| **SED — Structured Enumerable Decision** | Options are finite and describable by known attributes. | House, car, vendor, job offer. | Veto filter → Bayesian/PAPRIKA elicitation → ELECTRE → TOPSIS. |
| **GDD — Generative Design Decision** | The “option” must be built from components. | App concept, product roadmap, AI workflow. | VFT → RGT if needed → sparse BOED/conjoint → constraint satisfaction. |
| **VDD — Values-Dominant Decision** | Decision is mainly about values, identity, life direction, or irreversible meaning. | Should I have kids? Should I leave my job? | VFT → RGT → constraints → minimax-regret reflection; no final ranking. |
| **EDD — Exploratory Discovery Decision** | User does not know the option space or feature space. | Where should I start using AI? What academic system fits me? | RGT → VFT → option generation → BOED → progressive profiling. |
| **TCLD — Time-Critical / Low-Data Decision** | Decision must be made quickly with incomplete information. | Incident response, emergency vendor, urgent operational choice. | Fast-and-frugal tree → minimax regret → optional one-shot ranking. |

### 3.3 Secondary flags that modify the pipeline

| Flag | Meaning | System effect |
|---|---|---|
| **HC** | High consequence / low reversibility. | Increase confidence threshold; add minimax regret guard. |
| **SP** | Sparse preferences likely. | Use sparse prior and avoid over-asking on weak dimensions. |
| **GD** | Group decision. | Add stakeholder-level weights and aggregation. |
| **MS** | Multi-session decision. | Store preference graph and update over time. |
| **UD** | Unstructured source documents. | Build an option-scoring matrix before elicitation. |
| **NF** | No fixed option set. | Use generative design and constraint satisfaction instead of ranking. |

---

## 4. System Architecture

### 4.1 Layered pipeline

1. **Decision classifier**  
   Classifies the user’s request into SED, GDD, VDD, EDD, or TCLD and identifies modifiers.

2. **Values and construct discovery**  
   Uses VFT and RGT to determine what the user means by success and which dimensions matter.

3. **Hard-constraint filter**  
   Applies veto rules and non-negotiables to remove impossible or unacceptable branches.

4. **Feature/criteria model builder**  
   Converts values, constructs, and domain ontology into a structured criterion set.

5. **Adaptive elicitation engine**  
   Chooses pairwise questions using BOED, value of information, PAPRIKA-style tradeoffs, or TTM-style reduced comparisons.

6. **Candidate pruning engine**  
   Uses dominance, ELECTRE, Pareto filtering, and/or constraint satisfaction to reduce alternatives.

7. **Ranking engine**  
   Applies TOPSIS, weighted scoring, or a domain-specific ranking method to a small shortlist.

8. **Regret/confidence guard**  
   Checks whether confidence is high enough to act or whether another question is needed.

9. **Explanation generator**  
   Produces a transparent explanation grounded in the user’s stated values, constraints, and tradeoffs.

10. **Progressive preference graph**  
   Stores conditional preferences and reduces future question burden.

### 4.2 Deterministic vs. flexible components

| Component | Deterministic | Flexible / AI-mediated |
|---|---|---|
| Decision taxonomy | Rule-based classification with confidence score. | LLM helps parse ambiguous natural language. |
| Values extraction | Ontology mapping to objectives. | LLM asks follow-ups and interprets narratives. |
| Hard constraints | Boolean/range filters. | Agent decides which constraints to ask first. |
| Preference elicitation | Posterior update, pairwise likelihood, EIG. | LLM phrases the question naturally. |
| Pruning | Dominance, ELECTRE, Pareto, constraint satisfaction. | Threshold tuning may be user/domain-specific. |
| Ranking | WSM, TOPSIS, utility maximization. | Narrative explanation and tie-break questions. |
| Confidence | Entropy reduction, regret bound, posterior margin. | UX representation of uncertainty. |
| Memory | Stored preference graph, schema validation. | Agent decides when old preferences are stale. |

---

## 5. Data Model and Common Inputs/Outputs

### 5.1 Core input objects

```json
{
  "decision_request": {
    "user_goal": "Where should I buy a house?",
    "domain": "real_estate",
    "urgency": "medium",
    "reversibility": "low",
    "stakeholders": ["user", "partner"],
    "option_set_available": true
  },
  "alternatives": [
    {
      "id": "house_001",
      "attributes": {
        "price": 950000,
        "commute_minutes": 28,
        "school_rating": 8,
        "bedrooms": 4,
        "walkability": 71
      }
    }
  ],
  "criteria_schema": [
    {
      "id": "commute_minutes",
      "type": "cost",
      "scale": "continuous",
      "required": false
    }
  ],
  "known_constraints": {
    "price": {"max": 1100000},
    "bedrooms": {"min": 3}
  },
  "prior_profile": null
}
```

### 5.2 Core output object

```json
{
  "decision_type": "SED",
  "questions_asked": 9,
  "options_before": 1000,
  "options_after_constraints": 83,
  "options_after_pruning": 11,
  "recommendations": [
    {
      "id": "house_042",
      "rank": 1,
      "score": 0.87,
      "confidence": 0.91,
      "top_reasons": [
        "Best commute fit among finalists",
        "Strong school rating",
        "Within budget"
      ],
      "tradeoffs": [
        "Older construction than ideal",
        "Smaller lot than second-ranked option"
      ]
    }
  ],
  "preference_model": {
    "weights": {
      "commute_minutes": 0.34,
      "school_rating": 0.25,
      "price": 0.21,
      "walkability": 0.12,
      "lot_size": 0.08
    },
    "uncertainty": 0.09
  },
  "regret_bound": 0.04,
  "explanation": "Recommendation is best under your stated priorities and remains robust under small weight changes."
}
```

---

## 6. Formula Library

### 6.1 Normalize criteria

For benefit criteria, higher is better:

\[
\tilde{x}_{ij} = \frac{x_{ij} - \min_i x_{ij}}{\max_i x_{ij} - \min_i x_{ij}}
\]

For cost criteria, lower is better:

\[
\tilde{x}_{ij} = \frac{\max_i x_{ij} - x_{ij}}{\max_i x_{ij} - \min_i x_{ij}}
\]

Use this for WSM/TOPSIS when attributes use different scales. Do not normalize hard constraints; filter those first.

### 6.2 Weighted Sum Method

\[
S_i = \sum_{j=1}^{n} w_j \tilde{x}_{ij}
\]

Use when preferences are compensatory and explanation clarity matters more than mathematical sophistication.

### 6.3 TOPSIS

Vector normalization:

\[
r_{ij} = \frac{x_{ij}}{\sqrt{\sum_{k=1}^{m} x_{kj}^2}}
\]

Weighted normalized score:

\[
v_{ij} = w_j r_{ij}
\]

Positive and negative ideal:

\[
A^+ = \{v_1^+, ..., v_n^+\}, \quad A^- = \{v_1^-, ..., v_n^-\}
\]

Distances:

\[
D_i^+ = \sqrt{\sum_{j=1}^{n}(v_{ij} - v_j^+)^2}
\]

\[
D_i^- = \sqrt{\sum_{j=1}^{n}(v_{ij} - v_j^-)^2}
\]

Closeness coefficient:

\[
C_i = \frac{D_i^-}{D_i^+ + D_i^-}
\]

Rank by descending \(C_i\). Use after filtering; TOPSIS is not a first-stage pruning method.

### 6.4 ELECTRE-style outranking

Concordance set:

\[
J_{ab} = \{j : x_{aj} \geq x_{bj}\}
\]

Concordance index:

\[
C(a,b)=\sum_{j \in J_{ab}} w_j
\]

Discordance index:

\[
D(a,b)=\max_{j \in K_{ab}} \frac{x_{bj}-x_{aj}}{R_j}
\]

where \(K_{ab}=\{j : x_{aj}<x_{bj}\}\) and \(R_j\) is the range of criterion \(j\).

Outranking rule:

\[
a \succ b \quad \text{if} \quad C(a,b) \geq c^* \quad \text{and} \quad D(a,b) \leq d^*
\]

Use when veto logic matters or when poor performance on one criterion should not be fully offset by another.

### 6.5 AHP weight derivation

Pairwise comparison matrix:

\[
A = [a_{ij}], \quad a_{ji}=1/a_{ij}, \quad a_{ii}=1
\]

Principal eigenvector:

\[
A w = \lambda_{max} w
\]

Normalize:

\[
\sum_j w_j = 1
\]

Consistency index:

\[
CI = \frac{\lambda_{max} - n}{n-1}
\]

Consistency ratio:

\[
CR = \frac{CI}{RI}
\]

Use AHP for group weighting or stakeholder alignment. Avoid full AHP over hundreds of alternatives.

### 6.6 Pairwise preference model: Bradley–Terry / logistic utility

Feature difference between two alternatives:

\[
\Delta f = f_A - f_B
\]

Preference probability:

\[
P(A \succ B | \theta)=\sigma(\theta^T \Delta f)=\frac{1}{1+e^{-\theta^T \Delta f}}
\]

Posterior after responses:

\[
p(\theta | y_{1:t}) \propto p(\theta)\prod_{k=1}^{t} P(y_k | \theta, q_k)
\]

Use as the statistical backbone for pairwise elicitation.

### 6.7 Bayesian expected information gain

\[
EIG(q)=\mathbb{E}_{p(y|q)}\left[H[p(\theta)]-H[p(\theta|y,q)]\right]
\]

Decision-aware variant:

\[
EIG(q)=H[p(o^*)]-\mathbb{E}_{p(y|q)}H[p(o^*|y,q)]
\]

Use the decision-aware version when the goal is not to learn preferences generally but to identify the best option quickly.

### 6.8 Sparse preference prior

Laplace prior:

\[
p(\theta_i) \propto e^{-\lambda |\theta_i|}
\]

Sparse random utility sample complexity claim:

\[
\Theta(d/n) \rightarrow \Theta((k/n)\log(d/k))
\]

Use when most users likely care about a small subset of available dimensions. Validate per domain.

### 6.9 Minimax regret

Utility of option \(x\) under preference vector \(u\):

\[
U(x,u)=u^T f_x
\]

Regret:

\[
Regret(x,u)=\max_{x'\in X} U(x',u)-U(x,u)
\]

Maximum regret:

\[
MR(x)=\max_{u\in F} Regret(x,u)
\]

Minimax regret recommendation:

\[
x^*=\arg\min_x MR(x)
\]

Use as a confidence-to-act guard when elicitation is incomplete.

### 6.10 Confidence score

Entropy reduction confidence:

\[
Confidence = 1 - \frac{H[p(\theta|answers)]}{H[p(\theta)]}
\]

Decision posterior confidence:

\[
Confidence = \max_i P(o_i \text{ is optimal})
\]

Regret confidence:

\[
Confidence = 1 - \frac{MR(x^*)}{MR_{baseline}}
\]

Use a composite confidence score, not one metric, for high-stakes decisions.

---

## 7. Pseudocode

### 7.1 Master router

```python
def route_decision(request, options=None, profile=None):
    decision_type = classify_decision_type(request)
    flags = detect_flags(request, options, profile)

    if decision_type in ["EDD", "GDD", "VDD"] or flags["unknown_feature_space"]:
        values = run_vft(request)
        constructs = run_rgt_if_needed(request, values)
        criteria = build_criteria_schema(values, constructs)
    else:
        criteria = load_domain_criteria(request.domain)

    constraints = elicit_hard_constraints(request, criteria, profile)

    if options is not None:
        candidates = apply_veto_filter(options, constraints)
    else:
        candidates = generate_candidate_designs(criteria, constraints)

    if decision_type == "VDD":
        return values_dominant_output(values, constructs, constraints)

    if len(candidates) <= 3:
        return explain_small_set(candidates, criteria, constraints)

    preference_model = run_adaptive_elicitation(
        candidates=candidates,
        criteria=criteria,
        method=select_elicitation_method(decision_type, flags),
        profile=profile
    )

    pruned = prune_candidates(candidates, preference_model, flags)

    ranked = rank_candidates(pruned, preference_model, method=select_ranking_method(flags))

    confidence = compute_confidence(ranked, preference_model)

    while confidence < required_confidence(flags):
        q = select_best_question(candidates, preference_model, objective="decision_eig")
        response = ask_user(q)
        preference_model = update_preference_model(preference_model, q, response)
        pruned = prune_candidates(candidates, preference_model, flags)
        ranked = rank_candidates(pruned, preference_model)
        confidence = compute_confidence(ranked, preference_model)

    explanation = generate_explanation(ranked, preference_model, constraints, values)
    updated_profile = update_progressive_preference_graph(profile, preference_model, request)

    return {
        "ranked_recommendations": ranked,
        "confidence": confidence,
        "explanation": explanation,
        "updated_profile": updated_profile
    }
```

### 7.2 Adaptive question selection

```python
def select_best_question(candidates, preference_model, objective="decision_eig"):
    question_pool = generate_candidate_pairwise_questions(candidates, preference_model)

    best_q = None
    best_score = -float("inf")

    for q in question_pool:
        possible_answers = enumerate_answers(q)
        expected_entropy = 0

        for answer in possible_answers:
            p_answer = predict_answer_probability(q, answer, preference_model)
            posterior = simulate_update(preference_model, q, answer)

            if objective == "decision_eig":
                entropy = entropy_over_best_option(posterior, candidates)
            else:
                entropy = entropy_over_weights(posterior)

            expected_entropy += p_answer * entropy

        current_entropy = entropy_over_best_option(preference_model, candidates)
        eig = current_entropy - expected_entropy

        if eig > best_score:
            best_score = eig
            best_q = q

    return best_q
```

### 7.3 Veto filter

```python
def apply_veto_filter(options, constraints):
    survivors = []
    eliminated = []

    for option in options:
        failed = False
        for constraint in constraints:
            if violates(option, constraint):
                eliminated.append((option, constraint))
                failed = True
                break
        if not failed:
            survivors.append(option)

    return survivors
```

### 7.4 ELECTRE pruning

```python
def electre_prune(candidates, weights, concordance_threshold=0.70, discordance_threshold=0.30):
    dominated = set()

    for a in candidates:
        for b in candidates:
            if a == b:
                continue

            c_ab = concordance(a, b, weights)
            d_ab = discordance(a, b)
            c_ba = concordance(b, a, weights)
            d_ba = discordance(b, a)

            b_outranks_a = (c_ba >= concordance_threshold and d_ba <= discordance_threshold)
            a_outranks_b = (c_ab >= concordance_threshold and d_ab <= discordance_threshold)

            if b_outranks_a and not a_outranks_b:
                dominated.add(a.id)

    return [x for x in candidates if x.id not in dominated]
```

### 7.5 TOPSIS ranking

```python
def topsis_rank(candidates, weights, criteria_schema):
    X = build_matrix(candidates, criteria_schema)
    R = normalize_vector_length(X)
    V = R * weights

    ideal = []
    anti_ideal = []

    for j, criterion in enumerate(criteria_schema):
        if criterion["type"] == "benefit":
            ideal.append(max(V[:, j]))
            anti_ideal.append(min(V[:, j]))
        else:
            ideal.append(min(V[:, j]))
            anti_ideal.append(max(V[:, j]))

    scores = []
    for i, option in enumerate(candidates):
        d_pos = euclidean_distance(V[i], ideal)
        d_neg = euclidean_distance(V[i], anti_ideal)
        c = d_neg / (d_pos + d_neg)
        scores.append((option, c))

    return sorted(scores, key=lambda x: x[1], reverse=True)
```

---

## 8. Practical Use-Case Configurations

### 8.1 House selection

**Type:** SED + HC + SP  
**Pipeline:** Veto filter → sparse BOED → ELECTRE → TOPSIS → regret guard

**Inputs:** listings, price, neighborhood, commute, school rating, size, condition, HOA, climate risk.  
**Hard constraints:** budget, location, bedrooms, commute maximum.  
**Adaptive questions:** space vs. commute, newness vs. neighborhood, walkability vs. lot size.  
**Output:** 5–10 property shortlist with “why” explanations and tradeoffs.

**Formula changes:** cost criteria need reverse normalization. Location may need geospatial distance. School or neighborhood scores should be auditable.

### 8.2 App design to make people happy

**Type:** GDD + unknown feature space  
**Pipeline:** VFT → RGT → feature-space build → BOED/conjoint → constraint satisfaction

**Inputs:** target user, desired emotional outcome, budget, platform, development timeline.  
**Hard constraints:** platform, budget, timeline, technical stack.  
**Adaptive questions:** connection vs. calm, daily micro-interactions vs. rich weekly experiences, private reflection vs. social accountability.  
**Output:** design brief, MVP feature set, build sequence.

**Formula changes:** alternatives are generated bundles, not fixed catalog items. Use constraint satisfaction plus utility-per-build-cost instead of only TOPSIS.

### 8.3 “Should I have kids?”

**Type:** VDD + HC  
**Pipeline:** VFT → RGT → constraints → regret-framed reflection

**Inputs:** values, partner alignment, health constraints, financial/security constraints, life goals.  
**Output:** values map, unresolved uncertainties, decision tensions, next conversations to have.

**Formula changes:** avoid ranking. Do not compute a fake utility score for “have kids vs. not have kids.” Use qualitative minimax-regret prompts and values clarification.

### 8.4 Academic system selection

**Type:** SED or EDD depending on user clarity  
**Pipeline:** RGT if unclear → VFT → constraints → BOED → TOPSIS

**Inputs:** learning style, field, budget, location, credential needs, social environment, research/teaching preference.  
**Output:** ranked academic systems/programs plus explanation.

**Formula changes:** qualitative criteria require ordinal encoding. For groups (student + family), use group weighting.

### 8.5 Where to start using AI

**Type:** EDD/GDD hybrid  
**Pipeline:** RGT → VFT → candidate AI use-case generation → sparse BOED → feasibility scoring

**Inputs:** role, workflows, pain points, data access, risk tolerance, team maturity.  
**Output:** first AI use case, pilot scope, implementation path, risk controls.

**Formula changes:** use utility × feasibility × risk-adjusted score. Time-to-impact may dominate.

---

## 9. Evaluation Plan

### 9.1 Offline evaluation

Use historical or simulated users to test:

- question count to convergence;
- top-1/top-3 accuracy;
- regret bound;
- calibration of confidence score;
- option-reduction efficiency;
- sensitivity to weights and thresholds.

### 9.2 Human evaluation

Measure:

- perceived effort;
- decision confidence;
- satisfaction with explanation;
- consistency of preferences across time;
- whether users would act on the recommendation.

### 9.3 System reliability tests

- missing data stress test;
- hallucinated feature extraction test;
- adversarial inconsistent answers;
- threshold over-pruning test;
- stale preference memory test;
- group disagreement test.

---

## 10. Implementation Roadmap

### Phase 1 — Deterministic MVP

Build:

- decision taxonomy router;
- hard constraint filters;
- WSM/TOPSIS ranking;
- explanation generator;
- basic profile storage.

Do not build full BOED yet. This phase proves product utility and data model viability.

### Phase 2 — Adaptive elicitation

Add:

- pairwise comparison UI;
- Bradley–Terry preference model;
- EIG/VOI question selection;
- PAPRIKA-style two-criterion tradeoff questions;
- confidence scoring.

### Phase 3 — Robust pruning and regret

Add:

- ELECTRE/Pareto pruning;
- minimax regret guard;
- sensitivity analysis;
- threshold auditing.

### Phase 4 — Unknown feature spaces

Add:

- LLM-as-RGT operator;
- VFT objective extractor;
- ontology mapping;
- document-grounded option-scoring matrix.

### Phase 5 — Progressive preference graph

Add:

- conditional preference DAG;
- session-to-session memory;
- preference drift detection;
- privacy controls and user-editable preferences.

---

## 11. Key Risks and Controls

| Risk | Control |
|---|---|
| False precision in values-heavy decisions | Use VDD routing and return reflection outputs, not rankings. |
| LLM hallucinated criteria | Ground criteria in a domain ontology or source documents; show editable criteria. |
| Over-pruning by hard filters | Display eliminated constraint categories and allow undo. |
| Bad weights from noisy responses | Use posterior uncertainty, consistency checks, and optional re-asking. |
| Stale preferences | Expire preference memory and ask refresh questions. |
| Hidden bias in option data | Provide source transparency and audit attribute scoring. |
| Too much cognitive load | Use pairwise questions, one question at a time, progress meter. |
| Over-reliance on one method | Use method routing; no single algorithm for all decision types. |

---

## 12. Final Recommendation

The best practical system is not “AHP inside a chatbot.” It is a **routed, layered decision engine**:

1. classify the decision type;
2. discover values and constructs when the problem is broad;
3. apply veto filters before preference modeling;
4. use pairwise adaptive elicitation to estimate weights;
5. prune computationally with ELECTRE/Pareto methods;
6. rank final candidates with TOPSIS/WSM or domain-specific scoring;
7. gate the answer with confidence and regret metrics;
8. persist preferences as a conditional graph for future sessions.

This structure is broad enough for an AI agent to customize across houses, app design, academic systems, AI adoption, vendor selection, career choices, and other complex decisions while avoiding the two major failure modes: overwhelming the user with too many options, and pretending a broad life decision is a simple optimization problem.

---

## 13. Source Notes

The report’s architecture is grounded in: Value-Focused Thinking; Repertory Grid Technique; fast-and-frugal trees; choice overload research; Bayesian preference elicitation; BOED/OPEN; sparse preference learning; PAPRIKA; AHP/AHP-express/TTM; ELECTRE; TOPSIS; minimax regret; PrefEval; and Decisive. The strongest sources are peer-reviewed or official academic pages. Recent claims from 2025–2026, especially TTM, sparse preference learning, and Decisive, should be treated as promising but still requiring product validation before production reliance.

---

## 14. Review of Prior Markdown Files

### 14.1 `report.md`

**What is sound:** The file correctly identifies the major families of methods: DOE, MCDA, AHP/PAPRIKA, WSM/TOPSIS/ELECTRE/DEA, MAUT, heuristic elimination, branch-and-bound, dynamic programming, MCTS, Bayesian preference elicitation, preference-based learning, and fast-and-frugal heuristics.

**What to improve:** The report should more clearly separate **first-stage pruning**, **preference elicitation**, **dominance elimination**, and **final ranking**. It currently lists frameworks, but the practical system needs method routing. It should also avoid implying that all methods are interchangeable. For example, TOPSIS is a final-ranking method, not a discovery method; ELECTRE is pruning/outranking, not a confidence model; VFT/RGT are feature-space discovery methods, not scoring engines.

### 14.2 `ai_skill_blueprint.md`

**What is sound:** The six-stage architecture is broadly correct: values extraction → constraints → adaptive elicitation → computational elimination → ranking → progressive profiling.

**What to improve:** Add a decision-type router. Without routing, the system risks applying ranking to values-dominant decisions, or applying values elicitation where a simple structured catalog decision is sufficient. Add confidence gating, regret bounds, threshold auditability, and a “do not rank” branch for VDD decisions.

### 14.3 `decision_system_formulas.md`

**What is sound:** WSM, TOPSIS, ELECTRE, AHP, entropy/EIG, and minimax regret are the right formula families.

**What to improve:** Add formula-selection rules. The same formula should not be used across all use cases. For example:

- WSM is good for simple compensatory scoring.
- TOPSIS is good for final ranking after normalization.
- ELECTRE is good when vetoes and non-compensatory preferences matter.
- BOED/Bradley–Terry are better for adaptive elicitation.
- Minimax regret is a guardrail when the system has incomplete preferences.
- VFT/RGT should not be reduced to scoring formulas; they structure the decision before scoring.

---

## 15. Reference Map for Implementation

The following sources were used to validate the conceptual and technical backbone:

1. Chernev, Böckenholt & Goodman, “Choice overload: A conceptual review and meta-analysis.” Journal of Consumer Psychology, 2015. Validates context-dependent choice overload and its moderators.  
   https://www.sciencedirect.com/science/article/abs/pii/S1057740814000916

2. Keeney, “Value-Focused Thinking: The Foundation for Decision Quality.” Validates fundamental vs. means objectives and values-first framing.  
   https://jpt.spe.org/value-focused-thinking-foundation-decision-quality

3. Repertory Grid Technique overview and triadic elicitation workflow. Validates construct discovery via triads.  
   https://edutechwiki.unige.ch/en/repertory_grid_technique

4. Martignon, Erickson & Viale, “Transparent, simple and robust fast-and-frugal trees and their construction.” Frontiers in Human Dynamics, 2022. Validates fast-and-frugal tree structure and early exit logic.  
   https://www.frontiersin.org/journals/human-dynamics/articles/10.3389/fhumd.2022.790033/full

5. Guo & Sanner, “Real-time Multiattribute Bayesian Preference Elicitation with Pairwise Comparison Queries.” AISTATS/PMLR, 2010. Validates real-time, low-cognitive-load, Bayesian pairwise PE.  
   https://proceedings.mlr.press/v9/guo10b.html

6. Handa et al., “Bayesian Preference Elicitation with Language Models.” arXiv 2024. Validates the LLM + BOED architecture used in OPEN.  
   https://arxiv.org/abs/2403.05534

7. Yao, He & Gastpar, “Leveraging Sparsity for Sample-Efficient Preference Learning.” arXiv 2025. Supports sparse preference learning rate reductions.  
   https://arxiv.org/abs/2501.18282

8. Jain et al., “Decisive: Guiding User Decisions with Optimal Preference Elicitation from Unstructured Documents.” arXiv 2026 / ACL 2026. Supports option-scoring matrix + Bayesian preference inference from unstructured documents.  
   https://arxiv.org/abs/2604.18122

9. 1000minds, PAPRIKA method. Validates adaptive pairwise tradeoff questions, transitivity-based question elimination, and additive value-function construction.  
   https://www.1000minds.com/paprika

10. 1000minds, MCDA overview. Validates PAPRIKA, pairwise ranking, linear programming weight inference, and MCDA component framing.  
   https://www.1000minds.com/decision-making/what-is-mcdm-mcda

11. Leal, “AHP-express: A simplified version of the analytical hierarchy process method.” MethodsX, 2020. Validates n−1 comparison reduction.  
   https://www.sciencedirect.com/science/article/pii/S2215016119303243

12. García-Zamora, Labella & Figueira, “The Tournament Tree Method for preference elicitation in Multi-criteria decision-making.” arXiv 2025. Promising but should be treated as preprint-stage.  
   https://arxiv.org/abs/2510.08197

13. Daugavietis et al., “A Comparison of Multi-Criteria Decision Analysis Methods...” Energies, 2022. Validates WSM, TOPSIS, ELECTRE, PROMETHEE and DEA distinctions.  
   https://www.mdpi.com/1996-1073/15/7/2411

14. Mattos & Ramos, “Bayesian paired comparison with the bpcs package.” Behavior Research Methods, 2022. Validates Bayesian Bradley–Terry paired comparison modeling.  
   https://pmc.ncbi.nlm.nih.gov/articles/PMC9374650/

15. Wang & Boutilier, “Incremental Utility Elicitation with the Minimax Regret Decision Criterion.” IJCAI, 2003. Validates minimax-regret elicitation and stopping logic.  
   https://www.cs.toronto.edu/~cebly/Papers/minimax-abs.html

16. UK Government Green Book supplementary guidance on MCDA. Validates robust MCDA steps for criteria identification, weighting, scoring, and review.  
   https://www.gov.uk/government/publications/green-book-supplementary-guidance-multi-criteria-decision-analysis/use-of-multi-criteria-decision-analysis-in-options-appraisal-of-economic-cases

17. Zhao et al., “Do LLMs Recognize Your Preferences?” ICLR 2025. Validates that LLM-only preference memory and preference-following are insufficient without structured preference systems.  
   https://proceedings.iclr.cc/paper_files/paper/2025/hash/28a46044775d97a4efcbcf14e7f13209-Abstract-Conference.html
