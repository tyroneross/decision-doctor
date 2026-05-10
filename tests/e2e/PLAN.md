# Decision Doctor — End-to-End Test Plan

Validates **workflow correctness, decision accuracy, AI-workflow generation quality, scalability, dependency robustness, and AI-maturity required**. Output: a findings report + ranked simplification proposals.

## §1 Hypothetical user panel (5 personas, derived from PRD §2 wedge)

Each persona has: name, specialty, AI maturity (low/med/high), tech comfort, scenario, intake JSON, and the *expected* common-sense recommendation a human consultant would give.

| # | Persona | AI maturity | Decision | Template |
|---|---|---|---|---|
| P1 | **Sarah** — solo psychiatrist, 38, 2 yr in practice, full panel, considering admin help. EHR-comfortable but never used ChatGPT. | Low | "Should I hire admin help?" | admin-hire |
| P2 | **Marcus** — LCSW, 45, 8 yr, full panel, rates frozen 3 yrs, considering raising. Uses Claude weekly. | High | "Raise rates?" | pricing |
| P3 | **Priya** — solo primary-care DO, 32, just opened, 20 patients, considering capacity expansion. ChatGPT for clinical notes. | Med | "Add capacity?" | capacity |
| P4 | **Linda** — solo nutritionist, 52, 5 yr cash-pay, fading, considering insurance pivot or rate cut. Barely uses email. | Very low | "Restructure pricing?" | pricing |
| P5 | **Diane** — PT, 60, 30 yr, small clinic, winding down, considering capping intakes vs outsourcing scheduling. Very low tech. | Very low | "Cap intakes or hire?" | admin-hire (tested as also runnable through capacity) |

Intake values for each persona are encoded in `tests/e2e/scenarios.json`.

## §2 Workflow scenarios — what we trace end-to-end

For each persona:

1. **Auth** (manual, sample size = 1) — magic-link flow + email/password flow against `decision-doctor-xi.vercel.app`. Confirms F-06.
2. **Intake form rendering** — reach `/app/decisions/new/<templateId>` at 375 px viewport. Confirms F-01 + F-02.
3. **Engine call** — POST `/api/decisions` with the persona's intake. Captured by `run.mjs`. Confirms F-03 + T-03.
4. **Output structure** — DecisionOutput shape + content quality. Confirms F-04.
5. **Print export** — open the print preview from F-04 page. Confirms F-05.
6. **History list** — return after 24 h, see prior decisions. Confirms F-06.
7. **Offline survival** — disconnect WiFi mid-form, reload, form state restored. Confirms F-07.
8. **PHI rejection** — attempt a free-form input that includes a name. Confirms T-09.
9. **Rate-limit** — 21st call from same user_id in a 24 h window → 429. Confirms T-10.
10. **Cross-user isolation** — User A's decisionId is invisible to User B. Confirms T-08 (already ✅ in unit test, smoke in prod).

Workflow scenarios 1, 2, 5, 6, 7 require a real browser session. Captured via the IBR scan in §6 of this plan + manual smoke per persona. Scenarios 3, 4, 8, 9, 10 are scriptable.

## §3 Decision-accuracy rubric (per persona)

For each engine output, score on 6 dimensions, 0-2 each (0 = wrong, 1 = adequate, 2 = strong). Per-persona pass = total ≥ 8 / 12.

| Dim | Question | Pass anchor |
|---|---|---|
| **A1 Capture** | Does `recommendation.option` match the obvious right call given the intake? E.g., for Sarah (panel-full + waitlist + depleted), the right move is "build a waitlist & raise rates" or "hire admin"; "expand visits" is wrong. | A1 = 2 if matches; 1 if a close 2nd choice; 0 if frankly wrong. |
| **A2 Confidence calibration** | Does `recommendation.confidence` align with how clear the right answer is? Edge cases (P3 just-opened) should not return 95 %. | A2 = 2 if within ±15 of human-judged confidence; 1 if within ±30; 0 otherwise. |
| **A3 Alternative elimination quality** | Are alternatives' `reason` strings actually true given intake? "Budget exceeded" must mean budget IS exceeded. | A3 = 2 if every reason verifiable from intake; 1 if 1 weak reason; 0 if any reason contradicts intake. |
| **A4 Method-trace coherence** | Stage 1 → 2 → 3 → 4 → 5 outputs chain logically; weights from S3 used in S4 + S5. | A4 = 2 if every stage's output references prior; 0 if any stage is orphaned. |
| **A5 Robust alt usefulness** | `robustAlternative` is a *different* option than the recommendation, with a defensible minimax-regret rationale. | A5 = 2 if distinct + rationale links to a specific assumption that could shift; 0 if same option or hand-wave reason. |
| **A6 Workload-reducer quality** | ≥3 reducers, each is a single concrete next action — paste-ready prompt OR step-numbered playbook OR named tool/MCP. No wishful copy. | A6 = 2 if each reducer is genuinely paste-ready; 1 if 1 weak; 0 if mostly aspirational. |

