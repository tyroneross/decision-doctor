---
title: Decision Doctor V2 PRD - Pain-to-AI Recommendation
status: planning
created: 2026-05-11
source_prd: ../PRD.md
companion_architecture: ../architecture/pain-to-ai-recommendation-architecture.md
companion_ux: ../ux/pain-to-ai-user-journey-and-deltas.md
---

# Decision Doctor V2 PRD - Pain-to-AI Recommendation

## Objective

Decision Doctor V2 should help solo healthcare practitioners identify one specific AI use case worth trying now, give them a usable starter solution, and make the result measurable.

The first milestone is not skill or plugin generation. The first milestone is a reliable recommendation loop:

```text
pain point -> candidate AI tasks -> one recommended starting task -> starter solution -> baseline metric
```

Skills, plugins, agents, and automation come after the recommendation is useful.

## Current State

The current app already has useful foundations:

- Auth-gated app shell with `/app`, `/app/chat`, `/app/decisions`, `/app/decisions/new`, `/app/skills`, and `/app/audit`.
- Chat route that can collect structured inputs and run the existing decision engine.
- Three structured decision templates: capacity, pricing, and admin-hire.
- MCDA decision engine with transparent method trace and workload reducers.
- Feasibility and scaffold generation code paths for skills/plugins.
- Recommendation detail UI that surfaces recommendation, rationale, alternatives, fallback, workload reducers, and "show the math".
- Skills and audit routes exist as stubs.
- No-PHI posture, Better Auth, tenant-aware data model, RLS, and audit events are established constraints.

The current product framing is too template-led and scaffold-led for the next goal. It asks the user to land in a decision template or chat into one. V2 should make the first user-visible outcome a concrete AI Task Recommendation.

## Target Thesis

People and small organizations struggle to implement AI because they do not know where to start, what AI can actually do, and how to know whether the first attempt helped.

Decision Doctor V2 acts as a lightweight AI deployment strategist for solo healthcare practitioners. It starts with a concrete pain point, narrows that pain into candidate tasks, recommends the best first AI task, produces a starter prompt/checklist/tool guide, and tracks whether the task improved.

## Primary User

Primary wedge:

- Solo healthcare practitioner.
- No in-house operations, AI, analytics, or engineering team.
- Business pain is real, recurring, and time-consuming.
- Clinical trust and privacy boundaries matter.
- User wants immediate practical help, not an abstract AI strategy.

Expansion path:

- Small practices.
- Healthcare-adjacent operators.
- SMB owner-operators.
- Organizations beginning practical AI implementation.

Do not broaden the MVP beyond the healthcare wedge until the recommendation loop is working.

## Product Principles

1. Recommendation first.
   The user should leave the first session with one specific task to try.

2. Use case and prompt library are first-class.
   The engine should not invent every candidate task from scratch. It should retrieve and adapt curated use cases and prompts.

3. Skills/plugins are second.
   Generate skills/plugins only after the user has a recommended task or chooses to advance an existing starter solution.

4. No PHI in V2 P0.
   Reject or warn on patient identifiers, clinical details tied to individuals, MRNs, names, and any content that would make the app HIPAA-exposed.

5. Human review remains explicit.
   Patient-facing, clinical, billing, and evidence-sensitive outputs require clinician or operator review.

6. Show the work without making the user read the math.
   The primary UI should explain the recommendation in plain language. Method trace and scoring remain available behind a disclosure.

## Initial Pain Paths

P0 should support five guided paths plus a custom path.

| Path ID | User-facing path | Initial recommendation focus |
|---|---|---|
| `referrals` | Grow or manage my referral network | Prioritize referral sources, draft follow-ups, manage outreach cadence |
| `research` | Keep up with latest medical research in my specialty | Weekly digest, relevance ranking, evidence caveats, review queue |
| `admin` | Reduce administrative overload | Request triage, message drafts, checklists, repetitive workflow cleanup |
| `capacity_growth` | Plan capacity, pricing, or growth | Capacity-aware growth action, pricing decision support, workload tradeoffs |
| `follow_up` | Improve patient follow-up consistency | Follow-up checklists, reminder categories, unresolved task tracking |
| `custom` | Add my own challenge | Classify into closest path or generate custom candidate tasks with lower confidence |

