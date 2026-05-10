# Decision Doctor — UX/UI Considerations

**Last updated:** 2026-05-10
**Companion docs:** `docs/design/calm-precision.md` (rules) · `docs/research/ui-overhaul-2026-05-10.md` (research) · `docs/research/question-type-coverage-2026-05-10.md` (decline-and-reframe rules)
**Mockups:** `/Users/tyroneross/dev/git-folder/UI Guidance/mockups/decision-doctor--v2-{01,06,07}.html`
**Picked design north star:** v2-01 Sunrise Hero (coral / peach / sun palette, 16-17px body, 30-36px h1)

---

## Tracking purpose

Single canonical reference for UX decisions. Update whenever:
- A new route is added or a route is restructured.
- A user action's prominence changes (primary/secondary/tertiary).
- An input or output contract changes (intake fields, decision JSON shape).
- A question-type-aware decline-and-reframe rule is added (e.g., refusing Type-2 diagnostic questions gracefully).

---

## Part 1 — Key navigation paths

### Primary path: "Find where AI saves you time"

This is the headline user journey. Optimized for first-time activation (the 5-minute time-to-value target per the activation research).

```
LANDING (auth-gated redirect from /)
   │
   └─► /sign-in
         │  magic-link OR email/password (both must work per LD-04)
         ▼
   /app/decisions   ← FIRST AUTHENTICATED VIEW
   ┌─────────────────────────────────────────────┐
   │ Hero ledger card                            │
   │   "🕐 X hrs/wk back since you started"      │
   │   3 metrics: decisions / skills / streak    │
   │                                              │
   │ Filter chips (≤6 per Miller's Law)          │
   │                                              │
   │ Decision cards (F-pattern, ≤5 visible)      │
   │   (empty state if new user)                 │
   └─────────────────────────────────────────────┘
         │
         │  Primary CTA: "+ New decision" (top nav)
         ▼
   /app/decisions/new
         │  Template selector — 3 cards (Sunrise)
         ▼
   /app/decisions/new/[templateId]
         │  Adaptive intake form (≤7 fields, Zod)
         ▼
   POST /api/decisions  → engine fires (≤8s p95)
         │
         ▼
   /app/decisions/[id]
   ┌─────────────────────────────────────────────┐
   │ PYRAMID detail layout:                       │
   │                                              │
   │ TIER 1: HERO — "🕐 6 hrs/wk back" (gradient) │
   │ TIER 2: 3 MECE cards                         │
   │   🛠️ The skill we built                      │
   │   🎯 What this changes                       │
   │   🛡️ If this stops working                   │
   │ TIER 3: This week (3 action items)           │
   │ TIER 4: Paired paths (anti-nudge)            │
   │ TIER 5: Show the math (disclosure)           │
   └─────────────────────────────────────────────┘
         │
         │  CTA on Skill card: "Open scaffold →"
         ▼
   DRAWER: ScaffoldViewer (in-page, no route change)
   ┌─────────────────────────────────────────────┐
   │ Tabs: Claude Code | Codex                    │
   │ File list: SKILL.md, plugin.json, etc.       │
   │ Code preview with per-file Copy buttons      │
   │ Footer: Copy all · Download as ZIP           │
   └─────────────────────────────────────────────┘
```

### Secondary path: "Help me decide given my constraints"

Reached from the same chat entry but for high-stakes decisions where AI can't directly solve. Pipeline differs (full MCDA with paired paths), output differs (decision card + math, not skill scaffold).

```
/app/chat (or /app/decisions/new via "Custom decision" path)
   │
   │  User describes high-stakes decision
   ▼
[Stage 0 PEDE classifier, F-11]  →  Routes to one of:
   ├─ SED  → run Type-4 MCDA pipeline → ranked recommendation
   ├─ VDD  → VFT + RGT + minimax-regret reflection (NO RANK)
   ├─ EDD  → RGT → option generation → BOED (planned)
   ├─ GDD  → VFT → constraint check → ranked options
   └─ TCLD → FFT (fast-and-frugal tree) → minimax regret
   │
   │  OPTIONAL detour for VDD/SED: AHP elicitation (F-10)
   │  "Set weights yourself" branch — Saaty 1-9 pairwise comparisons
   ▼
   Same recommendation layout as primary path
   (but VDD outputs surface "values map" instead of "skill")
```

### Top-nav order (left → right)

```
[ Logo ]  [ + New decision ]  [ History ]  [ Account ]
              ▲                    ▲            ▲
              │                    │            │
        primary CTA          secondary nav  tertiary
        coral gradient       neutral chip   avatar/menu
        always visible       hidden on    always visible
        bottom-up reachable  mobile <md
```

**Why this order:** the user's intent on visiting is overwhelmingly "I want to decide something" — primary CTA leftmost (after logo) follows that intent. History is reference, account is settings. Closes the F-pattern: the eye lands on `+ New decision` before scanning rightward.

