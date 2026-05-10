# Validated blueprint for a practical AI decision engine

## What the draft materials got right

After checking the draft markdowns and the Perplexity synthesis against the literature, the strongest conclusion is that the *architecture* is sound even though the names **CPPN** and **PEDE** are product-level labels rather than established academic frameworks. The robust idea is a layered pipeline: first surface values and constructs, then apply hard constraints, then run adaptive tradeoff elicitation, then do computational pruning and ranking. That sequence matches how entity["people","Ralph L. Keeney","decision analyst associated with Value-Focused Thinking"]’s value-focused thinking is used to create better alternatives, how repertory-grid style triads surface personally meaningful attributes, how entity["people","Gerd Gigerenzer","psychologist associated with fast-and-frugal heuristics"]’s fast-and-frugal trees handle non-compensatory vetoes, and how Bayesian preference elicitation and conversational recommender systems select informative questions and stop when they are confident enough to recommend. citeturn30view3turn30view1turn19view8turn19view0turn20view1

The draft’s central claim that “a large decision tree can often be collapsed with a small number of good questions” is directionally correct, but it needs a more careful statement. In information-theoretic terms, identifying one item out of 1,000 possibilities requires about \(\log_2(1000)\approx 10\) bits of information under ideal conditions, and “twenty questions” style results show that near-entropy-optimal question strategies exist. In real decisions, however, the option space is not uniform, user answers are noisy, some important attributes are initially unknown, and some preferences are veto-like rather than compensatory. So “7–12 questions” is best understood as a plausible design target for *well-structured* domains, not as a universal theorem or product guarantee. citeturn16search0turn25search4turn30view6

Several draft claims should be kept with reduced confidence rather than discarded. The sparse-preference result is real and important, but it currently comes from a recent theoretical preprint; it supports the hypothesis that if only \(k\) out of \(d\) attributes matter, sample complexity can shrink sharply, yet that does not by itself prove any specific production system will converge in 3–5 questions. Likewise, the **OPEN** and **Decisive** architectures are real papers and they support the hybrid “LLM for language and feature extraction, Bayesian core for uncertainty and question choice” direction, but they are still research-era evidence rather than settled operational doctrine. The same is true of the Tournament Tree Method: promising, but too new to make it a primary production dependency today. citeturn33view0turn20view0turn33view1turn31view0

## What the practical system should actually be

The feasible production system is a **hybrid decision engine**, not a single algorithm. It should have four layers: a **problem router** that classifies the decision; a **preference model** that stores objectives, constraints, uncertainty, and history; an **optimization layer** that prunes, elicits, and ranks; and a **conversation layer** that turns mathematical queries into short natural-language questions and explanations. This is also the cleanest way to reconcile the draft materials: the decision-science methods should do the mathematics, while the AI layer should handle language, retrieval, and adaptation to domain context. citeturn19view4turn20view0turn20view1turn33view1

In practice, the sharpest deterministic-versus-flexible split is this. **Deterministic components** should include domain schemas, option normalization, hard-constraint filtering, feasibility checks, consistency checks, outranking thresholds, regret thresholds, audit logs, and policy rules. **Flexible components** should include feature discovery from free text, mapping user language to candidate attributes, generation of natural-language pairwise questions, summarization of tradeoffs, and retrieval of evidence from unstructured sources. The reason is simple: recent work shows LLMs can help with question phrasing and open-ended preference capture, but preference-following and long-horizon personalization remain limited when LLMs are used alone. The math layer should own the posterior, the scores, and the stopping rule. citeturn20view0turn19view2turn33view1

The practical router should distinguish at least three decision modes. **Structured enumerable decisions** have a finite option set and known attributes, as in houses, jobs, cars, vendors, or academic programs. **Generative design decisions** do not start with a fixed catalog and instead need the system to construct an ideal profile or design brief, as in “build an app that makes people happy” or “where should I start using AI.” **Values-dominant decisions** are not well-served by ranking algorithms at all, because the real task is value clarification, not optimization, as in “should I have kids?” or “should I change careers?” The literature strongly supports explicit values clarification for complex personal decisions, and it supports MCDA when alternatives and criteria are concrete; the mistake is using the same ranking machinery for both cases. citeturn19view11turn30view3turn19view4

