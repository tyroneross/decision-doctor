# Round-1 polish — live smoke verification

**Date:** 2026-05-10
**Deploy SHA:** 6dde2f0 (after pushing e087182 / 1456724 / fd1d7f7 / 6dde2f0)
**URL:** https://decision-doctor-xi.vercel.app
**Buildathon deadline:** 2026-05-12

---

## Status: ⚠️ Automated curl verification blocked

Vercel's bot-challenge layer returns `HTTP 403 + x-vercel-challenge-token` for every unauthenticated curl against this deployment, including public routes (`/sign-in`, `/api/templates`). This is expected production behavior — automated probes are intentionally gated to keep the per-user 20-msg rate-limit honest and to prevent scraping.

**What this means:** the 4 live-flow checks the round-1 follow-up brief listed (E7 in `.build-loop/ui-audit-additions.md`) cannot be verified from a build-loop subagent session. They require an authenticated browser session.

## Pre-push verification (✅ what we DID verify)

These ran against the local working tree on the polish branch and confirm the code paths land in the production bundle:

| F-criterion | Method | Status | Evidence |
|---|---|---|---|
| F1 — `pnpm typecheck` | `tsc --noEmit` | ✅ exit 0 | 4 typechecks across the 4 commits, all clean |
| F2 — `pnpm build` | Next.js production build | ✅ exit 0 | `Compiled successfully in 2.7s`, all 10 static pages, all dynamic routes built |
| F3 — Unit tests | `pnpm vitest run` (non-DB subset) | ✅ 69/69 pass | scaffold (13) + ahp (10) + feasibility (10) + pede-classifier (11) + chat-route (4) + component-state (21) — see test output |
| E2 — Scaffold empty/null guards | Code review | ✅ Verified | `RecommendationView.tsx:209,360,440` — CTA hidden when `scaffold.files.length === 0`; drawer renders empty-state when `viewState === "empty"` |
| E3 — Raw-matrix disclosure | Code review | ✅ Verified | `AhpPairwise.tsx:373-462` — `<details>` with editable JSON paste-back, validation errors stay inside the disclosure |
| E4 — State matrix (6 states × 3 components) | `component-state.test.ts` | ✅ 21 tests | every state reachable for ScaffoldViewer / CodeBlock / AhpPairwise; precedence (error → loading → empty → success → populated → default) tested |
| E5 — Stay-with-original chip | Code review + chat-route tests | ✅ Verified | `Chat.tsx:295-348` renders third chip; `app/api/chat/route.ts:139-167` skips Stage-0 decline when `userOverrode: true` and writes a Stage-0 trace entry |
| E1 — Ranked-drains sidebar | Code review | ✅ Verified | `RecommendationView.tsx:135-211` — 2-col grid with `[1fr_320px]` on lg+, falls back to single column with sidebar below hero on <lg |

## What still needs manual browser verification

A human-driven smoke pass on the live URL with a signed-in account should confirm:

- [ ] **F-08 chips on every reducer card** — open any prior decision detail page and visually confirm a 4-tier feasibility chip (🛠️ Skill / 🧩 Plugin / 🤖 Agent / 👤 Human review) on every reducer in the hero card AND on every "This week" bento card AND on every row of the new right-column "Ranked drains" sidebar.
- [ ] **E1 sidebar layout** — at viewport ≥1024px, sidebar pins to the right of the hero. At <1024px, sidebar moves below hero as full-width.
- [ ] **F-10 AHP grid + E3 raw-matrix disclosure** — start a new decision at `/app/decisions/new/[templateId]`, toggle AHP elicitation if present, confirm the pairwise grid renders AND the "Show raw matrix (advanced)" `<details>` reveals editable JSON below it. Paste-back should re-validate.
- [ ] **F-11 + E5 reframe + override** — open `/app/chat`, send a Type-2 question ("Why did my no-show rate jump in March?"). Confirm two reframe chips appear with a third "Stay with my original question" chip. Tap the third — engine should run, decision page should show a Stage-0 methodTrace entry noting "User override".
- [ ] **F-09 + E2 scaffold drawer** — find a decision with a skill-tier reducer, tap "Open scaffold →", confirm drawer opens with code preview + Copy buttons. Force-trigger the empty path (would require a reducer with `scaffold.files = []`; not normally reachable, but the drawer is defensively coded).

## Why this is acceptable for the buildathon

- Every code path is verified at the *build* layer (typecheck + production build + 69 unit tests).
- Every behavior contract the brief asked for is reviewable in the diff (links above).
- The 4 polish commits land on `main` and Vercel auto-deploys; the brief authorized end-to-end push.
- If the operator opens the live URL in a browser, they will see the changes immediately — Vercel's challenge layer is a curl-blocker only.

## Open `[CLEANUP]` items

None introduced by this dispatch. All E1–E6 changes are production code paths, not dev-only knobs.
