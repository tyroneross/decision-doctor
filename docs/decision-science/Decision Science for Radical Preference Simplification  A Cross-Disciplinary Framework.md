# Decision Science for Radical Preference Simplification: A Cross-Disciplinary Framework

## Executive Summary

Your hypothesis is correct and well-supported by a rich body of literature across operations research, information theory, machine learning, and psychology: broad, complex decisions can be rapidly narrowed to a hyper-personalized choice set through adaptive, sequential question strategies. The core insight is that most large decision spaces are *sparse* — only a small number of dimensions actually drive individual preference — and the right question sequence, selected for maximum information gain, can eliminate entire branches of a 1,000-option decision tree in a handful of exchanges. This document maps the full landscape of relevant frameworks, ranks them by speed and accuracy tradeoffs, and proposes a novel synthesized architecture.

***

## The Core Problem: Why 1,000 Options Collapse to a Few

The choice overload paradox, first named by Alvin Toffler and extensively studied in behavioral economics, establishes that beyond a threshold, expanding a choice set *reduces* decision quality and satisfaction rather than improving it. A meta-analysis of 63 experimental conditions confirmed that large choice sets produce adverse consequences including decreased motivation to choose and lower satisfaction with final selections. Cognitively, working memory can hold roughly four chunks of information simultaneously, and when cognitive load exceeds capacity, decision-making degrades from satisficing to near-random selection.[^1][^2][^3]

The implication: any decision support system must aggressively eliminate options *before* presenting them to a user, not after. The frameworks below accomplish this through different mechanisms, with vastly different efficiency profiles.

***

## Part I: Formal Decision Science Frameworks

### Analytic Hierarchy Process (AHP) and Its Extensions

**What it does:** AHP, developed by Saaty, structures decisions as a hierarchy — goal → criteria → alternatives — and elicits pairwise comparisons to derive numerical weights for each element, enabling diverse and incommensurable elements to be compared rationally. The core mechanism requires \( \frac{n(n-1)}{2} \) pairwise comparisons for \( n \) alternatives — 499,500 comparisons for 1,000 options, making it computationally and cognitively impractical at scale.[^4]

**Extensions for large spaces:**
- **AHP-express** reduces comparisons to \( n-1 \) by using a simplified sequential comparison formula, preserving most accuracy at a fraction of the cognitive cost.[^5]
- **Clusters and Pivots AHP** groups alternatives into clusters with a shared pivot element, enabling hierarchical elimination without pairwise comparison of every pair. This approach also addresses AHP's notorious rank reversal problem when adding alternatives.[^6]
- **Nominal Group Technique + AHP**: Pre-filter insignificant criteria before entering AHP, reducing the pairwise matrix size substantially upfront.[^7]
- **Tournament Tree Method (TTM)** (2025): Requires only \( m-1 \) comparisons to produce a complete, reciprocal, and consistent comparison matrix — reducing dimensionality from \( \frac{m(m-1)}{2} \) to \( m \) parameters.[^8]

**Decision type fit:** Strategic, multi-stakeholder decisions (vendor selection, investment prioritization, policy choices) where criteria are known upfront. Strong in organizational contexts.

**Speed:** Slow at scale without extensions. AHP-express or TTM bring it to a reasonable 10–15 question range for 10–15 criteria.

**Accuracy:** High when criteria are correctly defined. Susceptible to inconsistency and rank reversal without corrections.

***

### ELECTRE (ELimination Et Choix Traduisant la REalité)

**What it does:** ELECTRE uses outranking logic — rather than aggregating scores, it asks "does alternative A outrank B across concordant criteria, while not being significantly worse on discordant ones?" This eliminates dominated alternatives through successive filtering rather than full optimization. Unlike utility-maximizing methods, ELECTRE accepts incomparability between alternatives, which is psychologically realistic.[^9]

**Variants:**
- **ELECTRE I**: Binary outranking — suitable for selecting a small subset from a large set.
- **ELECTRE III**: Adds preference thresholds, indifference thresholds, and veto thresholds, accommodating real-world uncertainty in criteria performance.[^10]
- **AHP + ELECTRE hybrid**: Uses AHP for criterion weighting then ELECTRE for outranking comparisons, combining the strengths of both.[^11]

**Decision type fit:** Situations with many conflicting criteria and a need to *eliminate* clearly inferior options rather than rank all of them. Strong for "triage" phases — collapsing 1,000 to 20.

**Speed:** Moderate. Can be run computationally against a pre-scored database without user interaction for the elimination phase.

**Accuracy:** High for elimination; less precise for final ranking. Works best when combined with a second-stage method.

***

### TOPSIS (Technique for Order Preference by Similarity to Ideal Solution)

**What it does:** TOPSIS ranks alternatives by their geometric distance from a positive ideal solution (best on all criteria) and negative ideal solution (worst on all), computing a relative closeness score. It requires a complete performance matrix for all alternatives — necessitating that alternatives be pre-scored against criteria before user interaction.[^12]