The right translation of “design of experiments” into this system is **sequential Bayesian optimal experimental design**, not classical factorial DOE. Classical DOE is excellent when the goal is estimating population-level effects or product-response surfaces offline. It is not the best default for eliciting one person’s latent utility in real time. For individualized decision support, the system should ask the next question that is expected to reduce posterior uncertainty or regret the most, which is exactly the BOED framing used in modern preference elicitation. citeturn27academia19turn19view0turn20view0

## Which methods belong in which phase

The first phase is **problem framing and attribute discovery**. When the domain is open-ended, the system should begin with value-focused thinking and repertory-grid style prompts. Value-focused thinking is useful because it forces the system to ask what “success” means *before* it starts ranking alternatives; repertory grids are useful because triadic comparisons reveal the user’s own bipolar constructs rather than imposing a canned schema. In production terms, this is where the AI layer earns its keep: it converts narratives into candidate objectives, constraints, and attributes. citeturn30view3turn30view1

The second phase is **hard-constraint elimination**. This is where fast-and-frugal trees and ordinary constraint satisfaction are most useful. In the literature, fast-and-frugal trees are not “optimal” in the full utility-maximizing sense, but they are deliberately low-load, early-exit structures that do well when a few cues dominate and when the main goal is fast classification rather than perfect ranking. For production systems, this is exactly the right tool for budget caps, geographic exclusions, required certifications, non-negotiable family constraints, or binary policy rules. citeturn19view8

The third phase is **adaptive preference elicitation**. This is the system’s core intelligence. If the feature space is known well enough, use Bayesian pairwise elicitation or adaptive conjoint/PAPRIKA-style comparisons. The key benefit of the Bayesian route is that it naturally supports uncertainty quantification and adaptive question choice; the key benefit of conjoint-style elicitation is that it provides interpretable part-worths and works especially well when options can be represented by bundles of discrete attributes. The 2010 real-time Bayesian preference elicitation work and the 2024 OPEN work both point in the same direction: pairwise comparisons plus a Bayesian update rule are a practical center of gravity for modern systems. citeturn19view0turn20view0turn18search0turn18search17

The fourth phase is **computational pruning**, where ELECTRE or other outranking methods become valuable. ELECTRE is especially appropriate when you already have a structured option matrix and want to eliminate alternatives that are poorly supported once the user’s current weights and vetoes are known. This is not the best tool for early-stage conversational discovery, but it is very good for silently removing dominated or weakly credible alternatives once the database is in place. citeturn19view5turn19view4

The fifth phase is **final ranking and explanation**. TOPSIS or another weighted closeness-to-ideal method is suitable here, provided the option set is already small, the attributes are normalized sensibly, and the user has already revealed enough about tradeoffs for a compensatory ranking to be meaningful. The drafts were right to place TOPSIS late rather than early. The caution is that normalization choices matter, which is why TOPSIS should be used on a carefully curated shortlist, not on a raw, messy catalog. citeturn19view4turn4search7

AHP belongs mainly in **group weighting** and **small-criteria problems**, not as the main engine for huge alternative sets. The literature continues to support pairwise comparison, hierarchy construction, and consistency checking, but it also confirms the basic scaling problem: standard AHP becomes cognitively expensive as the number of compared items grows. Simplified variants such as AHP-Express and very recent methods such as TTM are better understood as ways to retain some AHP advantages while reducing the prompt burden, especially in stakeholder workshops or governance settings. citeturn23view0turn23view1turn24search1turn31view0

## Mathematical core

The question-selection backbone should be **entropy reduction**. If \(\mathcal{O}\) is the current option or hypothesis space, then its uncertainty is