## §4 AI-workflow generation rubric

This is the user's specific question — does the engine identify *how to use AI* and produce *paste-ready* prompts/agents?

For each persona, look at the generated `workloadReducers[].artifact`:

| Dim | Question | Pass anchor |
|---|---|---|
| **AI-1 Identification** | When the recommendation reasonably benefits from AI (drafting JD, summarizing patient call, comparing vendor proposals), does at least one reducer name a specific AI tool? | Pass = ≥1 reducer of `type: "prompt"` OR `mcp_tool` OR `skill`. |
| **AI-2 Prompt structure** | For `type: "prompt"` reducers, does `artifact.promptText` follow good prompt structure: role, context, instruction, output format? Is the user's intake context embedded? | Pass = role + context + ≥1 specific instruction + an output spec OR an explicit "fill-in-the-blank" template. |
| **AI-3 Tool-syntax accuracy** | If the reducer recommends Claude Code / Codex / Perplexity, does it use that tool's actual conventions? Claude Code skills use SKILL.md w/ frontmatter; Codex agents use AGENTS.md w/ scope; Perplexity uses Spaces or Pro Search "focus" filters. | Pass = no tool naming a feature that doesn't exist; bonus if it gives the file shape OR an exact command. |
| **AI-4 Instructions to use** | Each reducer has plain-English "how to use this": where to paste, what to expect back, how to iterate. | Pass = `description` field has run-it-now instructions, not just what-it-is. |
| **AI-5 Permission tier honesty** | `permission_tier` matches actual blast radius: paste-into-chat = T0; reads calendar = T2; sends email = T4. | Pass = no T0 reducer that actually sends comms. |

## §5 AI-maturity required (UX accessibility — per persona)

Score the same output against each persona's literacy:

| Maturity | Persona ref | What we check |
|---|---|---|
| Very low (P4 Linda, P5 Diane) | Can the user act on the recommendation *without* opening any expand? Is the rec card alone actionable? | If only the top card matters, mark ✅. If they need to open methodTrace to understand, mark ⚠️. |
| Low (P1 Sarah) | Are workloadReducer prompts copy-pasteable into ChatGPT free tier without setup? | Pass if no MCP / API / agent prerequisites for ≥1 reducer. |
| Medium (P3 Priya) | Mix of prompts + tool-named reducers. Can the user pick. | Pass if both options present. |
| High (P2 Marcus) | Are agent definitions / skill files rendered correctly? Does it tell him "save as `.claude/skills/<name>/SKILL.md` then run `/<name>`"? | Pass if file path + invocation given. |

Output: a single number — minimum AI maturity at which the tool is useful. Target = **Low (P1)**. If we hit Med, simplification needed.

## §6 Simplification candidates checklist

Inspected during analysis. Each is a question; answer Yes / No / Maybe per persona.

- Can we hide methodTrace by default and surface it only on "show the work"? (Already in F-04 — verify.)
- Are any intake fields redundant given other fields? (e.g., currentRateUSD + competitorBenchmarkUSD when only the gap matters)
- Can we collapse the 3-card workload-reducer carousel into a single "next action" CTA + an "and 2 others" peek?
- Are confidence numbers (78 %, 62 %) more or less reassuring than text labels ("Strongly recommend", "Lean toward", "Coin flip — see robust alt")?
- Do any UI words assume MCDA literacy? (e.g., "method trace", "robust alternative", "outranking", "TOPSIS")
- Is the "robust alternative" feature understandable to a 60-yo PT who has never heard of minimax regret?

## §7 Scalability scenarios