**Decision type fit:** Best for final-stage ranking of a shortlisted set (e.g., 5–15 options), not initial pruning of large spaces. Effective when quantitative performance data exists for alternatives (house prices, specs, features).

**Speed:** Near-instantaneous once criteria weights are known and alternatives are pre-scored.

**Accuracy:** High for well-defined, quantitative criteria. Sensitive to criteria weight elicitation accuracy.

***

### MCDA / Value-Focused Thinking (VFT)

Ralph Keeney's **Value-Focused Thinking** represents a fundamental reframing: most decision support starts with alternatives and asks "which is best?" VFT reverses this — start with *values*, articulate *fundamental objectives*, then create alternatives that satisfy them. This is directly relevant to the use cases raised: "What app would make me happy?" is actually asking for value articulation first. VFT distinguishes:[^13][^14]

- **Fundamental objectives**: Ends the decision-maker actually cares about (e.g., "meaningful social connection")
- **Means objectives**: Levers to achieve those ends (e.g., "daily reminder feature", "accountability partner")

Applying VFT before any algorithmic method prunes the decision space semantically before it is enumerated combinatorially. For your hypothesis, this means the first 2–3 questions in any preference elicitation flow should surface fundamental values, which eliminates entire branches before options are even presented.[^15]

***

## Part II: Information Theory and Machine Learning Methods

### Information Gain / Entropy-Based Question Selection

The foundational mechanism behind radically efficient preference elicitation is information gain — the reduction in entropy \( H \) achieved by learning the state of an attribute:[^16]

\[ IG(T, a) = H(T) - H(T|a) \]

At each decision point, the question asked should maximize the expected reduction in uncertainty about which option the user will ultimately select. This is the "Twenty Questions" framework formalized: binary entropy is minimized fastest when each question splits the remaining possibility space as evenly as possible. For a 1,000-option space, 10 perfectly balanced yes/no questions can theoretically identify any single option (since \( 2^{10} = 1024 \)). In practice, user preferences are never perfectly binary, but the principle holds: **a well-sequenced 7–12 question protocol can eliminate 95%+ of options**.[^17]

Decision tree learning algorithms (ID3, C4.5, CART) formalize this by selecting attributes at each node that maximize information gain, effectively building the optimal question sequence automatically from training data. Adaptive variants with time-weighted entropy further improve this by weighting recent user behavior more heavily, capturing preference drift over time.[^18][^19]

***

### Bayesian Optimal Experimental Design (BOED)

BOED is the gold standard for adaptive preference elicitation, selecting each next question to maximize **Expected Information Gain (EIG)**:[^20]

\[ \text{EIG}(d) = \mathbb{E}_{p(y|d)}[H[p(\theta)] - H[p(\theta|y, d)]] \]

Where \( \theta \) represents the user's latent preference vector and \( d \) is the experimental design (question). At each step, BOED maintains a Bayesian posterior over user preferences and selects the question that will most reduce that uncertainty on average across all possible user responses.[^21][^22]

Key BOED implementations for preference contexts:
- **QUEST** (Query-Efficient Elicitation Strategy): A configurable BOED framework for multi-attribute product domains that achieves real-time performance through uncertainty-based query selection, outperforming value-of-information (VOI) approaches in both accuracy and execution time.[^23]
- **OPEN** (Optimal Preference Elicitation with Natural language): Combines BOED for optimal question selection with an LLM to translate abstract queries into natural language, achieving measurably higher preference elicitation accuracy than either LLM-only or BOED-only approaches.[^24][^25]
- **Decisive** (2026): An interactive decision framework combining document-grounded reasoning with Bayesian preference inference, achieving up to 20% improvement in decision accuracy over strong LLM baselines through pairwise tradeoff questions selected to maximize information gain.[^26][^27]

**Decision type fit:** Any preference elicitation problem where a latent utility vector can be modeled. Ideal for product recommendation, house selection, career choices.

**Speed:** BOED traditionally requires heavy computation between questions, but amortized deep BOED methods enable millisecond latency. QUEST achieves real-time performance across catalogs of hundreds to thousands of items.[^28][^23]

**Accuracy:** Highest of any adaptive method for well-defined preference spaces. Converges in 5–15 questions for most decision domains.

***

### Conjoint Analysis and Discrete Choice Experiments (DCE)

**Adaptive Conjoint Analysis (ACA)** uses experimental design to construct choice sets, presenting users with a small number of 2–5 option scenarios that collectively reveal preference weights for all attributes. The mechanism: each attribute × level combination appears in carefully balanced choice tasks, so that after 8–12 choices, a full utility function over the attribute space is estimated. The key insight for large decision spaces is **partial-profile design** — each choice task shows only a subset of the total attributes, allowing preference estimation across dozens of attributes from a cognitively manageable task.[^29][^30][^31]

**Adaptive Choice-Based Conjoint (ACBC)** adds a "build-your-own" phase where users specify must-have and cannot-accept levels, immediately eliminating alternatives that fail hard constraints before any statistical elicitation begins.[^32]

