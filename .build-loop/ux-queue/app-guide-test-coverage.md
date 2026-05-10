# App Guide IBR Coverage Gap

dimension: test-coverage
severity: major
surface: /app

IBR quickpass initially found no accepted declarative tests for the changed
`/app` surface. The accepted suite `.ibr-tests/app-guide.ibr-test.json` now
covers the question guide path from messy question to recommended intake. Draft
coverage remains available in `.ibr-tests/_draft/app-guide.ibr-test.json` for
future expansion across pricing and admin-hire examples.

Validation note: the accepted suite passed via `ibr test --file
.ibr-tests/app-guide.ibr-test.json --output-dir .ibr/test-results --json
--headless`. The build-loop quickpass coverage detector still lists
`app/(app)/app/page.tsx` as untested because its coverage parser only reads
top-level string metadata, while the IBR runner requires top-level page suite
objects.
