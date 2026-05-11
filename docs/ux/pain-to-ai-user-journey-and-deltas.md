---
title: Pain-to-AI User Journey And Current Approach Deltas
status: planning
created: 2026-05-11
companion_prd: ../product/PRD-v2-pain-to-ai-recommendation.md
companion_architecture: ../architecture/pain-to-ai-recommendation-architecture.md
---

# Pain-to-AI User Journey And Current Approach Deltas

## Objective

Define the V2 user journey for a recommendation-first Decision Doctor experience.

The user-facing priority is:

```text
get a useful AI Task Recommendation first
track whether it helped second
turn it into a skill/plugin later
```

## Current User Journey

Current app behavior is closer to:

```text
sign in -> chat or choose decision template -> collect structured fields -> run MCDA -> show recommendation and workload reducers -> optionally open scaffold
```

Current strengths:

- Chat is already a natural front door.
- Decision detail UI already explains recommendation, fallback, actions, and method trace.
- The app already has history, skills, and audit navigation.
- The scaffold viewer pattern exists.

Current mismatch:

- First session can feel like a decision-template workflow instead of an AI adoption strategist.
- The app does not yet show a visible use case and prompt library.
- The output is too close to "decision plus reducers" instead of "one AI task to try now".
- Skills/plugins can appear before the user has validated that the recommendation is useful.

## Target User Journey

### Journey Overview

```text
1. User opens app.
2. User chooses chat or a pain card.
3. User describes challenge and goal.
4. App asks lightweight prioritization questions.
5. App identifies candidate AI tasks.
6. App recommends one task to try first.
7. App gives starter solution.
8. User captures baseline.
9. User tries the solution.
10. App checks in and recommends keep, improve, advance, or retire.
```

## Screen 1 - Hybrid First Screen

Route: `/app`

Purpose:

- Let confident users type their pain directly.
- Let unsure users choose a guided pain path.

Required UI:

- Primary composer: "What do you want AI to help with first?"
- Five guided pain cards:
  - Grow or manage my referral network
  - Keep up with latest medical research in my specialty
  - Reduce administrative overload
  - Plan capacity, pricing, or growth
  - Improve patient follow-up consistency
- Custom challenge card.
- Link to library: "Browse use cases and prompts".
- Link to existing structured decisions: "Need capacity, pricing, or hiring math?"

Success criteria:

- User can start without knowing the current template names.
- User can pick a path in one tap.
- User can still use chat as the fast path.
- Existing structured decision flow remains reachable.

## Screen 2 - Pain Path Intake

Route options:

- `/app` chat conversation.
- Future route: `/app/recommendations/new?path=...`.

Purpose:

- Capture enough signal to recommend a task without creating a heavy workflow workshop.

Required inputs:

- Challenge description.
- Desired improvement.
- Current workaround.
- Frequency.
- Time burden.
- Pain severity.
- Risk tolerance.
- AI comfort.
- Data availability.

The app should ask no more than five lightweight questions before the first recommendation. If a field is missing, use reasonable defaults and record the assumption in the method trace.

Success criteria:

- User does not need to understand AI tools.
- User does not need to map a full workflow.
- User never needs to provide PHI.

## Screen 3 - Candidate Tasks

This can be a visible step or collapsed under "show the work" depending on implementation speed.

Purpose:

- Show that the app considered multiple tasks, not just one generic answer.

Required content:

- At least three candidate tasks.
- AI fit for each task.
- Risk level for each task.
- Starting approach for each task.
- Why non-selected tasks ranked lower.

Recommended P0 UI:

- Show top recommendation first.
- Put other candidate tasks below as "Other tasks considered".
- Do not force the user to choose among candidates unless confidence is low.

Success criteria:

- User understands why this task is first.
- User can override or ask for alternatives if the recommendation feels wrong.

## Screen 4 - AI Task Recommendation

Route: `/app/recommendations/[id]`

Purpose:

- Deliver the first useful result.

Recommended layout:

```text
Tier 1: Recommended first task
Tier 2: Why this task first
Tier 3: Starter solution
Tier 4: How to try it this week
Tier 5: Success metric and baseline
Tier 6: Show the work
```

Required sections:

- Selected pain path.
- Specific task to improve.
- Recommended AI approach.
- Starter solution.
- Guardrails.
- Try this week.
- Success metric.
- Adoption pathway.
- Candidate tasks considered.
- Method trace.

Success criteria:

- User can act on the result without building a skill/plugin.
- User can copy or use the starter solution immediately.
- User sees what to measure.
- User understands guardrails.

## Screen 5 - Use Case And Prompt Library

Route: `/app/library`

Purpose:

- Make AI adoption concrete by showing practical use cases and prompt templates.
- Give the recommendation engine a visible source of truth.

Required UI:

- Filter by pain path.
- Filter by approach: prompt, checklist, SOP, existing tool, skill, plugin, agent, human-only.
- Search by task name or pain language.
- Use case card with:
  - task name,
  - problem solved,
  - AI capability,
  - data needed,
  - risk level,
  - first metric,
  - recommended starting level.
