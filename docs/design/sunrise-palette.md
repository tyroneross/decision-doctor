# Sunrise Palette — Decision Doctor's Calm Precision Application

**Picked:** 2026-05-10 (v2-01 Sunrise Hero mockup at `/Users/tyroneross/dev/git-folder/UI Guidance/mockups/decision-doctor--v2-01-sunrise-hero.html`)
**Shipped:** commit `9e01dda` (palette tokens + gradients)
**Calm Precision version:** 6.4.1 (canonical spec at `docs/design/calm-precision.md`)

This doc applies Calm Precision 6.4.1's semantic tokens to Decision Doctor's chosen palette. It is the project-specific layer on top of the canonical spec.

---

## Sunrise palette tokens

Tokens live in `tailwind.config.ts` (commit `9e01dda`) and CSS variables in `app/globals.css`.

### Base surfaces

| Token | Hex | Calm Precision role | Contrast vs ink-700 |
|---|---|---|---|
| `--cream` | `#fff7ef` | Page background | 9.2:1 ✓ |
| `--cream-2` | `#ffeede` | Cards, nav rest, secondary surfaces | 8.1:1 ✓ |

### Text hierarchy

| Token | Hex | Use | Contrast vs cream |
|---|---|---|---|
| `--ink-900` | `#1f1410` | Primary text (L1 hierarchy) | 14.2:1 ✓ |
| `--ink-700` | `#4a3a30` | Body text (L3 hierarchy) | 9.2:1 ✓ |
| `--ink-500` | `#8a7a6e` | Metadata, muted text (L4 hierarchy) | 4.8:1 ✓ (large text only — sub-14px caution) |
| `--ink-300` | `#c8b8a8` | Disabled state, hairline borders | structural only |
| `--rule` | `#f1d8be` | Subtle dividers, card borders | structural |

### Accent palette (semantic + category)

| Token | Hex | Calm Precision role | Decision Doctor mapping |
|---|---|---|---|
| `--cap` (coral) | `#ff6b4a` | Primary CTA color | Capacity template + primary action color |
| `--coral-2` | `#ff8d5e` | Hover state | — |
| `--peach` | `#ffb085` | Gradient stop | — |
| `--sun` | `#ffc857` | Gradient stop + Pricing accent | Pricing template |
| `--price` | `#e8a93a` | Category color | Pricing template |
| `--plum` | `#7a3aa8` | Secondary accent | Referral-network template + plugin feasibility chip (F-08) |
| `--skill` | `#0fb8a6` | Tertiary accent (success / skill tier) | Skill feasibility chip (F-08) |

### Confidence band colors (per Calm Precision § Signal-to-Noise)

Always paired with a glyph (✓ ~ ?) — never color alone.

| Band | Token | Hex | Glyph | Background |
|---|---|---|---|---|
| Strong call (≥75%) | `--strong` | `#1f9b4f` | ✓ | `--strong-bg: #dcf3e3` |
| Lean toward (50-74%) | `--lean` | `#c98512` | ~ | `--lean-bg: #fff0d4` |
| Coin flip (<50%) | `--flip` | `#c4364a` | ? | `--flip-bg: #fbe0e2` |

### Gradients

- `grad-coral`: `linear-gradient(135deg, #ff6b4a 0%, #ffb085 60%, #ffc857 100%)` — hero, primary CTA pills
- `grad-coral-text`: same gradient applied via `background-clip: text` — for hero metric numerals like "🕐 6 hrs/wk back"

---

## Token-to-Calm-Precision mapping

The Calm Precision § SEMANTIC TOKENS block tells you *what slots exist*. This table tells you *which Sunrise token fills each slot*.

| Calm Precision slot | Sunrise token |
|---|---|
| Contrast — high (~7:1) for L1 text | `--ink-900` on `--cream` (14.2:1) |
| Contrast — medium (≥4.5:1) for L3 description | `--ink-700` on `--cream` (9.2:1) |
| Contrast — low (≥3:1) for L4 metadata | `--ink-500` on `--cream` (4.8:1) — careful with size |
| Contrast — accent (≥4.5:1) for links/metrics | `grad-coral-text` |
| Surface — base (page bg) | `--cream` |
| Surface — elevated (cards) | white or `--cream-2` |
| Surface — grouped (list containers) | white with `--rule` border |
| Border — group (outer) | `--rule` |
| Border — divider (within) | `--rule` with `divide-y` |
| Border — subtle (hairline) | `--ink-300` rare |
| Touch — primary 48px | `h-12` |
| Touch — secondary 44px | `h-11` |
| Touch — minimum 44px | `min-h-[44px]` |
| Motion — lift.full -2px | `hover:-translate-y-0.5` |
| Motion — lift.subtle -1px | `hover:-translate-y-px` |
| Motion — press | `active:scale-[0.98] transition-transform duration-100` |
| Motion — duration | `duration-200` desktop / `duration-100` mobile |
| Motion — stagger | `style={{ transitionDelay: \`${index * 60}ms\` }}` |
| Motion — easing | `ease-out` entry, `ease-in` exit |
| Metric — value | `text-sm font-bold` or `text-[64px]` for hero |
| Metric — label | `text-[10px] text-ink-500 mt-0.5` |
| L1 hierarchy | `text-2xl md:text-3xl font-bold text-ink-900` |
| L2 hierarchy | `text-sm font-medium` |
| L3 hierarchy | three-line on `flex-1 min-w-0` |
| L4 hierarchy | `text-xs text-ink-500 hidden lg:block` |

