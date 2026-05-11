---
title: Pain-to-AI Recommendation Architecture
status: planning
created: 2026-05-11
source_architecture: ./architecture.md
companion_prd: ../product/PRD-v2-pain-to-ai-recommendation.md
companion_ux: ../ux/pain-to-ai-user-journey-and-deltas.md
---

# Pain-to-AI Recommendation Architecture

## Objective

Add a recommendation-first architecture that can turn a user pain point into one practical AI task recommendation before generating skills, plugins, or agents.

This is a documentation plan only. Do not implement code from this document until explicitly asked.

## Current Architecture

Current live architecture has these major pieces:

- Next.js 16 app shell under `/app`.
- Auth-gated routes:
  - `/app`
  - `/app/chat`
  - `/app/decisions`
  - `/app/decisions/new`
  - `/app/decisions/[id]`
  - `/app/skills`
  - `/app/audit`
- API routes:
  - `/api/chat`
  - `/api/decisions`
  - `/api/templates`
  - `/api/search`
  - `/api/auth/*`
- Engine under `lib/engine`.
- Existing decision template registry with `capacity`, `pricing`, and `admin-hire`.
- Decision outputs persisted in `decisions` JSONB columns.
- Auth, tenant context, and RLS through Better Auth, Neon Postgres, and actor context.
- Workload reducers, AI feasibility, and scaffold generation are already present in the engine/output model.

The current system can run structured decisions. It does not yet have a first-class model for pain paths, use case library retrieval, prompt library browsing, recommendation status, or impact baseline.

## Target Architecture

Add a new recommendation domain beside the existing decision domain.

```text
Current secondary path:
structured template -> MCDA decision -> workload reducers -> optional scaffold

New primary path:
pain path -> library-backed candidate tasks -> task scoring -> AI Task Recommendation -> starter solution -> baseline
```

The existing MCDA path stays available for capacity, pricing, and admin decisions. The new path becomes the first-session product surface.

## Required Architecture Changes

### 1. Domain Model

Add these conceptual domain objects.

| Object | Purpose |
|---|---|
| `PainPath` | Guided entry category: referrals, research, admin, capacity_growth, follow_up, custom |
| `UseCase` | Curated opportunity pattern inside a pain path |
| `PromptTemplate` | Reusable starter prompt tied to a use case or task |
| `CandidateTask` | A task the engine can score and compare |
| `AiTaskRecommendation` | Primary output object for P0 |
| `ImpactBaseline` | User-reported starting metric before trying the recommendation |
| `RecommendationStatus` | Lifecycle state after recommendation is saved |

Suggested TypeScript shapes for planning:

```ts
type PainPathId =
  | "referrals"
  | "research"
  | "admin"
  | "capacity_growth"
  | "follow_up"
  | "custom";

type RecommendationApproach =
  | "existing_tool"
  | "prompt"
  | "checklist"
  | "sop"
  | "skill"
  | "plugin"
  | "agent"
  | "human_only";

type RecommendationStatus =
  | "planned"
  | "tried"
  | "active"
  | "improve"
  | "retired";
```

### 2. Library Layer

Add a curated, repo-local library before adding database authoring.

Proposed location:

```text
lib/library/
  pain-paths.ts
  use-cases.ts
  prompt-templates.ts
  scoring-rubric.ts
```

Do not introduce a new external package for the library. Keep it simple and typed.

Library requirements:

- Use cases cover all five P0 pain paths.
- Prompt templates cover all five P0 pain paths.
- Each library item has stable IDs.
- Each library item includes safety metadata.
- Engine can retrieve items by pain path and tags.
- UI can browse the same library through `/app/library`.

### 3. Recommendation Engine

Add a recommendation-first engine path. It can reuse existing engine utilities, but it should not require a capacity/pricing/admin template.

Proposed module location:

```text
lib/recommendations/
  classify-pain.ts
  retrieve-candidates.ts
  score-candidates.ts
  generate-starter-solution.ts
  orchestrator.ts
  types.ts
```

Target flow:

```text
1. Accept selected pain path or classify chat input into a pain path.
2. Extract challenge summary and goal.
3. Retrieve use cases and prompt templates from library.
4. Generate or adapt candidate tasks.
5. Score candidate tasks.
6. Apply vetoes for PHI, clinical risk, unsafe automation, and data readiness.
7. Select one recommended task.
8. Generate starter solution.
9. Build method trace.
10. Persist recommendation and baseline.
```

Scoring should be deterministic where possible. LLM output may propose or summarize, but TypeScript should compute final scores.

### 4. Skills And Plugins As Deferred Promotion

The current engine can generate scaffolds, but V2 should not make scaffolding the P0 success condition.

New behavior:

```text
P0: generate starter prompt/checklist/SOP/tool guidance
P1: track whether it helped
P2: promote successful item to skill/plugin/agent blueprint
```

Scaffold generation should move behind an explicit "advance this" action:

```text
POST /api/recommendations/[id]/advance
```

Do not run scaffold generation during the first recommendation unless the user explicitly asks for a skill/plugin.

### 5. Persistence

Prefer a new table over overloading `decisions`.

Suggested table: `ai_recommendations`.

Suggested columns:

