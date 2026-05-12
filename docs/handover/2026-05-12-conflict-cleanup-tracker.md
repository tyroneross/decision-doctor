# 2026-05-12 Conflict Cleanup Tracker

## Current status

- Active merge conflict markers: none found with `rg "^<<<<<<<|^=======|^>>>>>>>"`.
- Git unresolved-conflict files: none found with `git diff --name-only --diff-filter=U`.
- Main risk is no longer conflict blocks. Main risk is validating a large dirty worktree before adding observability or Arize work.
- Dirty scope at tracker creation: 38 modified tracked files, 3 untracked files.
- Previously risky files from the active conflict state: `package.json` and `lib/db/schema.ts`. Both should still be checked during validation because they can break install/build/schema behavior even after markers are removed.

## Validation log

- `package.json` parses as valid JSON.
- `git diff --check` passes.
- `pnpm typecheck` passes.
- `pnpm lint` passes with 13 warnings, all unused eslint-disable warnings in existing route/test files.
- `pnpm exec vitest run tests/api-recommendations.test.ts tests/v2-routes-smoke.test.ts tests/qa-grounding.test.ts` passes: 3 files, 102 tests.

## Objective for today

Get the repo from "dirty but conflict-free" to a validated baseline that is safe to commit, then defer OpenTelemetry/Arize changes until that baseline is green.

## Plan

1. Confirm conflict-free state.
   - `git status --short --branch`
   - `rg -n "^<<<<<<<|^=======|^>>>>>>>" . --glob '!node_modules' --glob '!dist' --glob '!build' --glob '!coverage'`
   - `git diff --name-only --diff-filter=U`

2. Validate the package and schema surfaces.
   - Parse `package.json`.
   - Review `lib/db/schema.ts` around the recently merged schema additions.
   - Check migration order and whether new route code references schema fields that exist.

3. Categorize the dirty worktree.
   - Group changes into: API/routes, schema/migrations, UI, tests, worker/corpus, generated e2e findings, handover docs.
   - Decide whether generated e2e findings belong in the commit or should be regenerated after tests.

4. Run focused validation.
   - `pnpm typecheck`
   - `pnpm lint`
   - Focused tests for changed surfaces, likely:
     - `pnpm test tests/api-recommendations.test.ts`
     - `pnpm test tests/v2-routes-smoke.test.ts`
     - `pnpm test tests/qa-grounding.test.ts`
   - Status: complete. Prefer `pnpm exec vitest run ...` for non-watch test execution.

5. Fix only validation failures caused by this merge/worktree.
   - Keep unrelated refactors out.
   - Do not add Arize/OpenTelemetry until the baseline is green.

6. Final readiness check.
   - `git status --short`
   - `pnpm typecheck`
   - `pnpm lint`
   - Focused tests green or documented with exact blocker.

## Open decisions

- Whether to keep the generated `tests/e2e/findings/*.json` changes or regenerate/drop them after validation.
- Whether the untracked handover file from `2026-05-10` is intended to be committed.
- Whether `app/api/recommendations/[id]/route.ts` and `lib/guest-identity.ts` are part of the same feature commit or should be separated.

## Next action

Review the remaining unstaged diff by group, then either:

- stage the validated baseline as one recovery commit, or
- split into two commits: functional code/schema first, generated findings/handover docs second.

## Stop rule

Do not install Arize skills, add OpenTelemetry packages, or modify prompt instrumentation until the current worktree is conflict-free and validation has either passed or produced a small, understood blocker list.