- Prompt card with:
  - task,
  - required inputs,
  - prompt body,
  - output format,
  - safety notes,
  - copy action.

P0 library can be read-only. Editing and user-created prompts can wait.

Success criteria:

- User can browse useful examples without starting a recommendation.
- Recommendation outputs can link back to library items.
- Library content reinforces why the recommendation is practical.

## Screen 6 - Baseline And Check-In

Baseline capture should appear at the end of recommendation flow or as a persistent action on the recommendation detail page.

Baseline fields:

- Current time spent.
- Current frequency.
- Current confidence.
- Current frustration.
- Current workaround.

Check-in options:

- Saved time.
- Improved quality.
- Reduced frustration.
- Helped me act.
- Not useful.
- I did not try it yet.

Follow-up actions:

- Keep using.
- Improve prompt/checklist.
- Try another starter solution.
- Advance to skill/plugin.
- Retire.

Success criteria:

- User can record impact in less than one minute.
- App can show active recommendations and estimated time saved.
- Skill/plugin advancement is based on use, not just initial recommendation.

## Screen 7 - Skills And Plugins

Route: `/app/skills`

Purpose:

- P2 catalog of promoted artifacts.
- Not required for P0 recommendation success.

Required P2 behavior:

- User can promote an active recommendation to a skill/plugin.
- User can see generated artifacts tied to recommendation history.
- User can copy, install, or revisit generated scaffold.

P0 treatment:

- Keep `/app/skills` as a future or empty-state route.
- Do not make the first recommendation depend on this route.

## Screen 8 - Audit

Route: `/app/audit`

Purpose:

- P1/P2 impact and workflow review.

Required later behavior:

- Show recommendations due for check-in.
- Show active recommendations.
- Show estimated time saved.
- Recommend keep, improve, advance, or retire.

P0 treatment:

- Can remain a stub or point to recommendation history.

## Deltas From Current Approach

| Area | Current approach | V2 target |
|---|---|---|
| First screen | Chat/search and recent decisions | Chat/search plus five pain cards and library link |
| Entry model | User describes a decision or picks template | User picks pain path or describes AI implementation pain |
| Main output | Structured decision recommendation with workload reducers | AI Task Recommendation with starter solution |
| Template dependency | Capacity/pricing/admin-hire drive flow | Five pain paths drive flow; templates stay secondary |
| Library | Not a visible product surface | In-app use case and prompt library is P0 |
| Candidate tasks | Mostly implicit in workload reducers | Explicitly generated and scored |
| Skills/plugins | Prominent in output/scaffold flow | Deferred promotion after recommendation is useful |
| Tracking | Audit page is stub | Baseline and check-in become P1 |
| History | Decision history | Recommendation history plus existing decisions |
| Safety | No-PHI and method trace present | Same constraints, applied to recommendation flow |

## UI Impact Summary

Required P0 UI changes in a later implementation pass:

- Update `/app` to show hybrid entry.
- Add pain card component or section.
- Add `/app/library`.
- Add recommendation result page or adapt existing recommendation detail for `AiTaskRecommendation`.
- Add baseline capture component.
- Add "Other tasks considered" section.
- Preserve existing `/app/decisions/*` flows.

Avoid in P0:

- Do not add complex onboarding.
- Do not require full workflow mapping.
- Do not force scaffold generation.
- Do not make the library editable.
- Do not add external integrations.

## UX Success Criteria

The UX is successful when:

- A new user understands what problem the app solves in the first viewport.
- User can start from either chat or a pain card.
- User receives one concrete task recommendation.
- User can copy or use the starter solution immediately.
- User knows what metric to track.
- User sees clear guardrails.
- Skills/plugins are framed as the next level, not the required first step.

## Content Rules

- Use plain language.
- Prefer task-specific copy over AI jargon.
- Do not over-explain MCDA in the main UI.
- Use "show the work" or "show the math" for trace details.
- Do not imply clinical advice.
- Do not ask for patient names, diagnoses, MRNs, or identifiers.
- Make human review explicit for patient-facing or clinical-adjacent text.

## Assumptions

- Hybrid entry is better than either chat-only or card-only.
- First-session value is more important than showing the whole adoption pathway.
- Users will accept self-reported baseline metrics for MVP.
- Library browsing helps users trust the recommendation because it makes the app's practical use cases visible.

## Open Questions

- Should the app show candidate tasks before or after the top recommendation?
- Should custom path recommendations route through the closest pain path or remain explicitly custom?
- Should baseline capture be required before saving the recommendation?
- Should `/app/decisions` be renamed to `/app/history`, or should that wait until recommendations are implemented?

## Claude Code Execution Notes

When implementation begins:

1. Implement the recommendation journey before skills/plugins.
2. Keep existing decision routes working.
3. Build library browsing from the same data the engine uses.
4. Add baseline capture after the recommendation result works.
5. Use current UI primitives and keep the interface simple.