### Mobile considerations

- Bottom tab bar with 3 tabs: `+ New` (primary, larger) · `History` · `Account`
- Hero ledger card collapses to a sticky pill at the top of `/app/decisions` (`"🕐 23 hrs/wk back · tap to expand"`)
- Decision cards are full-width tap targets; the "Open" chevron grows to 44px touch target
- Scaffold drawer becomes a full-screen sheet (per `ibr:mobile-web-ui` patterns)
- Composer pinned to bottom; safe-area-aware padding for home-indicator devices

---

## Part 2 — Key actions (by priority tier)

Action prominence directly signals user intent. Calm Precision § Fitts: button size = intent weight.

### Primary actions (full-width or gradient pill, always visible)

| Action | Where | Visual | Backed by |
|---|---|---|---|
| **+ New decision** | Top nav (left after logo) + empty state | Coral gradient pill, h-11 | Routes to `/app/decisions/new` |
| **Submit intake** | Intake form bottom, sticky | Coral gradient, full-width, h-12 | POST `/api/decisions` |
| **Open scaffold** | Decision detail "Skill ready" card | Outlined teal CTA | Opens ScaffoldViewer drawer |
| **Copy prompt** | Inside ScaffoldViewer | Gradient mint pill | `navigator.clipboard.writeText(...)` |
| **Try it in Claude Code** | ScaffoldViewer footer | Outlined CTA | Deep-link to Claude Code with prefilled skill |
| **Send (chat)** | Composer | Coral icon button when input has text; muted disabled | POST `/api/chat` |

### Secondary actions (compact pills, contextual)

| Action | Where | Visual |
|---|---|---|
| **Re-run decision** | Detail page header + history rows | Ghost icon button (rotate-arrow) |
| **Print** | Detail page header | Ghost icon button (print icon) |
| **Share** | Detail page header | Ghost icon button (share icon) |
| **Filter chips** | History page | Outlined pills with category color |
| **Show the math** | Detail page disclosure | Chevron link, text only — no box |
| **Adjust weights** | Detail page (if Stage 1 LLM weights used) | Outlined link → triggers AHP UI (F-10) |

### Tertiary actions (text-only, lowest priority)

| Action | Where |
|---|---|
| Sign out | Account menu |
| View older history | History page bottom |
| Edit decision title | Detail page hover |
| Copy decision URL | Share menu sub-action |

### Question-type-aware decline actions

When PEDE Stage-0 (F-11) classifies a question as a type Decision Doctor doesn't serve:

| User says | Classifier returns | Chat replies with |
|---|---|---|
| "Why did my no-show rate jump?" | Type 2 Diagnostic | "I help with forward decisions, not diagnostic root-causes. Want to decide *what to do about* the no-shows?" + 2 reframe chips |
| "What will my Q3 revenue be?" | Type 3 Predictive | "I help you decide, not forecast. Want me to surface decisions whose answer depends on revenue?" |
| "What's the optimal price across all my tiers?" | Type 5 Optimization | "I help with finite choice problems. If you can list 3-5 pricing tiers, I can help you pick. Otherwise this is a continuous-pricing problem outside my scope." |

This is critical: **decline gracefully and reframe**, never force a Type-4 ranking on a non-Type-4 question (the "false precision" risk per `question-type-coverage-2026-05-10.md`).

---

## Part 3 — Inputs

### User-driven inputs (what we ASK FOR)

| Input | Surface | Validation | Privacy |
|---|---|---|---|
| Email | Sign-in | RFC 5322 | Stored encrypted at rest in Neon |
| Password (optional alt to magic-link) | Sign-in | min 12 chars per Better Auth | Argon2 via Better Auth |
| Intake fields per template | `/app/decisions/new/[templateId]` | Zod schema per template (≤7 fields each per A-07) | **NO PHI** — Zod rejects long free-form (LD-03) |
| Free-form decision description | `/app/chat` | Length-capped (5000 chars); PHI Zod check at boundary | NO PHI |
| AHP pairwise comparisons (F-10) | `/app/decisions/[id]/weights` (planned) | Saaty 1-9 scale or coarsened 5-point; CR check | None — just preference data |
| Decision revisit date | Detail page | Date picker, future-dated only | None |
| Workload-reducer rating ("did this help?") | Detail page (planned) | Binary thumbs-up/down | None |

### System-derived inputs (what we INFER)

| Input | Where derived |
|---|---|
| User's tenant_id | Better Auth session → `app.tenant_id` GUC for RLS |
| Default weights per template | `lib/engine/templates/<id>.ts` (hardcoded; user-extensible later per F-12 plan) |
| Default constraints | Same place |
| Confidence band labels | `lib/decision-display.ts:bandFor(conf)` deterministic |
| Category colors | `lib/decision-display.ts:categoryFor(templateId)` deterministic |