## P0 Product Loop

```text
1. User enters via hybrid first screen.
2. User selects a pain path or describes the pain in chat.
3. App captures goal, severity, frequency, time burden, risk tolerance, AI comfort, and data readiness.
4. App retrieves candidate use cases and prompt templates from the curated library.
5. App generates or adapts at least three candidate tasks.
6. App scores candidate tasks on impact, feasibility, risk, data readiness, adoption friction, and effort.
7. App recommends one task to try first.
8. App generates a starter solution.
9. App captures a baseline metric.
10. App saves the recommendation to history.
```

## P0 Scope

| ID | Feature | Required behavior |
|---|---|---|
| P0-01 | Hybrid entry | `/app` shows chat composer and five pain cards plus custom |
| P0-02 | Pain intake | User can choose path, describe challenge, set goal, and answer no more than five lightweight scoring questions before recommendation |
| P0-03 | Use case library | Repo-local curated library exists for all five pain paths |
| P0-04 | Prompt library | Repo-local prompt templates exist for each path and can be referenced in the recommendation |
| P0-05 | Candidate task identification | Engine returns at least three candidate tasks for each recommendation |
| P0-06 | Task scoring | Engine scores tasks with a transparent trace |
| P0-07 | AI Task Recommendation | Output recommends one task, explains why, and includes guardrails |
| P0-08 | Starter solution | Output includes prompt, checklist, SOP, tool guidance, or human-only guidance |
| P0-09 | Baseline capture | App captures current time burden, frequency, confidence, frustration, and current workaround |
| P0-10 | Recommendation history | Recommendation is saved per user and visible later |
| P0-11 | Safety guardrails | No-PHI warnings/rejections and human-review copy are enforced |

## P1 Scope

| ID | Feature | Required behavior |
|---|---|---|
| P1-01 | Check-in loop | User can report whether the starter solution helped |
| P1-02 | Status lifecycle | Recommendation status supports `planned`, `tried`, `active`, `improve`, `retired` |
| P1-03 | Impact summary | App shows estimated time saved and active recommendations |
| P1-04 | Library filtering | In-app library can be browsed by path, task type, risk level, and implementation level |
| P1-05 | Recommendation refinement | User can edit selected task or ask for alternatives |

## P2 Scope

| ID | Feature | Required behavior |
|---|---|---|
| P2-01 | Skill generation | User can promote a useful prompt/checklist into a Claude Code or Codex skill |
| P2-02 | Plugin generation | User can promote a bounded multi-step workflow into a plugin scaffold |
| P2-03 | Agent blueprint | User can see an agent plan for workflows needing state, schedule, or integrations |
| P2-04 | Weekly workflow audit | App recommends keep, improve, advance, or retire for active recommendations |
| P2-05 | Connected workflows | App can connect safe non-PHI data sources where appropriate |

## Primary Output Contract

The P0 output is `AiTaskRecommendation`.

Required fields:

| Field | Purpose |
|---|---|
| `selectedPainPath` | Which pain path the recommendation belongs to |
| `challengeSummary` | Plain-language summary of the user's problem |
| `goal` | Desired improvement |
| `candidateTasks` | At least three tasks considered |
| `recommendedTask` | One best task to try first |
| `recommendedApproach` | Existing tool, prompt, checklist, skill, plugin, agent, or human-only |
| `whyThisTask` | Plain-English rationale |
| `starterSolution` | Usable prompt, checklist, SOP, tool guide, or scaffold placeholder |
| `guardrails` | Privacy, safety, review, and evidence boundaries |
| `tryThisWeek` | Concrete first actions |
| `successMetric` | What the user should track |
| `adoptionPathway` | Prompt -> checklist -> skill -> tool/plugin -> agent, where relevant |
| `confidence` | Confidence label and score, if appropriate |
| `methodTrace` | Scoring and selection trace for "show the math" |