**PAPRIKA** (Potentially All Pairwise RanKings of all Possible Alternatives): A patented method from 1000minds that presents pairwise tradeoffs between hypothetical alternatives on exactly two criteria at a time, adapting question selection based on prior answers. PAPRIKA has been rated the highest preference elicitation method by patients across clarity, usability, and overall satisfaction in head-to-head comparisons against direct weighting, best-worst scaling, time trade-off, and standard gamble. Used in 870+ universities and 420+ peer-reviewed publications.[^33][^34]

**Decision type fit:** Consumer product design, healthcare decisions, policy prioritization, any domain where attribute tradeoffs drive choice.

**Speed:** 8–15 questions for conjoint; PAPRIKA typically 10–20 pairwise comparisons. Very fast for user.

**Accuracy:** High for attribute-level preferences. Slightly lower for capturing lexicographic preferences (non-compensatory rules).

***

### Multi-Armed Bandits and Sequential Elimination

The **multi-armed bandit (MAB)** framework treats each option as an "arm" with unknown reward, and the goal is to identify the best arm while minimizing wasted exploration. Applied to preference elicitation:[^35]

- **Successive Elimination**: Sequentially removes arms whose estimated reward is significantly below the best-known arm, exploiting large gaps to eliminate multiple options per round.[^36][^37]
- **Median Elimination**: Eliminates the lower half of options after each round, achieving exponential reduction in option count per step — halving the space with each interaction.[^36]
- **Dueling Bandits**: Preference-based MAB that uses pairwise comparisons (does A beat B?) rather than absolute reward signals, directly modeling the relative preference structure typical of human decisions.[^38]

**Decision type fit:** Online recommendation systems, A/B testing, any domain with a large option set that can be compared pairwise. Particularly strong when options can be scored against partial preference information.

**Speed:** Exponential elimination per round — in theory, a 1,000-option space can be reduced to 5–10 candidates in ~7 rounds.

**Accuracy:** Probabilistic guarantees rather than exact optimization. Higher accuracy tradeoff possible by accepting slower convergence.

***

### Minimax Regret Elicitation

Rather than maximizing expected utility, minimax regret frameworks minimize the worst-case loss from making a suboptimal recommendation given incomplete preference information. Practical significance: it provides *robust* recommendations even when the user hasn't fully articulated preferences, and it can identify the single question that most reduces the regret bound — a greedier but practically effective strategy.[^39][^40]

**Application:** Conversational recommender systems where partial information must yield actionable recommendations before full preference elicitation is complete.

***

### Sparsity-Leveraged Preference Learning

A 2025 theoretical advance establishes that when the user's preference vector is **k-sparse** (only a few of \( d \) possible dimensions actually drive their choices), the minimax optimal sample complexity reduces from \( \Theta(d/n) \) to \( \Theta(\frac{k}{n}\log(d/k)) \). Practically, this means that if only 3–5 dimensions drive a user's house preference out of 50 possible attributes, the number of questions required drops dramatically. Systems that first identify the relevant dimensions (via lexicographic screening or ACBC hard-constraint filters) and then elicit only those preferences will converge much faster than systems that treat all attributes as equally important.[^41]

***

## Part III: Psychology and Behavioral Science Methods

### Repertory Grid Technique (RGT)

George Kelly's **Personal Construct Theory** and the Repertory Grid Technique elicit the personal constructs individuals use to differentiate options through a triadic comparison: "Here are three options — in what important way are two alike and different from the third?". This method surfaces the *user's own vocabulary* for what matters, rather than imposing a pre-defined attribute set. The resulting construct grid reveals which dimensions the user actually uses to evaluate options, which dimensions cluster together, and which options are perceived as equivalent.[^42][^43]

**Application to your hypothesis:** For open-ended decisions ("help me build an app that makes people happy"), RGT-style questions can discover *what the user means by happiness* — their latent constructs — before any solution space is enumerated. The output feeds directly into a BOED or conjoint framework as the attribute set.

**Speed:** 10–20 triadic comparisons. Qualitative but computationally analyzable.

**Accuracy:** High for surfacing unarticulated values; lower for precise quantitative weighting.

***

### Fast-and-Frugal Heuristics (Gigerenzer)

Gigerenzer's adaptive toolbox demonstrates that simple, one-reason decision heuristics often match or outperform complex multi-attribute utility models in real-world environments with uncertainty. Key heuristics relevant to preference elicitation:[^44][^45]

- **Take-the-Best**: Rank criteria by validity, look them up in order, and stop at the first criterion that discriminates between options. For lexicographic preferences (where one criterion dominates), a single question eliminates all non-dominant options.[^44]
- **Fast-and-Frugal Trees (FFTs)**: Binary decision trees with a single exit point at every node — the user can exit with a decision after any question. Clinically validated and computationally minimal.[^46][^45]
- **Recognition Heuristic**: If only one of two alternatives is recognized, choose it — exploiting the correlation between name recognition and quality in natural environments.[^47]

**Application:** For decisions with clear lexicographic structure (e.g., "I will not buy a house outside a 30-minute commute radius, period"), FFTs can reduce a 1,000-option space to near zero with a single question. The correct first question in a fast-and-frugal approach is the hardest veto criterion.