### Boundary rules

- **PHI rejection** (LD-03 / T-09): any free-form input >280 chars is checked against PHI patterns; if matched, Zod returns a 400 with "Please remove identifying details" message.
- **Length caps**: chat messages ≤5000 chars; intake fields ≤500 chars each.
- **Rate limit**: 20 engine runs / 24h / user (T-10). Surfaced as "13 of 20 daily messages used" microcopy under the composer.

---

## Part 4 — Outputs

### Per-decision output

The engine returns a `DecisionOutput` (see `shared/schema.ts`). UI renders it via the pyramid layout described in Part 1.

| Field | Source | UI surface |
|---|---|---|
| `recommendation` (option, confidence, rationale) | Stage 5 TOPSIS + LLM | Hero gradient card (top of pyramid) |
| `alternatives[]` (eliminated_at_stage, reason) | Stages 2 + 4 | "What we ruled out" inside "Show the math" disclosure |
| `robustAlternative` (option, why) | Stage 5 minimax | "🛡️ If this stops working" MECE card #3 |
| `confidence` (0-100) | TOPSIS margin | Chip in hero ("✓ Strong call · 78%") |
| `methodTrace[]` (stage-by-stage) | All stages | Inside "Show the math" disclosure |
| `workloadReducers[]` (≥3) | Stage 5 LLM | MECE card #1 (top reducer) + "This week" actions |
| `workloadReducers[].aiFeasibility` (F-08) | Stage 6 LLM classifier | Colored chip on every reducer card |
| `workloadReducers[].scaffold` (F-09) | Stage 7 template generator | "Open scaffold" CTA on skill/plugin-classified reducers |
| `weightSource` ("llm" \| "ahp") (F-10) | Stage 1 or Stage 1B | Disclosure note in "Show the math" |
| `decisionType` (SED/GDD/VDD/EDD/TCLD) (F-11) | Stage 0 classifier | Subtle tag in breadcrumb; routing audit trail |

### Persistent output (cross-decision)

| Output | Surface |
|---|---|
| Decision history | `/app/decisions` list with hero ledger |
| Time-back ledger | Hero card top of `/app/decisions` and persistent chip in top nav |
| Streak count | Hero card top of `/app/decisions` |
| Skills shipped | Hero card top of `/app/decisions` |
| Weekly workflow audit (v1.1) | New `/app/audit/[week]` route, Railway-generated |
| Decision history search | Filter chips + (v1.1) free-text search |

### Output integrity rules

- Confidence color + glyph pair (✓ / ~ / ?) — never color alone (Calm Precision § Signal-to-noise; T-04 update).
- Plain-language summary always above any jargon ("Hire VA · saves 6 hrs/wk" before any TOPSIS number).
- "Show the math" collapsed by default; never open for non-power-users.
- Skill scaffold copies are **byte-exact** for `SKILL.md` frontmatter — no smart-quotes substitution, no trailing whitespace, line-ending = LF.
- AHP weights (if used) include the CR value visibly: "Your judgments are consistent (CR = 0.08)" or "We caught a contradiction in pair A vs B."

---

## Part 5 — Critical UX rules (cross-cutting)

These rules apply across all routes, not specific to one surface.

| # | Rule | Source | Enforcement |
|---|---|---|---|
| 1 | Hero metric is **time saved**, not confidence | Microsoft Work Lab + user feedback | `RecommendationView` top tier: gradient card displays `🕐 X hrs/wk back`; confidence is a chip |
| 2 | Max **5 chunks** per visual group (Miller/Cowan) | Laws of UX | Filter chips ≤6, action items ≤3, hero metrics ≤3 |
| 3 | **Pyramid Principle** on detail screens — headline → 3 MECE cards → math under disclosure | Minto via NN/g | `RecommendationView` layout |
| 4 | **F-pattern** for lists, **Z-pattern** for hero | Smashing 2024 / NN/g eye-tracking | History list = F-pattern (titles at left edge); chat hero = Z-pattern (logo TL → CTA TR → value BR) |
| 5 | **Skeleton screens** during AI inference (-40% perceived load) | NN/g | `Chat.tsx` busy state per `30451c4` |
| 6 | **`prefers-reduced-motion`** honored everywhere | WCAG | `globals.css` — already in place |
| 7 | **WCAG 4.5:1** contrast on body, 3:1 on large text | WCAG 2.1 AA | Sunrise palette pre-checked: coral on cream-2 = 5.2:1, plum on lavender-bg = 7.4:1 |
| 8 | **No fake buttons.** Every interactive element must have a working backend OR be visibly marked "Demo" | CLAUDE.md Non-Negotiable | Code review per build-loop Phase 4 Critic |
| 9 | Top nav order: Logo → **+ New decision** (primary, leftmost) → History → Account | User feedback 2026-05-10 | `app/app/layout.tsx` per `ed80a7a` |
| 10 | Question-type aware decline-and-reframe | `question-type-coverage-2026-05-10.md` | F-11 PEDE Stage-0 classifier; future chat-handler change |

