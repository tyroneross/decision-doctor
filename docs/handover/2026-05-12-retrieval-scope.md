# 2026-05-12 — Retrieval scope (Track A)

## What shipped

Five commits on `main` (between `4647f8a` and HEAD) introduce audience-scoped
retrieval to Aida. Default behavior is **Focused** (AI-adoption content only);
users can opt-in to **Broad** via a per-session toggle.

| Commit | Chunk | Surface |
|---|---|---|
| C1 | schema + classifier + backfill | `drizzle/0014_content_audience.sql`, `lib/audience/{classify,filter}.ts`, `scripts/backfill-content-audience.ts`, `tests/audience-classify.test.ts` |
| C2 | retrieval-leg filter | `lib/ai-knowledge/search/{bm25,vector,kg,title,library}-leg.ts`, `tests/audience-filter.test.ts` |
| C3 | API routes + engine pin | `app/api/{ai-adoption-qa,search,library/search,users/me/search-scope,recommendations}/route.ts`, `lib/engine/orchestrator.ts`, `lib/library/index.ts` |
| C4 | UI toggle + context | `components/SearchScopeToggle.tsx`, `lib/search-scope/context.tsx`, `app/app/ask/page.tsx`, `app/app/library/LibraryPageClient.tsx` |
| C5 | eval + handover | `tests/smb-query-eval.test.ts` (new `ai-adoption-solo-healthcare` category + `EVAL_SCOPE` env var), this doc |

## Locked design decisions (mirrored from plan)

1. **Hard toggle** — single boolean state per user/session; no auto-classifier, no soft boost.
2. **State storage** — `users.search_scope_default text NOT NULL DEFAULT 'focused' CHECK IN ('focused','broad')` + `localStorage 'aida:search_scope'` mirror. Server wins on conflict for authed users.
3. **Tagging schema** — `content_audience(content_type, content_id, audience, source)` normalized junction table; one row per (content_type, content_id, audience). Multi-tag via two rows (e.g. anthropic-news → both `ai-adoption-solo` and `ai-research-general`).
4. **Engine pin** — `/api/recommendations` never reads `audienceScope` from the request; `lib/engine/orchestrator.ts` hardcodes `scope: "focused"` in its `searchLibrary` call.

## What is gated on user input

### 🚨 DB push not executed

`drizzle/0014_content_audience.sql` and `scripts/backfill-content-audience.ts`
are **drafted, committed, but NOT applied to the live Neon dev DB**. The plan's
hard constraint: no `pnpm db:push` against shared infra without explicit OK.

To proceed after review:

```bash
# 1. Apply migration (review SQL first — drizzle/0014_content_audience.sql)
pnpm db:push    # OR pnpm db:migrate if using migrate-mode

# 2. Plan the backfill — prints expected inserts + flagged-for-review rows
pnpm audience:backfill:dry

# 3. Execute (idempotent — re-runs are no-ops via UNIQUE constraint)
pnpm audience:backfill
```

The classifier rules are locked in `lib/audience/classify.ts` and unit-tested.
Re-running the backfill on a corpus that grew between dry-run and live is safe.

### ⚠️ Untested in this dispatch

- **Live IBR scan** of `/app/ask` and `/app/library` in both Focused and Broad
  modes. Requires `pnpm dev` + a populated DB. The toggle component, context,
  and empty-state flip prompts are TS-clean and the existing `library-page.test.ts`
  (35 tests) still passes — but the live render of the pill, the empty-state
  flip, and the localStorage-vs-server hydration sequence have not been
  visually validated.
- **F-31 hybrid-search recall regression** in Broad mode against the ≥0.83
  floor. Requires `DATABASE_URL_APP` + populated corpus; not run in this
  dispatch.
- **SMB eval recall gates**:
  - Focused mode on `ai-adoption-solo-healthcare` (new category, 10 queries):
    target 0.85.
  - Broad mode on the six existing categories: target 0.70 baseline.
  - Run via `EVAL_SCOPE=focused pnpm vitest run tests/smb-query-eval.test.ts`
    and `EVAL_SCOPE=broad ...` once the migration + backfill land.

## Test status