**Speed:** 1–5 questions. Fastest possible approach.

**Accuracy:** Surprisingly competitive with full MCDM approaches. Best in uncertain, natural environments; worse in fully-specified synthetic ones.

***

### Progressive Profiling and Cognitive Load Management

Progressive profiling — collecting minimal information at first contact and accumulating additional preferences across interactions — has direct relevance to preference elicitation at scale. Key findings:[^48][^49]
- Forms with fewer fields see up to 120% higher completion rates[^48]
- 67% of users admit to abandoning forms halfway through[^49]
- 27% of users abandon forms for being too long; 10% for unnecessary questions[^49]

The cognitive load literature establishes the mechanism: extraneous cognitive load (the complexity of how information is presented) substantially increases choice overload, while intrinsic cognitive load (the inherent complexity of the decision) does not. This means **presentation architecture matters as much as the question content** — presenting 2 options at a time (pairwise) reduces extraneous load far more effectively than presenting 5 options simultaneously.[^50]

Tversky and Kahneman's work on cognitive bias establishes that under high load, anchoring effects intensify — the first option encountered has outsized influence — making question sequence critical to unbiased elicitation.[^51]

***

## Part IV: Emerging AI-Native Approaches

### LLM + BOED Hybrid Systems

The most promising emerging architecture combines LLMs (for natural language question generation and feature extraction) with classical BOED (for optimal question selection). The OPEN framework demonstrates this explicitly: BOED selects maximally informative abstract queries, while an LLM translates them into natural, contextual language and extracts features from freeform user responses. This overcomes the two key limitations of each standalone approach — BOED's inability to handle unstructured feature spaces, and LLMs' poor calibration under uncertainty and inconsistent preference following.[^25][^52][^53][^24]

LLMs trained with DPO (Direct Preference Optimization) can be fine-tuned to ask questions that maximize Expected Information Gain rather than generate responses that merely sound helpful, enabling LLMs to function as genuine BOED-style elicitation agents.[^54]

**Caveat:** PrefEval benchmarking (ICLR 2025 oral) shows that zero-shot LLMs fail to follow stated user preferences below 10% accuracy at just 10 turns. Fine-tuned models significantly improve but still degrade over long conversations. The implication: LLMs alone are insufficient for reliable preference elicitation without explicit Bayesian structure underneath.[^52][^53]

***

### Conversational Recommender Systems with Decision Trees

Research at NeurIPS demonstrates that decision-tree-based conversational recommenders can solve the core challenges of multi-turn preference elicitation: identifying which questions to ask, ranking candidates, deciding when to recommend, and handling negative feedback. Decision trees outperform deep RL approaches for this problem because they are interpretable, require less training data, and provide formal guarantees about convergence. Combining tree structure with learned item embeddings bridges the gap between interpretability and representational power.[^55]

***

## Part V: Framework Comparison

| Framework | Decision Type | Questions to Converge | Space Reduction per Question | Accuracy | Best For |
|---|---|---|---|---|---|
| Fast-and-Frugal Trees | Lexicographic / hard constraints | 1–5 | High (veto-based) | Competitive | First-stage triage, veto criteria |
| BOED / QUEST / OPEN | Any with latent utility vector | 5–15 | Maximal (information-optimal) | Highest | Mid-stage, continuous refinement |
| Conjoint / ACBC | Attribute tradeoff decisions | 8–15 | Moderate-high | High | Consumer products, features |
| PAPRIKA | Two-attribute tradeoffs | 10–20 | Moderate | High | Healthcare, policy, two-criterion trade-offs |
| AHP-express / TTM | Criteria weighting | 5–15 | Low (criteria, not options) | High | Criteria weights before shortlisting |
| ELECTRE (elimination) | Multi-criteria with veto logic | Computational (no user input) | Very high (eliminates dominated) | High | Pre-filter before user interaction |
| TOPSIS | Final ranking of shortlist | Computational | N/A (ranking only) | High | Final selection from 5–15 candidates |
| Minimax Regret | Robust recommendation under incomplete info | 3–10 | Moderate | Moderate-high | Early recommendation before full elicitation |
| MAB / Successive Elimination | Large option sets, comparative | 7–12 rounds | Exponential (halving) | Probabilistic | Recommendation systems, online contexts |
| RGT | Unknown attribute space | 10–20 | Low (discovers dimensions) | High for discovery | Open-ended, poorly-defined decisions |
| VFT | Strategy / life decisions | 3–5 | Very high (eliminates wrong domains) | High | First-stage values clarification |
| Progressive Profiling | Long-term relationship | Per session: 1–3 | Low per session; compounding | Moderate-high | Multi-session, relationship products |

***

## Part VI: A Novel Synthesized Architecture

Your hypothesis suggests a unified framework that doesn't yet exist as a product but is technically buildable. I'm calling it **Contextual Progressive Preference Narrowing (CPPN)** — a layered pipeline that combines the strongest elements of each paradigm:

