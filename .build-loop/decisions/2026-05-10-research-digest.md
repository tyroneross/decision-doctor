# Research Digest — Chat-First Pivot Architecture

**Date**: 2026-05-10
**Source**: subagent read of `decision_engine_master_report.md` (879 lines), `Preference Elicitation Decision Engine ...md` (797 lines), `decision-doctor-prd.md`. Built on prior `deep-research-report.md` digest.

## Executive recommendation

The chat UX is a **structured wizard wearing a conversational coat**, not a freeform ChatGPT session. Every visible exchange maps to a Stage 1–5 step or a Stage 0 router classification; the LLM phrases, parses, and reflects — never owns the preference model.

**The single most load-bearing decision**: build Stage 0 as a **hard router with mode confidence ≥ 0.7 to commit**, ≤ 0.7 falls back to a disambiguating chip-question. Without that gate, the engine will TOPSIS values-dominant questions, which the master report explicitly calls "actively harmful."

## The 4 modes (per-mode framework chains)

### `structured_enumerable` — the 3 v1 templates
Chain: Stage 1 Values clarifier (1–2) → Stage 2 Veto/FFT → Stage 3 PAPRIKA pairwise weights (one tradeoff at a time) → Stage 4 ELECTRE silent prune → Stage 5 TOPSIS rank + workload reducers.
Questions before output: 5–9. Stop on top-1/top-2 margin OR minimax-regret ≤ δ. Hard cap 9.
Output: existing `DecisionOutput` shape.

### `generic_structured` — options named, no template
Chain: Stage 0.5 LLM-as-RGT extracts user-named options + dimensions → Stage 1 confirm → Stage 2 user-edits-chips constraints → Stages 3–5 same as mode 1.
Questions: 6–10. Adds a "did we get the criteria right?" gate before ranking.
Output: same shape as mode 1 + criteria visible/editable.

### `generative_design` — no options, exploratory
Chain: VFT (3 questions) → RGT (3–5 conversational triads) → Stage 2 constraint capture → constraint-satisfaction generator picks 3–5 candidate plans grounded in workload-reducer taxonomy → user picks one OR sparse BOED selects.
Questions: 8–12.
Output: **1-page design brief** — fundamental objective, constraints, recommended pilot, 3-step implementation sequence, workload reducers to deploy first, what to measure in 30 days, fallback if pilot fails. No confidence percentage.
Stop: coverage-based, not entropy-based.

### `values_dominant`
Chain: VFT (3 narrative questions) → RGT (3–5 triads using people/scenarios the user knows) → FFT to clarify if a hard constraint settles it → Minimax-regret reflection.
Questions: 6–10, mostly narrative.
Output: **values map** — fundamental objectives, key tensions, dominant constructs, unresolved dimensions, recommended next conversations. Explicitly no recommendation, no confidence number, no TOPSIS score.
Stop: when constructs trace to ≥1 fundamental objective and ≥1 unresolved dimension is named.

## Stage 0 router signals

**Lexical:**
- `structured_enumerable`: option names + comparator ("between A and B"), template anchors ("capacity", "panel", "raise prices", "cap intakes", "hire admin", "VA", "associate"), explicit numeric inputs.
- `generic_structured`: ≥2 named tools/vendors/people in option position ("Stripe vs Square", "Acuity vs SimplePractice").
- `generative_design`: exploration verbs without targets — "free up time", "where do I start", "want to grow", "want to streamline".
- `values_dominant`: identity, life-stage, irreversibility cues — "retire", "close the practice", "have kids", "leave clinical", "is this what I want".

**Structural:**
- Count noun-phrase options. ≥2 → modes 1/2. 0 → modes 3/4.
- Numeric/quantitative anchors → bias modes 1/2 (decidable on data).
- First-person identity claims → bias mode 4.

**Fallback when confidence < 0.7:** ask one chip-question — "Are you choosing between specific options, exploring how to approach a problem, or thinking through a values question?"

**Minimum info to commit per mode:**
- Mode 1: templateId match + ≥1 numeric anchor
- Mode 2: ≥2 named options + 1 user-named criterion
- Mode 3: 1 fundamental objective + 1 stated constraint OR explicit "I don't have options yet"
- Mode 4: 1 identity/life-stage construct + named time horizon

## AI-leverage workload reducer taxonomy (Stage 5 picks from this menu)

