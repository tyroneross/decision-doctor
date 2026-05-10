# UI Simplification — Calm Precision pass + persona panel feedback

**Date**: 2026-05-10
**Trigger**: User feedback — "UI is ugly and confusing. Lot of content, don't know where to start."
**Audit method**: 4 ICP personas (Dr. Maya psychiatrist low-tech/no-AI; Sam LMFT mid/mid; Dr. Priya PT high-tech/high-AI; Dr. Hank pediatrician very-low-tech/no-AI) navigated the live app + did an interactive-integrity sweep.
**Why this happened**: Build-loop orchestrator did NOT consult `Reference files/Design Guidance/` or invoke the Calm Precision skill during Tranche 2C UI implementation. Density issues passed because tests check function, not perceived complexity.

## Convergent persona scores (intuitiveness, 0-10)

| Persona | Score | Top complaint |
|---|---|---|
| Maya (low-tech psychiatrist) | 8 | Sign-up hidden under "Sign in" tabs almost made her close the tab |
| Sam (mid-tech LMFT) | 6.5 | Four reducer chips (`prompt` `ai_assisted` `full_task` `T1`) — "engineer-built, no PM smell" |
| Priya (high-tech PT) | 7 | Same 4 chips — overengineered taxonomy leaked into UI |
| Hank (very-low-tech pediatrician) | 5 | Engine echoed `$18,000/year` when he typed `$18,000/month` — would not act |

## Top 5 confusion sources (every persona named at least 3 of these)

1. **Sign-up is buried as the third tab on `/sign-in`.** `/sign-up` returns 404. Maya almost backed out. Hank actually got the 404. The page heading reads "Sign in" — Maya re-read three times before realizing tab 3 was for new accounts.
2. **Four chips per workload reducer** (`type` · `automationLevel` · `coverage` · `permission_tier` like `T1`). Internal engine taxonomy leaked into clinician UI. Sam: "consultant-speak". Priya: "I am the buyer and I do not care that this is T1 vs T2." Hank: "no idea what `T1` means."
3. **"Stage 4 — outranked by the recommendation on the heaviest criteria"** in the alternatives section. Refers to MCDA stages that the user was never introduced to. Hank: "what's a Stage 4?"
4. **8-11s engine wait with no progress feedback.** Submit button copy says "usually under 6 seconds" but engine actually takes ~9s. Sam, Priya, Hank all said they'd think it crashed and refresh.
5. **Workload reducer prompts hardcode "solo therapist" persona** regardless of which template ran. Hank (pediatrician) got prompts that said *"You are a solo therapist…"*. Persona leakage destroyed trust.

## Top 5 cuts (Calm Precision: signal/noise, content vs chrome, disclosure)

| Cut | Where | Why |
|---|---|---|
| **All 4 chips on workload reducer cards** | `components/recommendation/recommendation-view.tsx:79-84` | Pure jargon. No persona wanted them visible. |
| **Raw methodTrace JSON dump** | same file lines 138-147 | Replace with human-readable summary first; raw JSON behind a second toggle (power users only) |
| **"Copy prompt" floating action on each reducer** | same file ~205 | Unlabeled context for Maya/Hank. Either remove or rename to "Copy this text" with explicit context. |
| **"Eliminated at Stage N" pill** in alternatives list | lines 117-119 | Replace with plain-English: "Why this didn't win:" — drop the stage number |
| **Two competing eyebrows on each rec section** ("Recommendation", "Robust alternative", "Make it actionable", "Alternatives considered") | each `<section>` block | Pick a single hierarchy: headline + body. Eyebrows compete for attention. |

## Discoverability fixes (Calm Precision: don't make people hunt)

- **Add `/sign-up` route** that 302-redirects to `/sign-in?tab=signup` (or rename the page to "Welcome" with both tabs visible from a real CTA).
- **Landing page "Sign in" link** is currently underlined small text below the "Get started" button. Add a clear "Sign in" link in the top-right of the landing page header so returning users don't go through the marketing flow.
- **App nav**: only "History" and "Sign out" are nav items. Keep this — it's right.

## Trust fixes (Calm Precision: integrity)

- **Engine wait progress.** Replace static "Working…" copy with rotating stage text: "Listing your alternatives → Checking constraints → Weighing trade-offs → Ranking → Building your action plan." Update the "usually under 6 seconds" copy to honest range.
- **Persona leak in reducer prompts.** Each template's reducer prompts MUST inject the actual persona (`solo psychiatrist` for capacity-pricing? — ACTUALLY this should be `{{practitionerType}}` derived from the user, but for v1 just use generic "solo healthcare practitioner"). This is an engine fix, not UI, but blocks UI trust.
- **Unit echoback.** When the engine restates the user's input in the rationale, it MUST use the same unit. If user typed monthly, engine says monthly. (Hank's $18k bug.) Engine fix.

## Interactive-integrity sweep — dead/broken controls

| Element | Status | Fix |
|---|---|---|
| `/sign-up` route | ❌ 404 | Add redirect or rename page |
| 4 reducer chips | ❌ Decorative spans, look like buttons but no handler | Remove |
| "Copy prompt" label | ⚠️ Unclear to non-AI users | Rename "Copy this text" |
| Sign-out button | ⚠️ SSR HTML has no `onClick` (React hydration handles it but Priya flagged) | Verify hydration works; add explicit `client` boundary if needed |
| "Got it" privacy dismisser | ✅ | — |
| Header nav links | ✅ | — |
| Print/Save as PDF | ✅ | — |
| Copy share link | ✅ + verified incognito-readable | — |
| Show the work toggle | ✅ but reveals raw JSON | Replace JSON with human summary by default |
| Carousel ← / → | ✅ correctly disabled at boundaries | — |
| Magic link sign-in | ✅ but only delivers to verified Resend address (`tyrone.ross@gmail.com`); other addresses log link to dev console | [CLEANUP] verify Resend domain post-hackathon |

## What to keep (Calm Precision: don't fix what's working)

- "No PHI — none asked, none stored" landing copy — every persona named it as a trust earner.
- Three template cards with plain-English names (Capacity / Pricing / Hire). Right number, right names.
- ≤7 fields per intake. Right cap.
- Honest confidence percentages (60%, 68%, 78%). Earned trust.
- Robust alternative card. Sam: "the part that earned my trust."
- Print → real OS print dialog → real document layout (verified by Hank).
- HMAC + timingSafeEqual share token (Priya: "cleanest piece of code in the build").
- CSP + security headers (Priya verified).
- Two-stage Zod PHI rejection (Priya verified).

## Implementation plan (this session)

Three commits, each independently revertable:

### Commit 1 — UI density cuts (recommendation-view + intake form copy)
- Remove the 4-chip strip from each workload reducer card (replace with optional single human-readable verb chip)
- Rename "Copy prompt" → "Copy this text" + only show when `artifact.promptText` exists
- Replace raw JSON methodTrace with human summary first, raw JSON behind a second toggle
- Drop "Eliminated at Stage N" pill — replace with "Why this didn't win:"
- Update intake submit progress copy to be honest about the 8-12s window

### Commit 2 — Discoverability + integrity fixes
- Add `/sign-up` route that redirects to `/sign-in?tab=signup`
- Move "Sign in" link to landing page header (top-right) for returning users
- Verify sign-out hydration; add explicit client boundary if missing

### Commit 3 — Engine fixes (separate from UI but blocks UI trust)
- Persona-leak in reducer prompts: inject generic "solo healthcare practitioner" persona variable per template
- Unit echoback: ensure rationale uses same unit (monthly vs yearly) the user input

After commits, re-run 1-2 personas (cheap retest) to confirm density improved.