\[
H(\mathcal{O})=-\sum_{o \in \mathcal{O}} p(o)\log_2 p(o).
\]

For any candidate question \(q\), the system should estimate information gain

\[
IG(q)=H(\mathcal{O})-\sum_{a} p(a \mid q)\, H(\mathcal{O}\mid a,q),
\]

and prefer questions with larger expected uncertainty reduction. This is the clean mathematical expression of “ask the question that rules out the most branches.” In a personal decision engine, \(IG\) should be computed over latent preference states or over the shortlist, depending on the stage. citeturn25search4turn16search0

The preference model itself should usually be a **pairwise latent-utility model**. The standard formulation is Bradley–Terry or logistic paired comparison:

\[
P(A \succ B \mid \theta)=\sigma\!\big(\theta^\top (f_A-f_B)\big)=\frac{1}{1+\exp(-\theta^\top(f_A-f_B))},
\]

where \(f_A\) and \(f_B\) are feature vectors and \(\theta\) is the user’s latent weight vector. After each answer \(y_t\), update the posterior

\[
p(\theta \mid D_t)\propto p(y_t \mid \theta, q_t)\, p(\theta \mid D_{t-1}).
\]

This is the right formalism for “the system is learning what matters to this user from pairwise tradeoffs.” When the drafts used Bradley–Terry and Bayesian posterior updating, they were on strong ground. citeturn20view0turn19view0

The formal BOED objective for selecting the next question is expected information gain over the posterior:

\[
q_t^*=\arg\max_{q \in \mathcal{Q}} \mathbb{E}_{y \sim p(y\mid q, D_{t-1})}
\big[H[p(\theta\mid D_{t-1})]-H[p(\theta\mid D_t)]\big].
\]

That objective is academically clean but production systems usually need one more term: user burden. The most practical implementation is a composite acquisition function such as

\[
\text{Score}(q)=\alpha \, EIG(q)+\beta \, \Delta MMR(q)+\gamma \, \text{Coverage}(q)-\eta \, \text{CognitiveCost}(q).
\]

The first two terms come from BOED and regret reduction; the last term is an engineering control that keeps questions short, pairwise, and low-friction. The draft materials hinted at this; the practical recommendation is to make this composite score explicit in the system. citeturn19view0turn35search0turn32search0turn30view6

When criteria or stakeholder weights themselves must be elicited, AHP’s math is still useful. If \(A\) is a pairwise comparison matrix, the system derives a priority vector and checks internal coherence via

\[
CI=\frac{\lambda_{\max}-n}{n-1}, \qquad CR=\frac{CI}{RI}.
\]

A low consistency ratio indicates that the judgments are not wildly self-contradictory. In other words, AHP is valuable as a *consistency-checked weighting module*, especially for small criterion sets or group input, but it should not be the main online preference learner for a 1,000-option interactive system. citeturn23view0turn23view1

For pruning on known option sets, ELECTRE-style outranking can be formalized with concordance and discordance. A simplified version is

\[
c(a,b)=\sum_{j: g_j(a)\ge g_j(b)} w_j, \qquad
d_j(a,b)=\frac{\max(0, g_j(b)-g_j(a))}{g_j^{\max}-g_j^{\min}},
\]

followed by a credibility or outranking relation that marks whether \(a\) credibly outranks \(b\). This is attractive in production because it lets the system delete weak options *without asking the user more questions*. It is not an ideal first-stage conversation method, but it is a very good middle-stage computational filter. citeturn19view5turn19view4

For final ranking on a short list, TOPSIS remains a good engineering choice:

\[
S_i^+=\sqrt{\sum_j (v_{ij}-v_j^+)^2}, \qquad
S_i^-=\sqrt{\sum_j (v_{ij}-v_j^-)^2},
\]

\[
C_i^*=\frac{S_i^-}{S_i^+ + S_i^-}.
\]