| # | Tool / Pattern | Replaces | hr/wk saved | Fit & gates |
|---|---|---|---|---|
| 1 | Otter.ai / Granola | non-clinical meeting notes (referrals, vendors, supervision) | 1–3 | All. ⚠️ HIPAA: never on patient visits w/o BAA |
| 2 | AI scribe with BAA (Heidi, Freed, Nuance DAX, Abridge) | manual SOAP notes | **5–10 — biggest single lever** | Psych/PT/primary care/peds. ✅ BAA mandatory |
| 3 | Claude/ChatGPT prompt library for patient comms | re-writing same email 30x | 1–2 | All. No PHI ever. Default. |
| 4 | Acuity/Cal.com + Stripe + auto reminders + no-show fees | manual scheduling, reminders, late-fee enforcement | 2–4 | All. Default if not deployed (capacity veto). |
| 5 | Zapier/Make between scheduler ↔ EHR ↔ Stripe ↔ email | manual transcribing, manual receipts, manual no-show charges | 1–3 | Only when EHR has API. |
| 6 | SimplePractice/Headway/Alma billing automation | manual claim submission + denial follow-up | 3–6 | Insurance-paneled only. Pairs w/ admin-hire "billing service only". |
| 7 | Spruce/OhMD secure messaging + AI replies | phone tag, repeated FAQs | 2–4 | All. ✅ HIPAA-gated products. |
| 8 | Voice-to-EHR dictation + AI scribe | typing notes between visits | 2–4 | Medical/PT/peds. Combines w/ #2. |
| 9 | Claude/ChatGPT for prior-auth letter drafting | hand-writing prior-auths | 1–2 | Psych/PT especially. ⚠️ Deidentify before paste. |
| 10 | AI-drafted patient onboarding/intake docs | maintaining policies, intake forms, NSA disclosures | 0.5–1 | All. One-time-savings. Default at template completion. |
| 11 | Loom/Tella + AI summary for repeat patient explanations | repeating same 5-min explanation 20x/wk | 1–2 | Psych/peds/primary care. |
| 12 | HelloRache/MEDVA/Hello Mira HIPAA-compliant VA | in-house admin hire | 5–15 (replacement) | All. ✅ HIPAA-gated. Pairs w/ admin-hire as candidate. |

**Default-recommend across all 3 templates:** #3 (prompt library), #4 (scheduling stack).
**Capacity default:** #4, #7.
**Pricing default:** #6 if insurance-paneled.
**Admin-hire default:** #2, #6, #12 as candidate analysis input.

**Anti-patterns to keep out of prompts:** "AI-powered intake form" (vague), "AI marketing copilot" (low ROI for solo healthcare), "AI patient acquisition" (compliance landmine), generic CRM AI, anything pitched as "AI strategy" without naming a tool.

## Practitioner facts (`[INFERRED]` — solo-practice consulting heuristics, not cited research)

**Capacity:** typical solo psychiatry panel = 80–150 active; therapy sustainable = 25–35 weekly clinical hours; no-show rate >15% usually fixable with deposit/CC-on-file inside 60 days.

**Pricing:** cash-pay psychiatry rates typically 1.5–2.5x best insurance reimbursement; insurance panel exit usually loses ~20–40% of that payer's patients within 6 months; price increases <10% rarely move cash-pay attrition; >15% increases need a value-add.

**Admin hire:** solo psych admin load = 8–15 hr/wk; loaded VA cost $8–25/hr; in-house PT W-2 $20–35/hr loaded; HIPAA-compliant VA services 1.5–2x non-HIPAA VA; management overhead ≈ 2–4 hr/wk first 90 days then 1 hr/wk.

The system should ASK these as defaults to confirm, not assume.

## Where the brief contradicts the sources

The brief proposed a fourth mode `generic_structured` as a separate router class. The master report treats it as an SED with missing `criteria` and `candidate_set` — same engine, different UX entry. I'm keeping `generic_structured` as its own router classification because the criterion-confirmation gate is a real UX divergence, but the engine pipeline is mode 1's.

## What this changes about the build (concrete)

1. **Add `lib/engine/router.ts`** — Stage 0 classifier with confidence gate, returns `{mode, confidence, missing_info[]}`.
2. **Add per-mode pipelines:** `runDecision` (existing, mode 1+2) · new `runDesignBrief` (mode 3) · new `runValuesMap` (mode 4).
3. **Extend `DecisionOutput`** as a discriminated union OR add a `mode` field with conditional renderers in the UI. (Discriminated union is cleaner; more work.)
4. **Rewrite Stage 5 prompt** to pick from the 12-item AI-leverage menu rather than freely generate.
5. **Build `/app/chat`** as the new primary entry. Templates become 3 chips above the input.
6. **Stateful `/api/chat`** endpoint that holds conversation transcript + extracted intake state in the `decisions` row (extend schema with `transcript jsonb`).
7. **Confidence gate UX** — when router < 0.7, surface the disambiguating chip-question.