## Candidate Task Scoring

P0 scoring criteria:

| Criterion | Meaning |
|---|---|
| Pain severity | How important or frustrating the pain is |
| Frequency | How often the task occurs |
| Time burden | Weekly time consumed |
| Business impact | Effect on revenue, referrals, capacity, quality, or experience |
| AI fit | Whether AI can draft, summarize, classify, extract, route, recommend, or monitor |
| Risk | Privacy, clinical, compliance, trust, and quality risk |
| Data readiness | Whether safe information is available |
| Adoption friction | Whether the user can realistically try it now |
| Setup effort | How much work is needed before first value |

Recommendation should favor high-impact, low-risk, low-friction tasks for the first win.

## Use Case And Prompt Library Requirements

P0 library must be curated and repo-local AND searchable via full semantic search.

Minimum library content:

- At least five use cases per pain path.
- At least three prompt templates per pain path.
- Each use case must include path, task name, user pain, AI capability, data needed, guardrails, first metric, and recommended starting level.
- Each prompt template must include path, task, instructions, required inputs, output format, safety notes, and review requirements.

Library can later move into the database, but P0 should avoid database-managed authoring.

### Semantic search over the AI-adoption corpus (clarification 2026-05-11)

The library page must combine **curated content (hand-authored use cases and prompts in `lib/library/`)** AND **semantic search over the AI-adoption corpus already populated by the Railway crawler/KG pipeline** (`corpus_documents`, `corpus_embeddings`, `ai_entities`, `ai_relationships`).

Users — including guests — must be able to issue a free-text query against the corpus and get ranked results back. The `/api/search` hybrid pipeline (BM25 + vector + KG + RRF + BGE rerank) is the wire format; `/app/library` is the user surface.

Specific requirements:

- A search input at the top of `/app/library` accepts a free-text query and dispatches to `/api/search`.
- Results are presented in the same card list as the curated content. Source (curated vs corpus) is shown as a small chip on each card.
- Filter chips (path / approach / risk / level) apply to both sources where the metadata is present.
- Guests can search the global-scope corpus. RLS on `corpus_documents` naturally narrows their results because their `app.current_user_id` GUC is unset; only `scope='global'` rows return. The `/api/search` endpoint must accept guest cookies; persisted observability rows in `ai_search_queries` get a synthetic guest user id.
- The ⌘K Command Palette remains for power users (Cmd+K). It is not the primary search surface — the dedicated `/app/library` search bar is.

This means the existing F-31 hybrid-search infrastructure is now a P0 dependency, not a P1+ enhancement. The seam to the crawler-fed corpus is already shipped (`/api/search` route, ranking pipeline, RLS, observability). What's missing is the UI surface that exposes it.

## Success Criteria

P0 is successful when:

- User can start from chat or a pain card.
- User can receive a recommendation without selecting one of the old three decision templates.
- Every pain path can produce at least three candidate tasks and one top recommendation.
- Every recommendation includes a starter solution and a success metric.
- The recommendation includes guardrails and "show the math" details.
- Recommendation history persists per user with RLS isolation.
- The use case and prompt library are visible in app, not only hidden in engine code.
- Skills/plugins are not required for a successful first-session outcome.

## Non-Goals For P0

- Do not require skill/plugin generation.
- Do not connect to EHR, email, calendar, billing, or patient systems.
- Do not ingest PHI.
- Do not generate clinical advice.
- Do not attempt full workflow automation.
- Do not replace the existing capacity/pricing/admin decision templates; preserve them as secondary paths.

## Adoption Pathway — Engine-Gated Promotion (clarification 2026-05-11)

The `adoptionPathway` field in the primary output contract is **engine-determined**, not a generic five-rung ladder always offered. The engine must decide which rungs (prompt / checklist / skill / plugin / agent) actually fit the recommended task before any builder CTA is surfaced.

Builder prompts and tools (prompt-builder, skill-builder, agent-builder) are invoked **only when the engine concludes the workflow benefits from that rung**. Users do not see "Build a plugin" as a standalone CTA.