The winning options are just those closest to the user’s ideal and farthest from the anti-ideal after weighting and normalization. The important production caveat is that TOPSIS should be applied *after* attribute normalization, veto filtering, and preferably outranking reduction. citeturn19view4turn4search7

For stopping, the cleanest robust rule is **minimax regret**. Let \(\mathcal{F}\) be the feasible set of utility functions still consistent with the answers so far. Then

\[
x^*=\arg\min_{x \in \mathcal{X}} \max_{u \in \mathcal{F}} \Big[\max_{x' \in \mathcal{X}} u(x')-u(x)\Big].
\]

This gives the option whose worst-case miss relative to the true best option is smallest. In practice, the engine should stop when minimax regret is below a domain-specific threshold \(\delta\), or when posterior entropy is below \(\varepsilon\), or when the interaction budget is exhausted. This is the most production-worthy answer to “when do we stop asking and recommend?” citeturn35search0turn19view7

## Reference logic flow

The most usable reference implementation is a router plus loop. The router decides whether the problem is structured, generative, or values-dominant. The loop alternates between pruning and elicitation. The critical engineering point is that the LLM does *not* own the truth state; the posterior, regret bound, and shortlist do. That design is the main safeguard against persuasive but unstable recommendation behavior. citeturn20view0turn19view2turn33view1

```text
function solve_decision(decision_context):
    mode = classify_mode(decision_context)
    state = initialize_state(decision_context)

    if mode in {generative, values_dominant}:
        state.objectives = elicit_values_and_constructs(state)
        state.features   = build_feature_schema(state.objectives, state.free_text)

    if state.option_set_exists:
        state.options = apply_hard_constraints(state.options, state.constraints)

    while not stopping_condition(state):
        if state.option_set_exists and too_many_options(state.options):
            state.options = deterministic_prune(state.options, state.constraints)

        q = choose_next_question(state)   # maximize EIG / regret reduction / coverage, penalize burden
        a = ask_user(q)
        state = update_posterior(state, q, a)

        if state.option_set_exists:
            state.options = outrank_and_filter(state.options, state.posterior)

    if mode == values_dominant:
        return values_map_and_tensions(state)

    shortlist = finalize_candidates(state)
    ranked = final_rank(shortlist, state.posterior)
    return recommendation_with_explanations(ranked, state)
```

The minimal common **input** should include: decision mode, raw user prompt, any existing option set or retrieval source, hard constraints, risk tolerance, reversibility, stakeholder count, and question budget. The minimal **state** should include: extracted objectives, candidate features, posterior over preference weights, current shortlist, question history, consistency and confidence metrics, and an explanation trace. The minimal **output** should include: ranked shortlist or design brief, hard constraints applied, top drivers, accepted tradeoffs, regret/confidence bounds, unresolved uncertainties, and a replayable audit trail of why each recommendation was made. That is broad enough to support catalog decisions, generated designs, and values-clarification reports. citeturn20view1turn19view0turn35search0

## How the architecture should change by decision type

For **structured enumerable decisions** such as buying a house, selecting a school system, choosing a city, or picking a vendor, the strongest production stack is: hard-constraint filter \(\rightarrow\) Bayesian pairwise elicitation or adaptive conjoint \(\rightarrow\) ELECTRE-style pruning \(\rightarrow\) TOPSIS-style final ranking. This works because the option matrix exists, the features are mostly known, and the main question is how the user trades off competing benefits. The drafts were correct that this is the most mature path to a practical product. citeturn19view0turn19view5turn19view4

For **generative design decisions** such as “help me build an app to make people happy” or “where should I start using AI,” the system should *not* force early ranking over canned options. Instead it should do VFT/RGT-style discovery first, then infer a desired design vector, then satisfy feasibility constraints, and only then optionally simulate or compare candidate designs. In other words, the output is usually a **design brief** or **recommended starting configuration**, not a ranked list from an existing catalog. This is exactly where the OPEN-style hybrid is most useful: an LLM can surface attributes from language, but the Bayesian layer should handle uncertainty and question choice. citeturn30view3turn30view1turn20view0

