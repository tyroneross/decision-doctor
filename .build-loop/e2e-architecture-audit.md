# Branch C E2E and Architecture Audit

## Bottom line

Branch C now has a working no-PHI guide loop:

1. `/app` renders `components/decision-guide`.
2. The guide posts the question and AI comfort level to `/api/guide`.
3. `/api/guide` validates with `DecisionGuideRequestSchema`.
4. `lib/decision-guide.ts` classifies the question locally and returns the
   recommended structured intake path.
5. The user can continue into `/app/decisions/new/capacity`,
   `/app/decisions/new/pricing`, or `/app/decisions/new/admin-hire`.

This workflow does not call Groq and does not write to the shared database.

## Persona simulation

Low AI maturity:

- Question: exhausted owner, growing waitlist, unsure whether to keep accepting
  new intakes.
- Result: routes to capacity, uses short plain-language steps, and emphasizes
  counts/categories only.

Moderate AI maturity:

- Question: raise fee vs keep prices stable while taking insurance.
- Result: routes to pricing and frames the intake as a small tradeoff.

High AI maturity:

- Question: admin work, calls, billing, hire vs automate.
- Result: routes to admin-hire and points the user toward the method trace.

PHI-shaped question:

- Result: blocks guidance and asks the user to remove patient-specific details.

## E2E evidence

- `curl -I http://127.0.0.1:3100/app`: 200 OK.
- `curl -I http://127.0.0.1:3000/app`: 404 from another checkout, confirming
  Branch C tests must use port 3100.
- `/api/guide` persona POST checks passed for capacity, pricing, admin-hire,
  and PHI-shaped clarification.
- `ibr test --file .ibr-tests/app-guide.ibr-test.json --output-dir
  .ibr/test-results --json --headless`: 1 test, 1 passed.
- `python3 .../ibr_quickpass.py --workdir ... --scope changed`: ran 1, passed
  1, failed 0. Its `untested_surfaces` field still lists
  `app/(app)/app/page.tsx` because quickpass reads only top-level string
  metadata while the IBR runner requires top-level page suite objects.
- `ibr scan http://127.0.0.1:3100/app --json --output summary --wait-for
  .decision-guide --timeout 60000`: reached the page, found no console errors
  and no layout collisions, but returned handler-integrity errors for React
  delegated form buttons. The direct IBR workflow test proved those buttons are
  actionable, so this is treated as an IBR scan false positive for React event
  delegation rather than a product blocker.

## Architecture evidence

NavGator refreshed after the client guide fix:

- Components found: 94.
- Connections found: 121.
- Prompts found: 1.
- Scan verdict: accept.
- New guide connection path:
  `app/(app)/app/page.tsx` imports `components/decision-guide`;
  `components/decision-guide` fetches `/api/guide`;
  `/api/guide` imports `lib/decision-guide`;
  `lib/decision-guide` imports `shared/schema` for template IDs and PHI guard.
- LLM map remains isolated to `lib/groq.ts`; the guide does not introduce a new
  model prompt or provider call.

Rules review:

- Existing NavGator errors are the same shared-schema layer inference findings
  on `api/decisions/*` importing `shared/schema`.
- The guide route was not added to those errors.
- Hotspots remain `shared/schema`, `engine/types`, `db/schema`, and `db/actor`;
  this guide only reads the shared contract and does not alter those hotspot
  files.

## Shared dependency hold

No shared DB migrations, resets, or DB-writing smoke tests were run. This keeps
Branch C aligned with the user instruction to wait on common database
dependencies from the other active build-loop branches.