| Column | Purpose |
|---|---|
| `id` | UUID primary key |
| `user_id` | User owner |
| `tenant_id` | Tenant owner |
| `pain_path` | Selected or inferred pain path |
| `challenge_summary` | Normalized challenge |
| `goal` | Desired improvement |
| `candidate_tasks` | JSONB array |
| `recommendation` | JSONB `AiTaskRecommendation` |
| `starter_solution` | JSONB |
| `baseline` | JSONB `ImpactBaseline` |
| `method_trace` | JSONB |
| `status` | Recommendation lifecycle |
| `created_at` | Timestamp |
| `updated_at` | Timestamp |

RLS requirements:

- Enable RLS.
- Force RLS.
- Select/insert/update only when `tenant_id` matches request actor.
- Use `WITH CHECK` policies.
- Keep audit events for recommendation creation and advancement.

Compatibility plan:

- Keep existing `decisions` table for structured MCDA decisions.
- Do not migrate old decisions into recommendations.
- If UI needs a unified history, create a read-layer that combines decisions and recommendations rather than merging the tables.

### 6. API Routes

Add these routes in the implementation pass.

| Route | Method | Purpose |
|---|---|---|
| `/api/library` | GET | Return pain paths, use cases, prompt templates |
| `/api/recommendations` | POST | Run recommendation engine and persist result |
| `/api/recommendations` | GET | List saved recommendations |
| `/api/recommendations/[id]` | GET | Fetch recommendation detail |
| `/api/recommendations/[id]/baseline` | PATCH | Update baseline |
| `/api/recommendations/[id]/status` | PATCH | Update lifecycle status |
| `/api/recommendations/[id]/advance` | POST | Generate skill/plugin/agent artifact in P2 |

All DB-touching routes must use `export const runtime = "nodejs"`.

### 7. UI Routes

Add or update these app routes.

| Route | Required change |
|---|---|
| `/app` | Hybrid first screen: chat composer plus pain cards |
| `/app/library` | Browse use cases and prompts |
| `/app/recommendations/[id]` | Recommendation detail, starter solution, baseline |
| `/app/skills` | Later: promoted skills/plugins catalog |
| `/app/audit` | Later: impact tracking and workflow audit |
| `/app/decisions/*` | Preserve existing structured decision flow |

Avoid breaking existing decision URLs.

### 8. Safety And Trust Boundaries

Preserve current security posture.

Required constraints:

- No PHI in P0.
- Reject or warn on patient identifiers.
- No clinical advice.
- Patient-facing material requires clinician review.
- Method trace must explain why the task was selected.
- Human-only recommendations must be allowed when AI is unsafe or low-value.
- RLS must protect all persisted recommendation data.
- Audit events must record recommendation runs, model calls, and advancement actions.

## Architecture Deltas From Current Approach

| Current approach | V2 target |
|---|---|
| Three structured templates lead the flow | Five pain paths plus custom lead the flow |
| Chat routes user into capacity/pricing/admin-hire | Chat can create a library-backed AI Task Recommendation |
| `decisions` is the primary persisted object | `ai_recommendations` becomes primary for V2 recommendations |
| Workload reducers are attached to MCDA decision output | Starter solution is the primary output |
| Skill/plugin scaffold is prominent | Skill/plugin scaffold is a later promotion action |
| Use cases are implicit in prompts/templates | Use cases and prompts are a visible library |
| Audit page is future stub | Audit becomes impact/check-in loop |

## Implementation Phases

### Phase 1 - Documentation and Library Design

- Land this documentation set.
- Define library item schemas in the architecture plan.
- Do not change runtime code.

### Phase 2 - Recommendation P0

- Add library data.
- Add recommendation engine.
- Add `/api/library` and `/api/recommendations`.
- Add `/app/library`.
- Update `/app` hybrid entry.
- Add recommendation result page.

### Phase 3 - Impact Tracking

- Add baseline/status updates.
- Make `/app/audit` useful.
- Add keep/improve/advance/retire flow.

### Phase 4 - Skills And Plugins

- Add advancement endpoint.
- Wire scaffold generation from saved recommendation.
- Make `/app/skills` catalog promoted artifacts.

## Acceptance Criteria

Architecture is ready when:

- The next builder knows whether to create a new table or reuse `decisions`.
- The next builder knows which route owns library browsing.
- The next builder knows that recommendation generation must not depend on skill/plugin generation.
- The next builder can implement candidate retrieval and scoring from a repo-local library.
- Existing structured decision templates remain intact.
- Security constraints are explicit and testable.

## Assumptions

- New `ai_recommendations` table is worth the migration because recommendations are not equivalent to structured decisions.
- Repo-local library is better for P0 than database authoring.
- Current scaffold generator can be reused later, but should not run by default in the P0 recommendation path.
- Existing `/api/search` and corpus work are not required for P0 library browsing.

## Open Questions

- Should `/app/recommendations` become a top-level history surface, or should recommendations appear inside `/app/decisions` history?
- Should candidate task scoring reuse existing MCDA stages or use a simpler recommendation-specific scorer?
- Should the recommendation route support guest mode, or require signed-in users only?
- Should the library source be TypeScript modules or markdown/JSON files?

## Claude Code Execution Notes

When implementation begins:

1. Add tests around the library and scorer before adding UI.
2. Keep new recommendation code in a separate domain module.
3. Do not remove or rewrite the existing MCDA engine.
4. Do not generate skills/plugins during the first recommendation flow.
5. Preserve RLS, actor context, and Node runtime on DB routes.