For **values-dominant decisions** such as whether to have children, whether to change careers, or which life structure fits best, the system should be framed as a structured reflection aid rather than an optimizer. The right deliverable is a map of fundamental objectives, tensions, and unresolved constraints, possibly with a regret-informed summary of what remains ambiguous. The evidence on explicit values clarification supports this: people benefit when a tool helps them see how options align with their stated values, but that does not imply that a pseudo-precise numerical rank is psychologically or ethically appropriate for every life decision. citeturn19view11turn30view3

For **group decisions**, AHP or another explicit weight-aggregation method becomes more attractive, because the problem is no longer only “what does one person prefer?” but also “how do several preference structures get combined fairly and consistently?” In production, that means one more module: stakeholder-specific weights, plus an explicit aggregation policy. The literature also shows that stakeholder preferences can change over time, so the group engine should store versioned states instead of assuming a fixed consensus. citeturn23view1turn32search6turn19view4

For **time-critical or high-stakes settings**, the system should become more conservative. That means more deterministic rules, fewer speculative latent-variable moves, explicit human review, and bounded-regret delivery rather than confident language. The 2025 review on AI clinical decision support is a reminder that even when such systems look promising, evidence of real-world effectiveness, safety, and equity can lag far behind technical capability. High-stakes domains therefore need stronger governance than consumer recommendation domains. citeturn30view5

## Limits, governance, and open questions

The most important limit is that a mathematically elegant engine still depends on **good feature schemas and good option data**. If the house database lacks commute reliability, neighborhood noise, or HOA risk, no elicitation method can recover that missing variable. Likewise, if the system treats a values-dominant problem as if it were an e-commerce filter, it will create false precision. Practical feasibility depends less on having one perfect algorithm than on having the right problem representation and routing policy. citeturn19view4turn30view3

The second limit is that several of the most exciting ideas in the drafts are still **research-frontier** rather than industrially settled. Sparse preference learning, OPEN, Decisive, and TTM are all real and relevant, but some are preprints or very recent conference work. They are strong enough to influence architecture today, but not strong enough to justify overclaiming. The mature backbone remains: explicit values clarification, low-load pairwise elicitation, Bayesian uncertainty tracking, consistency checks, regret-bounded stopping, and transparent final explanations. citeturn33view0turn20view0turn33view1turn31view0turn19view11

The third limit is human factors. Choice overload is real but conditional, and interface design materially affects whether people can express stable preferences. Research on choice overload, online MCDA interfaces, and explicit values clarification all point the same way: keep questions short, present pairwise tradeoffs instead of long forms, show progress, and explain recommendations in the user’s own language and values terms. The system should optimize not just for statistical efficiency but also for felt clarity. citeturn30view6turn32search0turn19view11

Open questions remain. The most important ones are: how best to learn domain-specific feature ontologies without imposing generic LLM priors; how to manage preference drift across sessions; how to calibrate regret thresholds so they feel trustworthy to users; and how to prove fairness and error bounds when multiple stakeholders and unstructured documents are involved. Those are active design and research frontiers, not solved details. citeturn33view1turn32search6turn30view5

The highest-confidence recommendation, after validation, is therefore this: build the system as a **hybrid preference-elicitation engine** with **values-first framing**, **deterministic veto pruning**, **Bayesian adaptive pairwise questioning**, **computational outranking for silent elimination**, **final compensatory ranking only on shortlists**, and **minimax-regret or entropy-based stopping**. Treat the draft names as product wrappers, not canonical theories. Treat LLMs as language and retrieval modules, not as the sole decision core. That is the version of the idea that is both well-supported and practically buildable now. citeturn30view3turn30view1turn19view8turn19view0turn19view5turn35search0turn19view2turn20view0