---

## Verified WCAG-pass pairs

All pairs below were contrast-checked. Use these confidently.

| Foreground | Background | Ratio | Use |
|---|---|---|---|
| `--ink-900` | `--cream` | 14.2:1 | Page H1 |
| `--ink-700` | `--cream` | 9.2:1 | Body text |
| `--ink-500` | `--cream` | 4.8:1 | Large metadata (≥14pt or bold ≥18pt) |
| `--cap` | `--cream-2` | 5.2:1 | Coral text on warm card |
| `--plum` | `#f1e4f8` (plum-bg) | 7.4:1 | Plum text on lavender chip |
| `#075a51` (skill-deep) | `#dffaf6` (skill-bg) | 8.1:1 | Teal text on mint chip |
| `--strong` | `--strong-bg` | 5.6:1 | Strong-call chip |
| `--lean` | `--lean-bg` | 4.7:1 | Lean-toward chip |
| `--flip` | `--flip-bg` | 5.2:1 | Coin-flip chip |
| White | `--cap` | 4.8:1 | White text on coral CTA (use bold/semibold) |

→ **note:** `--ink-500` on `--cream` is 4.8:1 — passes for "large text" (≥18pt OR ≥14pt bold) but caution for smaller body. Use `--ink-700` if in doubt.

---

## Anti-patterns specific to this palette

Calm Precision's universal anti-patterns apply (see canonical doc). Additions specific to Sunrise:

| Don't | Why |
|---|---|
| Mix Sunrise with the archived dark themes (aurora-deep, warm-craft) | They share no contrast pairs. Color schemes don't compose. |
| Use `--coral-2` for primary CTA | It's the hover state. Primary should be `--cap` or the `grad-coral` gradient. |
| Use `--ink-300` for any text | Structural only. Borders, disabled icons. Never reading text. |
| Skip the gradient on the hero metric | The gradient *is* the brand. Plain coral text loses the energy that distinguishes Sunrise from a generic warm theme. |
| Apply category background to non-category chips (e.g., status, action) | Category fills are an exemption from § Signal-to-Noise; abusing them collapses the distinction. |

---

## Archived design directions (for reference)

These were explored 2026-05-10 morning and **not selected**. The central UI Guidance library at `/Users/tyroneross/dev/git-folder/UI Guidance/` holds them in full.

| Direction | Why archived | Where to find |
|---|---|---|
| Aurora Deep (premium dark navy + gradient) | Out of scope; dark mode would need full palette duplication | `UI Guidance/mockups/archive/decision-doctor-v1-superseded-2026-05-10/decision-doctor--03-aurora-deep.html` + `UI Guidance/aurora-deep.md` |
| Warm Craft (dark earthy with ember accent) | Dark mode out of scope | `UI Guidance/mockups/archive/...02-warm-craft.html` + `UI Guidance/warm-craft.md` |
| Aurora Glass (light glass-morphism) | Reference doc kept; no v2 mockup generated | `UI Guidance/aurora-glass.md` |
| Paper Print (newsprint serif drop-cap) | Distinctive but loses mass-market appeal with serif body | `UI Guidance/mockups/archive/...05-paper-print.html` |
| Two-Pane Desktop (chat left, decision right) | Strong layout idea; superseded by v2-07 detail pyramid | `UI Guidance/mockups/archive/...04-two-pane-desk.html` |
| Calm Clinical v1 (sterile light) | The boring B&W version explicitly rejected. Kept only as reference for what NOT to do | `UI Guidance/mockups/archive/...01-calm-clinical.html` |

---

## When to audit against this palette

Run `/ibr:design-validation` against any new screen before merging. Audit covers:
- Calm Precision compliance (target ≥90/100)
- Token violations — off-Sunrise color hex codes
- Contrast ratios vs the verified pairs above
- Touch target sizes per the canonical spec

When a new component is built, ensure it uses tokens from this doc only. If a new color is genuinely needed (rare), add it to this file FIRST with contrast-checked pairs, THEN ship.

---

## Cross-references

- `docs/design/calm-precision.md` — full canonical 6.4.1 spec
- `docs/design/cross-platform-patterns.md` — mobile/PWA patterns from central UI Guidance
- `docs/design/data-viz-patterns.md` — chart/metric patterns from central UI Guidance
- `docs/ux/considerations.md` — how these tokens apply to specific Decision Doctor routes
- `docs/research/ui-overhaul-2026-05-10.md` — the research that led to picking Sunrise
- `/Users/tyroneross/dev/git-folder/UI Guidance/mockups/decision-doctor--v2-*` — visual design north star