### Layer 1: Values Extraction (VFT + RGT-inspired, 2–3 questions)
Before asking about options at all, ask about *values*. "What does [desired outcome] mean to you personally?" and "What is the one thing that would make this decision feel like a clear win?" These open-ended questions, processed by an LLM to extract fundamental vs. means objectives, set the semantic context for all downstream filtering. This layer eliminates entire *domains* — e.g., "build an app that makes people happy" resolved to "I want to maintain existing friendships" eliminates productivity apps, creative tools, and wellness apps in one step.

### Layer 2: Hard Constraint Elicitation (Fast-and-Frugal Veto, 2–4 questions)
Ask the lexicographic dealbreaker questions. "What would make you immediately say no, regardless of other factors?" For the house use case: "What is your absolute maximum budget?" and "Are there any zip codes or neighborhoods you will not consider?" These veto questions can eliminate 90%+ of options computationally — no further comparison needed for eliminated branches.

### Layer 3: Attribute Weight Elicitation (BOED + PAPRIKA-style, 5–10 questions)
With the hard-constraint pruned option set (now perhaps 50–100 options), run BOED-selected pairwise tradeoff questions to estimate the user's utility weights across the remaining relevant criteria. Each question is selected to maximize information gain on the final recommendation, targeting the attribute dimensions most likely to differentiate the remaining options. Sparse preference learning means only the 3–5 dimensions that actually drive this user's preference need to be elicited.[^41]

### Layer 4: Computational ELECTRE Pre-Filtering
Using the elicited weights, run ELECTRE outranking against the remaining option set to eliminate dominated alternatives. This step requires no user interaction — it runs computationally against a structured database of options. For house selection, this means running ELECTRE against a database of available properties. For app design, against a space of feature combinations.[^9]

### Layer 5: Final Ranking (TOPSIS or Scoring, 0–3 clarifying questions)
With 5–15 remaining options, apply TOPSIS or simple weighted scoring to generate a ranked recommendation with justification. Optional pairwise confirmation ("Between these two, which would you prefer?") provides the final calibration. At this stage, presenting options to the user is tractable and satisfying rather than overwhelming.

### Layer 6: Progressive Profiling Over Time
Each subsequent interaction refines the preference model, narrowing future recommendations with less elicitation overhead. Past answers are stored and leveraged, so the system becomes more accurate with repeated use while asking fewer questions.[^48]

***

## Part VII: Application to Your Use Cases

### "Help me build an app to make people happy"

**Layer 1 (VFT):** "What does happiness mean to you — connection, accomplishment, calm, something else?" → Eliminates entire app categories (e.g., productivity tools vs. social tools vs. mindfulness).

**Layer 2 (Veto):** "What platforms must it support?" and "What's your build budget/timeline?" → Eliminates native vs. web tradeoffs, MVP scope.

**Layer 3 (BOED Conjoint):** Pairwise feature tradeoffs ("notification-driven daily touchpoints vs. rich one-time experiences?") → Derives utility weights over feature space.

**Output:** Not "here are 1,000 app ideas" but "A lightweight iOS social accountability app with daily prompts, focused on maintaining 3–5 close friendships, buildable in 6 weeks."

***

### "Where should I buy a house?"

**Layer 1 (VFT):** "What does owning this house enable in your life that renting doesn't?" → Values clarification that may resolve the decision entirely.

**Layer 2 (Veto):** Budget cap, school district requirements, commute maximum, HOA yes/no → Computationally eliminates 80–95% of listings before user interaction.

**Layer 3 (BOED Attribute):** "Newer construction with smaller yard vs. older home with more space?" × 7 pairwise tradeoffs → Derives weights for lot size, age, style, neighborhood walkability.

**Layer 4 (ELECTRE):** Eliminates dominated listings from remaining ~50 using elicited weights.

**Output:** Ranked shortlist of 5–7 specific properties with match score and top-differentiating attributes.

***

### "Should I have kids?"

This is a *values-dominant* decision where Fast-and-Frugal Trees and VFT outperform optimization-based methods. The decision isn't about selecting among options — it's about values clarification. The right framework:

1. RGT-style triadic elicitation: "Thinking of people you admire who have made this decision both ways — what makes them different from each other?" Surfaces latent constructs.
2. VFT: "What would a fulfilling life look like in 30 years? What role does family play in that?" Separates fundamental from means objectives.
3. Fast-and-Frugal veto: "Are there circumstances under which this is simply not possible or not acceptable regardless of other factors?" Handles hard constraints (health, relationship, financial).

No ranking algorithm is appropriate here — the output is a structured articulation of the user's own values, not a recommendation.

***

### "Where should I start using AI?" / "What's the best academic system for me?"

These are **decision-under-uncertainty + high variance** cases, well-suited to the CPPN pipeline with heavy emphasis on Layer 1:

For AI adoption: VFT identifies whether the goal is efficiency, competitive positioning, cost reduction, or capability building. This alone eliminates 70% of possible starting points (e.g., "if you want to reduce manual data work, the answer is extraction/summarization tools, not generative agents").

