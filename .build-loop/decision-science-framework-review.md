# Decision Science Framework Review

## Sources read

- `Reference files/Decisio Science Research/decision_engine_master_report.md`
- `Reference files/Decisio Science Research/Preference Elicitation Decision Engine  Equations, Logic Structures, and System Architecture.md`
- `Reference files/Decisio Science Research/deep-research-report.md`
- `Reference files/Decisio Science Research/Decision Science for Radical Preference Simplification  A Cross-Disciplinary Framework.md`
- `Reference files/decision-doctor-prd.md`

## Implementation decision

Branch C should not force every doctor question into the three starter templates. The chat guide now routes questions through a deterministic decision-science framework first, then uses the three researched templates only when they fit.

## Research translation

- Values first: every framework begins by asking what outcome should be protected before ranking options.
- Veto constraints before tradeoffs: no PHI, budget, time, reversibility, and privacy limits are treated as hard filters.
- Adaptive elicitation: the UI asks one low-burden anchor question and offers chips before asking for a full intake.
- Computation after structure: ELECTRE/TOPSIS style ranking remains appropriate only after criteria and options are bounded.
- Robust fallback: minimax-regret language stays visible so the app does not overclaim certainty.

## Three researched accelerators

- Capacity: structured enumerable decision over cap intakes, add clinical block, buy back admin time, or use pricing to slow demand.
- Pricing: structured enumerable decision over fee raise, new-patient-only pricing, policy tightening, or hold fees.
- Admin help: generative workflow decision over automation, VA, billing contractor, or SOP-first sequencing.

## General decision path

For decisions outside the three templates, the guide creates a custom framework with:

- decision type: SED, GDD, VDD, EDD, or TCLD
- methods: VFT, hard-constraint vetoes, RGT discovery when needed, pairwise tradeoffs, and minimax-regret fallback
- criteria: capacity returned, risk control, setup burden, and reversibility
- AI workflow ideas: triage prompt, SOP-first automation, and low-risk draft assistant

## Product boundary

The general path is chat guidance and framework creation, not a fake recommendation engine. The template paths still launch the full structured intake and deterministic MCDA pipeline.
