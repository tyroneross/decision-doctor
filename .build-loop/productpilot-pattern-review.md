# ProductPilot Pattern Review

## Bottom line

ProductPilot has useful interaction mechanics, but its output strategy is too
heavy for Decision Doctor Branch C.

Decision Doctor should borrow:

- One high-leverage question at a time.
- Chip suggestions that fill a draft answer.
- Visible inferred assumptions with confidence and challenge controls.
- Testable client/server boundaries where the client can be mocked and the
  server owns validation.

Decision Doctor should not borrow:

- The full survey wizard.
- The method-router prompt stack.
- The structured spec generation pipeline.
- Multi-document generation controls.

Those ProductPilot pieces optimize for coding-agent handoff. Decision Doctor P0
optimizes for a solo practitioner making one bounded business decision without
PHI.

## ProductPilot source review

Files inspected read-only:

- `/Users/tyroneross/dev/git-folder/ProductPilot/client/src/components/adaptive-intake.tsx`
- `/Users/tyroneross/dev/git-folder/ProductPilot/server/services/intake-controller.ts`
- `/Users/tyroneross/dev/git-folder/ProductPilot/client/src/pages/session-survey.tsx`
- `/Users/tyroneross/dev/git-folder/ProductPilot/shared/prompts/intake/*.ts`
- `/Users/tyroneross/dev/git-folder/ProductPilot/server/test/*intake*.test.ts*`
- `/Users/tyroneross/dev/git-folder/ProductPilot/docs/superpowers/plans/2026-05-02-adaptive-intake-and-spec-generation.md`

## Branch C application

Applied a smaller deterministic version:

- `/app` now posts to `/api/guide`.
- `/api/guide` returns the matching intake path plus one primary intake anchor.
- The UI shows answer chips, a scratch answer box, safe inferred assumptions,
  and Challenge/Keep controls.
- No model call, no database write, no ProductPilot survey/spec machinery.

## Rationale

The ProductPilot adaptive controller is strong where it narrows a broad product
idea into a better next question. Decision Doctor already has three bounded
templates, so the right improvement is not a new router. The useful improvement
is making the handoff into the template feel guided and inspectable before the
user starts the real intake.