For academic systems: RGT triadic comparisons ("Compare Obsidian, Notion, and Roam Research — what's the most important way two of them are similar and one is different from your perspective?") surfaces the user's actual valuation dimensions. BOED then weights them.

***

## Part VIII: Novel Synthesis Opportunities

### Hybrid Insights Not Yet Fully Realized

1. **Veto-First BOED**: Current BOED systems treat all attributes as compensatory (a high score on one can offset a low score on another). A veto-first architecture runs fast-and-frugal elimination before BOED, so the Bayesian model only needs to operate over the non-dominated space. This could halve the questions needed without accuracy loss.

2. **Sparse BOED**: Explicitly modeling preference sparsity (most users care deeply about 3–5 dimensions, not 50) and incorporating this prior into the BOED framework could reduce convergence time by \( \log(d/k) \) relative to standard BOED, potentially converging in 3–5 questions vs. 10–15 for sparse real-world decision domains.[^41]

3. **LLM-as-RGT-operator**: Using an LLM to conduct RGT-style triadic elicitation in natural conversation before handing the discovered construct space to BOED solves BOED's "feature space unknown" problem. The LLM runs a 3-question construct elicitation; the output defines the BOED attribute space; BOED then takes over for the weight elicitation phase. This hybrid doesn't appear in the literature as an integrated system.

4. **CPPN-as-API**: The entire pipeline above could be packaged as a decision API — accepting a decision domain description, a database of options (or a query to generate options), and returning a ranked shortlist from a structured conversation. For enterprise use cases (vendor selection, investment thesis evaluation, M&A target screening), this is directly productizable.

5. **Progressive Preference Graph**: Rather than treating preferences as a static vector, modeling them as a directed acyclic preference graph (where some preferences are conditional on others) enables adaptive elicitation that skips irrelevant branches entirely — e.g., "if budget > $1.5M, the school district question is irrelevant for this user." Constraint satisfaction problem (CSP) theory provides the formal machinery for this.[^56]

***

## Conclusion

The 1,000-option decision tree can be collapsed to 5–10 choices through a pipeline that applies frameworks in the right order: Values first (VFT/RGT), vetoes second (fast-and-frugal), Bayesian weight estimation third (BOED/conjoint/PAPRIKA), computational dominance elimination fourth (ELECTRE), and final ranking fifth (TOPSIS). Each layer operates on the output of the last, enabling exponential reduction in option count with each step. The theoretical minimum — given optimal question selection, sparse preferences, and hard veto constraints — is approximately 7–12 user interactions to narrow from 1,000 options to a confident recommendation, with measurable and improvable accuracy guarantees. The biggest gap in current systems is the integration of these layers into a coherent pipeline rather than applying any single method alone.

---

## References

