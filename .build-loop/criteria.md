# F-criteria — Branch B (PRD §5)

| ID | Criterion | Verification |
|----|-----------|--------------|
| T-01 | User reaches intake form in ≤3 taps from `/app` landing | IBR scan tap-counts; click chain <= 3 |
| T-02 | Each template form ≤7 fields, Zod-validated, no PHI-plausible free-form (max 200 chars), IndexedDB persistence survives page reload | Vitest count fields per template; reload test on intake page |
| T-03 | Engine returns full DecisionOutput shape: 1 rec + ≥2 alternatives + ≥1 elimination reason per alternative + confidence 0–100 + 1 robust alternative + methodTrace covering Stages 1–5 + ≥3 workloadReducers; **p95 < 6s** | Vitest contract test on `runDecision()`; latency from server log over 20 runs |
| T-04 | Recommendation visible above fold at 375px viewport; alternatives + reasons in expandable; confidence color-coded (green ≥75 / amber 50–74 / red <50); robust alt visible; "show the work" expand reveals method trace; workloadReducers as 3-card carousel | IBR scan at 375px viewport |
| T-05 | Export contains rec + alternatives + confidence + robust alt + date; shareable URL signed and viewable WITHOUT auth | Vitest HMAC verify; curl unauth GET returns 200 |
| T-06 | Magic link AND email/password both succeed; authenticated user sees only own decisions (RLS-verified per T-08) | E2E flow via IBR; cross-check via raw SQL |
| T-07 | App installs to phone home screen; templates cached on first load; intake form survives offline; submission queued and replayed on reconnect | Lighthouse PWA check OR explicit deferral entry |
| T-08 | Cross-user RLS: User A cannot read decisions of User B (404, NOT 403, NOT the row) | Raw SQL `runWithActor({user:A, tenant:A}, ...)` query against another tenant's row → empty |
| T-09 | PHI rejection: Zod schema rejects free-form input matching common PHI patterns (≥200 chars in a string field) | Vitest unit test on `DecisionInputSchema.safeParse` |
| T-10 | Per-user rate limit: 21st Groq call in 24h window from same user_id returns 429 | Vitest rapid-fire 21 POSTs to `/api/decisions` |

## Done = all 10 ✅. Single ⚠️ requires explicit deferral entry in `.build-loop/decisions/`.