### Engine output shape

`adoptionPathway` is a structured field:

```ts
adoptionPathway: {
  rungs: Array<{
    kind: "prompt" | "checklist" | "skill" | "plugin" | "agent";
    label: string;            // user-facing rung name
    rationale: string;        // one-sentence "why this rung fits this task"
    confidence: number;       // 0..1 — engine's confidence this rung helps
    builderHandoff?: {        // structured payload for the builder tool
      builder: "prompt-builder" | "skill-builder" | "agent-builder" | "inline";
      seed: Record<string, unknown>;  // task, guardrails, success metric, context
    };
    state: "auto-generated" | "user-prompted" | "not-recommended";
  }>;
}
```

Rungs with `state: "not-recommended"` are omitted from the UI. Rungs with `state: "auto-generated"` ship a starter artifact alongside the recommendation. Rungs with `state: "user-prompted"` surface a CTA but require user action.

### Engine promotion criteria (new stage)

A new engine stage (`lib/engine/stage8-promotion.ts`) maps task properties to the recommended rungs:

| Task property | Triggers rung |
|---|---|
| One-shot or rarely-repeated | prompt only |
| Repeatable but ad-hoc, no tooling required | prompt + checklist |
| Benefits from scaffolding inside a coding tool (Claude Code / Cursor / etc.) | + skill |
| Needs scripts, MCP tools, or structured outputs the user calls more than once | + plugin |
| Needs autonomy, schedule, persistent state, multi-step orchestration | + agent |

Each criterion lifts the previous rungs (skill implies prompt+checklist were also fit). The engine never offers a higher rung without offering the supporting lower rungs.

### Implication for builder integration

Because builders fire only after engine gating, the build cost of the promotion surface drops:

- Decision Doctor does not need a generic "Builder Hub" page.
- The recommendation detail page surfaces an `<AdoptionPathwayPicker>` showing only engine-emitted rungs.
- Each CTA dispatches the rung's `builderHandoff` payload to the corresponding server-side builder prompt (re-implemented in `lib/builders/`, since the canonical builders are Claude Code skills and cannot be invoked from a deployed Next.js app).
- Failed builder runs (artifact rejected by the Architecture rubric checklist) return to the user with a structured diagnostic. No artifact lands in the catalog unless it passes the quality gate.

### Routing

- `/app/recommendations/[id]` renders `<AdoptionPathwayPicker>` inline.
- Clicking a rung CTA either (a) shows the auto-generated artifact in-place (`state: "auto-generated"`), or (b) invokes the builder and routes to a result view.
- `/app/skills` becomes the catalog of generated artifacts, indexed by recommendation id. Guests cannot promote (no user_id); the "Sign in to save" handoff already shipped on `/app/decisions/guest-preview` is the pattern.

### Non-goals (P0)

- Do not offer manual builder invocation outside the recommendation flow. The builder tools are not a general-purpose surface; they are recommendation-derived.
- Do not let users override the engine's rung selection in P0. P1 may add a "Show advanced rungs" disclosure for power users who want to force-promote a task the engine flagged as prompt-only.

## Assumptions

- Healthcare wedge remains primary.
- Self-reported baseline metrics are enough for P0.
- Curated library quality matters more than breadth.
- Existing MCDA engine can be adapted or wrapped for task scoring.
- Existing `decisions` table should not be overloaded unless migration cost blocks the first pass.

## Open Questions

- Should `custom` path recommendations save with lower confidence until reviewed by the user?
- Should the first recommendation show candidate tasks before the top recommendation, or collapse them under "show the work"?
- Should prompt library content be editable by the user in P1, or remain curated until P2?
- Should baseline capture happen before or after the recommendation result?

## Claude Code Execution Notes

For the next implementation pass:

1. Build recommendation quality first.
2. Add library data and recommendation output before skill/plugin generation.
3. Preserve existing decision templates and routes.
4. Do not remove `docs/PRD.md` until this V2 PRD is reviewed.
5. Treat no-PHI, RLS, auth, rate limit, and auditability as non-negotiable constraints.