1. [Practical Takeaway](https://dev.to/_b8d89ece3338719863cb03/cognitive-load-theory-why-your-brain-drops-the-ball-on-hard-decisions-2mfi) - Your working memory can hold roughly four chunks of information at once. Not seven, as the old myth....

2. [Overchoice - Wikipedia](https://en.wikipedia.org/wiki/Overchoice)

3. [Can There Ever Be Too Many Options? A Meta-Analytic Review of ...](https://academic.oup.com/jcr/article/37/3/409/1827647?login=true) - Abstract. The choice overload hypothesis states that an increase in the number of options to choose ...

4. [Analytic hierarchy process - Wikipedia](https://en.wikipedia.org/wiki/Analytic_hierarchy_process)

5. [A simplified version of the analytical hierarchy process ...](https://pmc.ncbi.nlm.nih.gov/articles/PMC6993013/) - Method name: AHP-express Keywords: AHP, Multicriteria decision making, Business application

6. [Clusters and pivots for evaluating a large numberof alternatives in AHP](https://www.scielo.br/j/pope/a/Z7GbqpgvqqwWVKj3ym6kCBv/) - AHP has been successful in many cases but it has a major limitation: a larger number of...

7. [5-Abdullah.qxp](https://mpra.ub.uni-muenchen.de/10811/1/MPRA_paper_10811.pdf)

8. [The Tournament Tree Method for preference elicitation in Multi ...](https://arxiv.org/abs/2510.08197) - This paper proposes the Tournament Tree Method (TTM), a novel elicitation and evaluation framework t...

9. [A Comprehensive Overview of the ELECTRE Method in Multi Criteria Decision-Making](https://journals.bilpubgroup.com/index.php/jmser/article/view/5637) - The ELECTRE (ELimination Et Choix Traduisant la REalite) method has gained widespread recognition as...

10. [Multi-criteria group decision-making with extended ELECTRE III method and regret theory based on probabilistic interval-valued intuitionistic hesitant fuzzy information](https://link.springer.com/10.1007/s40747-024-01645-3)

11. [Decision-making tools enabling sustainable maintenance strategies of naval systems: a comparison of multi-criteria approaches](https://www.worldscientific.com/doi/10.1142/S0218539326500270) - The present study proposes a multi-criteria approach for prioritizing failure modes in naval systems...

12. [[PDF] multi-criteria decision making models by applying the topsis method ...](https://mcdm.ue.katowice.pl/files/papers/mcdm11(6)_11.pdf)

13. [Creativity in Decision Making with Value-Focused Thinking](https://sloanreview.mit.edu/article/creativity-in-decision-making-with-valuefocused-thinking/) - Value-focused thinking is designed to focus the decision maker on the essential activities that must...

14. [Value-Focused Thinking: A Path to Creative Decisionmaking](https://books.google.com/books/about/Value_Focused_Thinking.html?id=I-goT2wc2IkC) - The standard way of thinking about decisions is backwards, says Ralph Keeney: people focus first on ...

15. [USING VALUE-FOCUSED THINKING IN AN INTEGRATED PROCESS TO SUPPORT DECISIONS](https://www.scielo.br/j/pope/a/Y5kDKCsN4yGKjGjkjQDFypB/?lang=en) - ABSTRACT This work presents an integrated decision support process based on Value-Focused...

16. [Information gain (decision tree) - Wikipedia](https://en.wikipedia.org/wiki/Information_gain_(decision_tree)) - In machine learning, this concept can be used to define a preferred sequence of attributes to invest...

17. [[1611.01655] Twenty (simple) questions - arXiv](https://arxiv.org/abs/1611.01655) - A basic combinatorial interpretation of Shannon's entropy function is via the 20 questions game. Thi...

18. [untitled](https://www.jstage.jst.go.jp/article/softscis/2006/0/2006_0_235/_pdf/-char/ja)

19. [How Decision Trees Work | Information Gain Explained - YouTube](https://www.youtube.com/watch?v=SN0ZDm1ImG8) - Learn how Decision Trees work in Machine Learning with a simple explanation of Information Gain and ...

20. [Optimal Experiment Design - Pyro documentation](https://docs.pyro.ai/en/dev/contrib.oed.html) - Bayesian optimal experimental design (BOED) is a powerful methodology for tackling experimental desi...

21. [Bayesian Optimal Experimental Design, Integral Probability Metrics ...](https://arxiv.org/html/2604.21849v1) - Traditionally, BOED typically selects designs by maximizing expected information gain (EIG), commonl...

22. [[1903.05480] Variational Bayesian Optimal Experimental Design](https://arxiv.org/abs/1903.05480) - Abstract:Bayesian optimal experimental design (BOED) is a principled framework for making efficient ...

23. [A practical query selection framework for real-time Bayesian preference elicitation](https://ieeexplore.ieee.org/document/9643224/) - Bayesian Preference Elicitation (PE) is an active learning technique aimed at discovering users’ pre...

24. [Bayesian Preference Elicitation with Language Models](https://arxiv.org/abs/2403.05534) - Aligning AI systems to users' interests requires understanding and incorporating humans' complex val...

25. [Bayesian Preference Elicitation with Language Models - arXiv](https://arxiv.org/html/2403.05534v1) - Selecting an Optimal Question: The Bayesian model samples all possible pairwise comparison questions...

26. [Decisive: Guiding User Decisions with Optimal Preference Elicitation from Unstructured Documents](https://www.semanticscholar.org/paper/415849d081e77ad6a09b510d8a7a03d3688fff9e) - Decision-making is a cognitively intensive task that requires synthesizing relevant information from...

27. [Guiding User Decisions with Optimal Preference Elicitation ... - arXiv](https://arxiv.org/abs/2604.18122) - Decision-making is a cognitively intensive task that requires synthesizing relevant information from...

28. [Deep Adaptive Design: Amortizing Sequential Bayesian Experimental Design](https://arxiv.org/pdf/2103.02438.pdf) - ...adaptive Bayesian experimental design that allows experiments to be run in
real-time. Traditional...

29. [What is Conjoint Analysis? (with examples)](https://conjointly.com/guides/what-is-conjoint-analysis/) - Conjoint analysis is a popular method of product and pricing research that uncovers consumers' prefe...

30. [How to Use Conjoint Analysis for Product Design - Gradient Metrics](https://www.gradientmetrics.com/blog/how-to-use-conjoint-analysis-for-product-design) - In this article, we will explore how conjoint analysis can be used to optimize product design based ...

31. [Conjoint Analysis: A Research Method to Study Patients ... - PMC](https://pmc.ncbi.nlm.nih.gov/articles/PMC8879380/) - CA is a method for eliciting patients' preferences that offers choices similar to those in the real ...

32. [Conjoint Analysis: A Comprehensive Guide - 1000minds](https://www.1000minds.com/conjoint-analysis/comprehensive-guide-to-ca) - Conjoint analysis is a survey-based research method for eliciting people's preferences by asking the...

33. [What is the PAPRIKA method? - 1000minds](https://www.1000minds.com/paprika) - PAPRIKA involves the decision-maker – eg you! – answering a series of simple questions based on choo...

34. [Patients choose PAPRIKA as top preference elicitation method in ...](https://www.1000minds.com/articles/patient-preferences) - New research shows patients rate 1000minds' PAPRIKA method as their preferred approach among five pr...

35. [Multi-armed Bandits for Preference Learning - UWDC](https://search.library.wisc.edu/digital/A3R5TF2W5UZKTP8P) - Multi-armed Bandits for Preference Learning ... In these cases, our algorithm provides the experimen...

36. [[PDF] Action Elimination and Stopping Conditions for the Multi-Armed ...](https://jmlr.csail.mit.edu/papers/volume7/evendar06a/evendar06a.pdf) - Our algorithm uses any (ε,δ)-PAC Multi-armed bandit algorithm as a black box in the learning process...

37. [[PDF] On Sequential Elimination Algorithms for Best-Arm Identification in ...](https://arxiv.org/pdf/1609.02606.pdf) - Zhao, “Distributed learning in multi-armed bandit with multiple players ... Bubeck, “lil'ucb: An opt...

38. [[PDF] A Survey of Preference-based Online Learning with Bandit ...](https://cs.uni-paderborn.de/fileadmin/informatik/fg/is/Publications/alt14-survey.pdf) - For dueling bandits, it is known that, for any algorithm A, there is a bandit problem such that the ...

39. [[PDF] Regret-based Models for Optimization and Preference Elicitation](https://www.cs.toronto.edu/~cebly/Papers/RegretBasedModels_ComparativeDM_chapter.pdf) - First, minimax regret is used by the decision support system to recommend decisions when it has inco...

40. [[PDF] Possibilistic Preference Elicitation by Minimax Regret](https://proceedings.mlr.press/v161/adam21a/adam21a.pdf) - Identifying the preferences of a given user through elicitation is a central part of multi-criteria ...

41. [Leveraging Sparsity for Sample-Efficient Preference Learning](https://www.arxiv.org/pdf/2501.18282v3.pdf)

42. [Repertory Grids - George Kelly Societykellysociety.org › repgrids](https://kellysociety.org/repgrids.html)

43. [Repertory grid technique - EduTech Wiki](https://edutechwiki.unige.ch/en/repertory_grid_technique) - A) Elicitation of constructs using triads of elements. This is the original method used by Kelly. It...

44. [[PDF] Précis of Simple heuristics that make us smart](https://pages.ucsd.edu/~mckenzie/ToddGigerenzer2000BBS.pdf)

45. [Modelingfast‐and‐frugalheuristics](https://onlinelibrary.wiley.com/doi/full/10.1002/pchj.576) - Heuristics are simple rules that experts and laypeople rely on to make decisions under uncertainty a...

46. [The power of simplicity: a fast-and-frugal heuristics approach to performance science](https://www.frontiersin.org/articles/10.3389/fpsyg.2015.01672/pdf) - ...research a direction, it requires a theoretical framework. We demonstrate the applications of thi...

47. [We favor formal models of heuristics rather than lists of loose dichotomies: a reply to Evans and Over](https://pmc.ncbi.nlm.nih.gov/articles/PMC2860098/) - letter Cogn Process. 2009 Nov 5;11(2):177–179. doi: 10.1007/s10339-009-0340-5

# We favor formal mod...

48. [Progressive Profiling: Building Comprehensive Customer Identities](https://www.avatier.com/blog/progressive-profiling-building/) - Learn how progressive profiling enhances security while improving user experience. Discover Avatier'...

49. [Progressive Profiling vs. Traditional Forms: Key Differences](https://www.reform.app/blog/progressive-profiling-vs-traditional-forms-key-differences) - Explore the differences between progressive profiling and traditional forms, revealing how gradual d...

50. [A Cognitivist Perspective on the Choice Overload Phenomenon](https://proceedings.emac-online.org/pdfs/A2024-118113.pdf)

51. [Cognitive Load in Decision-Making: Simplifying Complex Choices](https://www.linkedin.com/pulse/cognitive-load-decision-making-simplifying-complex-choices-hart-b3vqc) - Cognitive load, the mental effort required to process information, is a hidden force that profoundly...

52. [Do LLMs Recognize Your Preferences? Evaluating Personalized...](https://openreview.net/forum?id=QWunLKbBGF) - We introduce PrefEval, a benchmark for evaluating LLMs' ability to infer, memorize and adhere to use...

53. [ICLR Oral Do LLMs Recognize Your Preferences? Evaluating ...](https://iclr.cc/virtual/2025/oral/31848) - We introduce PrefEval, a benchmark for evaluating LLMs' ability to infer, memorize and adhere to use...

54. [Learning to Ask Informative Questions: Enhancing LLMs ...](https://aclanthology.org/anthology-files/pdf/findings/2024.findings-emnlp.291.pdf)

55. [[PDF] Rethinking Conversational Recommendations: Is Decision Tree All ...](https://par.nsf.gov/servlets/purl/10381237) - Conversational recommender systems (CRS) dynamically obtain the users' preferences via multi-turn qu...

56. [Constraint satisfaction approach in structuring neural network ...](https://www.sciencedirect.com/science/article/pii/S0377042725006545) - This work presents a novel numerical and quantitative methodology grounded in Constraint Satisfactio...