| Suite | Result |
|---|---|
| `pnpm typecheck` | ✅ pass |
| `pnpm lint` | ✅ no new errors (2 pre-existing warnings unrelated to Track A) |
| `tests/audience-classify.test.ts` (16) | ✅ all pass |
| `tests/audience-filter.test.ts` (4) | ✅ all pass |
| `tests/search-library-leg.test.ts` (5) | ✅ all pass (legacy 2-arg call sites still work) |
| `tests/library-page.test.ts` (35) | ✅ all pass |
| `tests/library-search.test.ts` (18) | ✅ all pass |
| `tests/smb-query-eval.test.ts` | ⚠️ deferred — requires DATABASE_URL_APP |

## API surface delta

| Route | Change |
|---|---|
| `POST /api/ai-adoption-qa` | New body field `audienceScope: "focused" \| "broad"` (default `focused`). Forwarded to `/api/search` via internal fetch. |
| `GET /api/search` | New query param `audienceScope`. Orthogonal to the existing `scope` (global/my/both) param. |
| `GET /api/library/search` | New query param `audienceScope`. Response now echoes `audienceScope` for client diagnostics. |
| `GET /api/users/me/search-scope` | **NEW.** Returns `{ scope: "focused" \| "broad" }` for the signed-in user. 401 for guests. |
| `PATCH /api/users/me/search-scope` | **NEW.** Body `{ scope: "focused" \| "broad" }`. Updates `users.search_scope_default`. 401 for guests. |
| `POST /api/recommendations` | **No change to wire format.** Engine retrieval pinned to `focused` server-side; request body never reaches retrieval scope. |

## What `/build-loop:optimize` should target next

Per plan §A7 — sweep Design of Experiments matrix on `smb_recall_focused_at_10`
once the migration + backfill are live and the eval can run. Six variables:

1. **Filter point** — early-leg (current) vs post-fusion vs post-rerank.
2. **Multi-audience semantics** — single-audience focused mode is AND/OR
   identical today; matters when a 3rd audience lands.
3. **Untagged corpus default** — current implementation EXCLUDES untagged
   corpus from Focused (no `content_audience` row → no match via the EXISTS
   sub-query). Optimize should test "include as adoption" vs current
   "exclude" — likely changes recall on the 23 known untagged rows.
4. **Adoption-boost weight in Broad mode** — would a soft boost in Broad
   make the toggle redundant?
5. **Empty-state behavior** — hard-fail (current) vs auto-flip-to-Broad-with-banner.
6. **Rerank top-K-per-leg cap** — 50 vs 100 (existing F-31 knob).

Convergence criterion: recall delta < 0.005 between runs. Hard stop at 4
hours wall-clock. Emit findings to `tests/e2e/findings/_scope_optimize.json`.

## Known follow-ups

- **Plan-critic flagged**: C4 IBR validation deferred. Run once dev server + DB are alive.
- **Plan-critic flagged**: 2 of the 10 new SMB eval queries are marked `expected_coverage: 'gap'` because library coverage isn't there yet. Drop the gap flag when library:seed adds matching content (chart-prep + patient education templates).
- **Coverage check**: `pnpm audience:backfill:dry` should report 23 untagged corpus rows (per the plan's count). Verify the dry-run summary matches before going live.
- **`/api/decisions`** (the decision-engine sibling of `/api/recommendations`) was NOT touched in this dispatch. It also runs retrieval; if it shares the engine-pin policy, an additional pass should mirror the orchestrator's hardcoded `scope: "focused"`.

## Rollback

The migration is purely additive (one column, one table, no destructive
changes). Rollback path:

```sql
-- Drop the table + drop the column.
DROP TABLE IF EXISTS content_audience;
ALTER TABLE users DROP COLUMN IF EXISTS search_scope_default;
```

Application code defaults to `scope: "focused"` everywhere; if the column or
table is missing, the EXISTS sub-query returns zero rows and Focused returns
nothing — Broad would still work (no EXISTS clause). The toggle UI shows
"Focused" disabled until the server endpoint can read the column. Net: a
disabled toggle + empty Focused, not a hard error.

## Provenance

- Plan: `/Users/tyroneross/.claude/plans/curious-sniffing-comet.md`
- Stashed pre-Track-A changes (3 stashes): pain-path engine work, survey
  targetTemplateId additions, chat survey adapter draft. Restorable via
  `git stash list | grep buildloop-tracka`.
- Build-loop dispatch: 2026-05-12 18:00 UTC, single-agent (C1→C5 sequential),
  no parallel implementer fan-out (in-context execution).
