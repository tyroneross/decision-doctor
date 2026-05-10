# Dynamic Decision Frameworks — Roadmap (v1.1+)

**Date**: 2026-05-10
**Trigger**: User asked: "can you dynamically apply different decision frameworks based on input?"
**Source**: `Reference files/Decisio Science Research/deep-research-report.md` (validated cross-disciplinary research)

## What the research says

The research concludes Decision Doctor needs a **router** in front of the engine that classifies the decision into one of three modes:

| Mode | Example | Right framework |
|---|---|---|
| **Structured enumerable** | "Should I cap intake, raise prices, or hire?" — finite options, known attributes | MCDA pipeline: hard-constraint filter → Bayesian pairwise → ELECTRE prune → TOPSIS rank (current pipeline) |
| **Generative design** | "Build me a roadmap for going from 25 to 45 patients/week" — no fixed catalog, construct an ideal profile | VFT/RGT discovery → infer design vector → satisfy constraints → output a brief, NOT a ranked list |
| **Values-dominant** | "Should I retire in 18 months or 36 months?" — value clarification, not optimization | Structured reflection: surface fundamental objectives + tensions + unresolved constraints. **No ranked output.** |

> "The mistake is using the same ranking machinery for both cases." — research §"What the practical system should actually be"

## Where v1 stands

All three v1 templates (`capacity`, `pricing`, `admin-hire`) are **structured enumerable** decisions. The current 5-stage MCDA pipeline (Values → Constraints → Weights → Outranking → Ranking) is the correct framework for them. **No change needed for v1 hackathon scope.**

## v1.1 — Add a Decision Mode Router (Stage 0)

Insert a new `lib/engine/stage0-router.ts` between intake validation and Stage 1:

```ts
type DecisionMode = "structured_enumerable" | "generative_design" | "values_dominant";

export async function routeDecisionMode(
  input: DecisionInput,
  template: DecisionTemplate,
): Promise<{ mode: DecisionMode; rationale: string }> {
  // Heuristic routing first (cheap, deterministic):
  // - Templates with declared `candidates: string[]` of length ≥3 → structured_enumerable
  // - Templates with `mode: "design"` flag → generative_design
  // - Templates with `mode: "values"` flag → values_dominant
  // - Otherwise: ask the LLM to classify
}
```

Each branch dispatches to a different orchestrator chain:
- `structured_enumerable` → current `runDecision()` (no change)
- `generative_design` → `runDesignBrief()` — RGT/VFT discovery prompt → outputs a `DesignBrief` (objectives, constraints, recommended starting config), NOT a ranked list
- `values_dominant` → `runValuesMap()` — structured reflection prompt → outputs a `ValuesMap` (fundamental objectives, tensions, unresolved constraints), NOT a recommendation

The `DecisionOutput` schema in `shared/schema.ts` becomes a discriminated union:

```ts
type DecisionOutput =
  | RankedOutput        // current shape
  | DesignBriefOutput   // {objectives, constraints, startingConfig, alternatives}
  | ValuesMapOutput;    // {fundamentalObjectives[], tensions[], unresolvedConstraints[]}
```

The recommendation page (`app/(app)/app/decisions/[id]/page.tsx`) selects a renderer based on the union tag.

## v1.2 — Per-stage framework variants (within structured_enumerable)

Within structured_enumerable mode, the research supports cheaper / different framework choices per template:

| Template signal | Framework choice |
|---|---|
| ≤3 candidates AND strong veto criteria | Skip Stage 4 (outranking) — go constraint→rank directly. Saves 1 LLM call, ~2s. |
| Many candidates (≥7) AND user has clear weights | Emphasize Stage 4 ELECTRE for silent pruning |
| Few candidates BUT high attribute uncertainty | Emphasize Stage 1 (RGT triadic comparisons for value discovery) |
| Group decision (v2 multi-tenant) | Add AHP pairwise weighting at Stage 3 |

Implementation: add `engineProfile: "minimal" | "standard" | "elaborate"` to `DecisionTemplate.types` and per-stage skip flags. The orchestrator reads the profile and bypasses stages.

## v1.3 — Bayesian adaptive elicitation (the research's strongest recommendation)

Replace the current "ask 7 fixed fields" intake with adaptive single-question elicitation (per ProductPilot's `/intake/next` pattern):

- Stage 0.5: BOED (Bayesian Optimal Experimental Design) — pick the next question that maximizes expected information gain about the user's latent utility weights
- Stop when posterior entropy is below ε OR minimax regret is below δ OR question budget is exhausted (per research §"Mathematical core" — composite score with `EIG + ΔMMR + Coverage − CognitiveCost`)

This is the architectural lift ProductPilot already paid for. We could port their `intake-controller.ts` pattern wholesale.

## v1.4 — Sidecar deployment (Railway)

Per user note (2026-05-10): Railway is available for Python workers/sidecars + Vercel hosts the Next.js app.

Stages worth moving to a Python Railway sidecar in v1.4+:
- **Stage 4 (ELECTRE outranking)** — pure deterministic numerical work; Python's numpy is faster than equivalent JS. Save ~200-500ms per decision.
- **BOED elicitation** — Pyro / NumPyro have mature Bayesian inference; building this in TS would be reinvention.
- **TOPSIS** — already deterministic in TS; sidecar move only if profiling shows it's a hot path (unlikely).

Contract: Next.js POSTs `{stage, input}` to `https://decision-doctor-engine.up.railway.app/<stage>`, gets `{output, latencyMs}` back. The orchestrator becomes a thin coordinator.

## v1 acceptance criteria (no change)

This roadmap does not modify v1 behavior. v1 ships as currently committed: 5-stage MCDA, three structured-enumerable templates, single output shape. Router + design-brief + values-map outputs land in v1.1 once the hackathon ships.

## References

- `Reference files/Decisio Science Research/deep-research-report.md` — validated framework
- `Reference files/Decisio Science Research/decision_engine_master_report.md` (879 lines) — extended detail
- `Reference files/Decisio Science Research/Preference Elicitation Decision Engine ...md` (797 lines) — equations and architecture
- ProductPilot `client/src/components/adaptive-intake.tsx` — single-question UX pattern
- ProductPilot `server/services/intake-controller.ts` — adaptive next-question API contract
