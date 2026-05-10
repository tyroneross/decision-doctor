# Chat-First Persona Panel Results — FINAL (v4 chat, 2026-05-10)

Four personas re-tested the AI-leverage finder after a sequence of fixes
(commits `0df00f2` → `f3f36dd` → `436cf57` → `fccda4a` → `7b1ea56` → `5485395`).

## Final scorecard

| Persona | Form (v0) | Chat v1 | Chat v2 final | Δ vs form | Verdict |
|---|---|---|---|---|---|
| **Maya** (low-tech psychiatrist) | 8 | 4 | **9** | +1 | "the chat is now the better experience" |
| **Sam** (mid-tech LMFT) | 6.5 | 6 | **7.5** | +1 | "the leverage-finder reframe is the right one" |
| **Priya** (high-tech PT, adversarial) | 7 | 6.5 | **8** | +1 | "ship it as a beta to a private list of 20 PTs/therapists" |
| **Hank** (very-low-tech pediatrician) | 5 | 3 | **8** | +3 | "yes — I'd hand my wife the printout" |

**Average: 6.6 → 5.1 → 8.1.** All four personas scored ABOVE their form baseline.
The chat-first AI-leverage finder is the better experience for every persona.

## Highlights

### Maya (9/10) — first time the chat beat the form
> "Sounds like you're stretched thin. I'll ask 6 short questions — about 5 minutes."
> "She acknowledged the feeling first, told me what she was about to do, AND told me how long. The five-minute number was the unlock."

- The opening "stretched thin" rationale + 5-min framing was the unlock she needed
- Budget parser fix: "maybe 100-300 a month" parsed correctly (was a tab-closer in v3)
- BAA fuzzy-match fix: "yes if it's a real company" advanced (was a deadlock in v3)
- Recommendation page: "felt warm, not corporate" — H1 = answer, 3-up metrics, single-container stack
- Could explain the rec to her husband in one sentence: *"I install an AI scribe and free up about 8 hours a week, costs ~$150/month, takes 2 days, and I sign a BAA before I turn it on."*

### Hank (8/10 from 3/10) — biggest single-persona jump in the project
> "Big number at the top — 'free ~19 hours per week' — and right under it, in real sentences, told me why."
> "Crucially: the dollar figures said '$378/month' and '$150/mo' — not $18,000 a year like that earlier botched version. Units matched what I typed."

- The unit-echoback bug that originally tanked the form (Hank typed monthly $, engine echoed annual) is finally fixed
- Single-mode router caught his "hire vs cap vs retire" question and walked him through the AI-leverage week-audit (vs the v3 placeholder card)
- Jargon hunt: zero hits for TOPSIS/ELECTRE/MCDA/Stage N/v1.1/structured_enumerable/router/mode in user-facing text
- Trust enough to act: "Yes — at least to start with the AI scribe. It told me that's the easiest one to undo."

### Priya (8/10 from 6.5/10) — strongest engineering signal
> "Latency confirmed: chat ~0.8s per turn, synthesis turn ~2-3s, page render ~950ms. Massive improvement vs prior 9s."
> "All five of my prior router-killers — every single one routed to the AI-leverage week-audit. That admin-misclassification credibility-killer is gone."

- Verified all 5 prior router-killers fixed
- 3-second synthesis (was 9s) — confirmed via `-w "%{time_total}s"` curl timing
- Engine integrity tight: HMAC + timingSafeEqual on share-token, CSP intact, no v1.1 token leaks, no SQL/XSS leaks
- Caught a real recovery dead-end: "I lost track of one of your answers" had no askingField + no chips. Fixed in commit 7b1ea56.

### Sam (7.5/10 from 6.0/10) — sharpest content critique
> "I asked the question I always ask my consult group — 'fourth day or raise rates?' — and instead of picking a side, the bot said: 'Sounds like you're stretched thin. I'll ask about where your week goes and find AI tools that free the most hours.' That is the actual move."

- Praised the leverage-finder reframe ("the right one")
- Caught the AI scribe missing for therapy specialty (Sam is LMFT). Fixed in commit 7b1ea56 — Heidi/Upheal explicitly market to EMDR/couples therapists in 2026.
- Caught templated rejection reasons ("Outranked + would overlap" boilerplate). Fixed.
- Biggest remaining ask: Spruce free-text parse + BAA chip discipline ("when I typed my answer in my own words, it silently re-asked")

## Final remaining items (small)

1. **Maya:** "covers your stated time" → "covers the hours you told me about" (small clinical-phrasing nit). FIXED in this commit.
2. **Maya:** Share-link API exposed raw intake fields under the hood (rendered page is clean; latent privacy concern). FIXED — share API now drops `intake` + `transcript` from the response.
3. **Hank:** Confidence percentage doesn't explain what the unmet ~12% means. FIXED in this commit — sub-line: "The remaining ~N% stays with you — these tools target where AI helps most, not everything."
4. **Hank:** Rationale doesn't acknowledge the original framing ("hire vs cap vs retire") even though it pivoted. Worth adding a one-line bridge: *"After the AI tools free hours, the hire/cap/retire question gets simpler — most practitioners need fewer hours of help than they think."* DEFER (cosmetic).

## What's working — keep these

- **Single-mode router** — every chat lands in the AI-leverage week-audit; no mode-misclassification blocks anymore
- **Pyramid order** on the rec page — H1 = answer in one sentence; metrics next; methodology last
- **Single-container stack** with internal dividers — Gestalt common-region; replaces the "engineer-built" 4-card grid
- **Warm stone palette + WCAG AA tokens** — landed cleanly across all 9 components
- **Differentiated rejection reasons** — no more boilerplate "would overlap" repeated
- **Recovery message** that names the failing field + offers chips — Priya's dead-end fixed
- **Per-tool playbooks** with real URLs (Heidi → heidihealth.com, Spruce → sprucehealth.com)
- **Honest unit-echoback** — Hank typed monthly $, engine echoed monthly $
- **"Start small? Try just one"** robust-alternative panel in peach-soft tint
- **Secondary "After AI, still need help?"** panel for human-help (only after AI tools shown)
- **No PHI** language preserved everywhere

## Recommendation

Decision Doctor v2 (AI-leverage finder) is **ship-ready for a private beta**.
Priya's adversarial review confirms the engineering surface is tight; the
persona panel confirms it delivers value to ICPs across the tech/AI proficiency
range. The product on the box is finally the product in the box.