| Scenario | Tool | What we measure |
|---|---|---|
| **S-1 Single user** | curl x 5 (warm) | p50, p95 latency end-to-end (auth → engine → DB write) |
| **S-2 10 concurrent users, same template** | `tests/e2e/concurrent.mjs` (Promise.all × 10) | p50, p95, error rate; Groq queue saturation |
| **S-3 50 concurrent users** | concurrent.mjs × 50 | Neon WebSocket pool exhaustion (max=10 in actor.ts), Groq rate-limit hits, error budget |
| **S-4 Cold-start** | Vercel cold deploy + first call after idle | Time-to-first-byte; ALS context init cost |
| **S-5 Engine-only stress** | runDecision() in a tight loop, no auth/DB | LLM-call latency stability; deterministic-stage CPU profile |

Pass thresholds: PRD T-03 says **p95 < 6 s** end-to-end. S-1 and S-2 must clear; S-3 may degrade with budget for 5 % errors. S-4 single-call < 10 s.

## §8 Architecture dependency map + failure-mode matrix

Inspected analytically (no script). Map every external dep + module-level dep, then for each dep ask: "if this is down for 5 minutes, what fails?"

| Dep | Used by | Failure mode | Mitigation in v1? | Open risk |
|---|---|---|---|---|
| Neon Postgres | Every `/app/*` request, all auth | 503 on every page | None | Single point of failure |
| Neon WebSocket pool | `lib/db/actor.ts` (max=10) | "no available connections" at >10 concurrent | None | Need pool sizing per scale |
| Groq API | Stage 1, Stage 5 rationale | Engine 5xx | None | Single LLM provider; ADR-001 says swap = M effort |
| Resend | Magic-link / email-verify only | Sign-up via magic link breaks; email/password still works | Yes — fallback path | Acceptable |
| Vercel platform | Everything | Total outage | None | Acceptable for hackathon |
| Better Auth | All `/app/*` routes | Auth blocked | None | Library risk |
| @neondatabase/serverless WebSocket | DB pool | Connection drops | Pool retries | Acceptable |

**Module-level coupling graph:**

```
app/api/decisions  ─→ lib/auth.ts ─→ lib/db/auth-db.ts ─→ Neon (owner pool, no RLS)
                  ─→ lib/ratelimit.ts (in-memory; not durable across server processes)
                  ─→ lib/engine/orchestrator.ts ─→ stage1 → stage2 → stage3 → stage4 → stage5
                                                                                         └→ lib/groq.ts (Groq API)
                  ─→ lib/db/actor.ts ─→ Neon (app_user pool, RLS-FORCEd)

app/api/auth/*    ─→ lib/auth.ts ─→ same as above
                  ─→ lib/email/send-magic-link.ts ─→ Resend

app/(app)/*       ─→ lib/auth-session.ts (server-side session lookup)
                  ─→ React Server Components → DB via actor pool
                  ─→ React Client Components → /api/decisions, /api/templates

components/intake/IntakeForm.tsx  ─→ localStorage (form-draft cache)
public/sw.js                      ─→ caches templates, app shell
```

Single-point-of-failure tally:
- 1 Neon project
- 1 Groq account
- 1 Vercel project
- 1 Better Auth instance (config in code, deps on Neon)

That's expected for a hackathon.

## §9 Test execution plan

1. **Run `tests/e2e/run.mjs`** — calls `runDecision()` directly via Node for each persona; captures output, latency, token counts. No auth/DB required.
2. **Run `tests/e2e/concurrent.mjs`** — fans 10 + 50 concurrent calls.
3. **Score outputs** — apply rubrics §3 + §4 to each output. Record findings + sub-scores in `tests/e2e/findings.json`.
4. **AI-maturity assessment** — analytical, written to `tests/e2e/REPORT.md` §AI-maturity.
5. **Simplification proposal** — ranked list of changes with effort + expected impact.
6. **Scalability + dependency analysis** — captured in `REPORT.md`.

## §10 Pass/fail thresholds

| Gate | Threshold |
|---|---|
| Decision accuracy (§3) | ≥ 4 of 5 personas score ≥ 8 / 12 |
| AI workflow generation (§4) | AI-1, AI-2, AI-4 pass for ≥ 4 of 5 personas |
| AI maturity (§5) | Tool useful at "Low" maturity (P1 Sarah) without outside help |
| Scalability (§7) | S-1 + S-2 within p95 < 6 s; S-3 < 5 % errors |
| Dependency map (§8) | No undocumented SPOF; every dep has a failure-mode entry |

If any gate misses, write a simplification or hardening task to STATUS.md "Open follow-ups".