---

## Part 6 — Per-feature UI deltas (next build chunks)

### F-08 AI-feasibility scoring (Chunk A, ~1 day)

| Surface | Delta |
|---|---|
| `components/recommendation/RecommendationView.tsx` | Add 4-tier feasibility chip (`🛠️ Skill` / `🧩 Plugin` / `🤖 Agent` / `👤 Human review`) to every reducer card. Replace the current 3-tier impressionistic high/med/low chip. |
| `components/decisions/DecisionsListClient.tsx` | Same chip on history rows |
| Detail layout: add **"Ranked drains" sidebar** | Promotes the per-decision ranked list of reducers to the right of the hero. Was previously buried inside "what changes." |
| Color tokens | Already in `tailwind.config.ts` (Sunrise palette adds `--skill`, `--plum`, `--cap`, `--ink-500`) — verified WCAG-pass at commit `9e01dda` |

### F-09 Scaffold viewer (Chunk B, ~2 days)

| Surface | Delta |
|---|---|
| **NEW** `components/scaffold/ScaffoldViewer.tsx` | Drawer (desktop) / sheet (mobile). Tabs: Claude Code | Codex. File list on left. Code preview on right with per-file `Copy` button. Footer: `Copy all` / `Download ZIP` / `Try in Claude Code` |
| **NEW** `components/scaffold/CodeBlock.tsx` | Syntax-highlighted (via `react-syntax-highlighter` lazy-loaded), monospace, copy button top-right, success microcopy "Copied ✓" in teal |
| `RecommendationView` | Add "Open scaffold →" CTA on the green "Skill ready" card |
| **NEW** mockup `decision-doctor--v2-08-scaffold-viewer.html` | Design north star — see `f08-f09-plan-2026-05-10.md` §"UI surfaces" |

### F-10 AHP elicitation (Chunk C, ~1 day; can run alongside Chunk A)

| Surface | Delta |
|---|---|
| **NEW** `components/elicitation/AhpPairwise.tsx` | Mobile-friendly pairwise comparison UI. Saaty 1-9 (default) or coarsened 5-chip ("A matters more / equal / B matters more, by how much"). |
| `app/app/decisions/new/[templateId]/page.tsx` | Add "How do you want to set weights?" branch: "Let AI propose" (default, current Stage 1) OR "Set weights myself (AHP)" |
| `RecommendationView` | "Show the math" disclosure shows `weightSource` ("LLM-estimated" or "You set these via pairwise comparisons") |
| CR feedback UI | When CR > 0.10, surface "Your judgments are inconsistent on pair X vs Y — want to revise?" with a revise button |

### F-11 PEDE Stage-0 classifier (planned, post-buildathon)

| Surface | Delta |
|---|---|
| Chat handler | Pre-engine classifier call; routes to the right pipeline. Decline-and-reframe for Types 2/3/5. |
| Detail page breadcrumb | Subtle "Decision type: Capacity (SED)" tag for transparency |
| (Future) VFT/RGT for VDD/EDD | New screens; out of v1 scope |

---

## Part 7 — Accessibility checklist (per route)

| Route | Keyboard | Screen reader | Touch ≥44px | Reduced motion |
|---|---|---|---|---|
| `/sign-in` | ✅ | ✅ | ✅ | ✅ |
| `/app/decisions` | ✅ | ⚠️ verify category-chip ARIA | ✅ | ✅ |
| `/app/decisions/new/[id]` | ✅ | ⚠️ verify Zod errors are announced | ✅ | ✅ |
| `/app/decisions/[id]` | ✅ | ⚠️ verify disclosure announces state | ✅ | ✅ |
| Scaffold drawer (F-09) | 🟡 planned | 🟡 must trap focus + announce file changes | 🟡 | 🟡 |
| AHP pairwise (F-10) | 🟡 planned | 🟡 must announce CR violations | 🟡 | 🟡 |

→ **note:** axe-core not yet wired into CI. Listed as a v1.1 followup.

---

## Cross-references

- `docs/design/calm-precision.md` — design system rules (the "what we do" — this doc is the "how those rules play out per route")
- `docs/research/ui-overhaul-2026-05-10.md` — the research that produced these patterns (10 sources)
- `docs/research/question-type-coverage-2026-05-10.md` — decline-and-reframe rules
- `docs/research/f08-f09-plan-2026-05-10.md` — F-08/F-09 specific UI specs
- `docs/architecture/architecture.md` — backend counterpart (data flow + components)
- `/Users/tyroneross/dev/git-folder/UI Guidance/mockups/decision-doctor--v2-*` — visual design north star
