# UX Best Practices for AI-Tool Recommendation Apps (Low-to-Mid Tech Healthcare Practitioners)

**Date:** 2026-05-10
**Audience:** Solo healthcare practitioners (Maya/Hank/Sam/Priya — psych/LCSW/PT/peds, tech-low to tech-high, AI proficiency none-to-high).
**Context:** Decision Doctor — chat-first decision-support tool that emits a stack of 2-4 ranked recommendations + structured rationale per item.
**Confidence legend:** ✅ verified against T1/T2 source · ⚠️ T3 only · ❓ unverified.

---

## 1. Gestalt Principles — Grouping Without Visual Noise ✅

NN/g's contemporary articulation of Gestalt for UI distinguishes three ordered grouping forces: **proximity > similarity > common region**, with common region (a shared boundary) "powerful enough to overpower other grouping principles such as proximity or similarity" (NN/g, *Common Region*).

For a **stack of recommendations**:
- **Proximity** does the heavy lifting between items in the same recommendation card (title ↔ rationale ↔ confidence). Group those tightly (4–8px), then push 24–32px between cards.
- **Common region** (a single subtle border or background tint per card) is the right tool when the card holds 4+ structured fields — proximity alone breaks down once items get content-dense. Avoid stacking *border + tint + shadow*; pick one. Three layered cues read as bureaucratic.
- **Similarity** (same icon family, same confidence-pill shape) tells users "these three items are comparable options," which is exactly the message a ranked stack must carry.
- **Continuity** (consistent left-edge alignment of titles down the stack) lets the eye sweep top-to-bottom in one motion — critical for Hank, who reads slowly.

Anti-pattern (your current state per persona feedback): individual borders on every list item creates 3-4 boxed islands and reads as "engineer-built." Single outer border + horizontal dividers is the NN/g-correct pattern.

**For Decision Doctor specifically:** wrap the recommendation stack in one container with thin internal dividers between the 2-4 items; reserve the per-item border *only* for the top-ranked / "Recommended" card to give it visual primacy.

Sources: [NN/g — Common Region](https://www.nngroup.com/articles/common-region/) · [NN/g — Proximity](https://www.nngroup.com/articles/gestalt-proximity/) · [NN/g — 5 Principles of Visual Design](https://www.nngroup.com/articles/principles-visual-design/)

---

## 2. Miller's Law / Cowan — Working Memory Reality ✅

Miller's "7±2" (1956) is widely *misapplied*. Miller himself called the number a coincidence; modern consensus is **Cowan's 4±1 chunks for working memory in young adults, fewer for older adults under cognitive load** (Cowan, "Magical Mystery Four," PMC 2864034). Hank (62, end-of-day) is operating at the low end.

**Implication for a 12-tool catalog:** never show 12 items as a flat list to a non-technical user. Two strategies:
1. **Chunk into ≤4 buckets** (see §4 MECE) so the user holds *categories*, not items, in working memory. Each category expands to its tools.
2. **Default to top-3 ranked**, with a "see 9 more" disclosure. Three is the sweet spot the persona panel praised ("Capacity / Pricing / Hire — right number, right names").

Don't show all 12 even if you label them. Visible cardinality drives perceived complexity regardless of grouping.

**For Decision Doctor specifically:** present 2-4 recommendations max above the fold; everything else lives behind progressive disclosure (see §9).

Sources: [Cowan — Magical Mystery Four (PMC)](https://pmc.ncbi.nlm.nih.gov/articles/PMC2864034/) · [Laws of UX — Miller's Law](https://lawsofux.com/millers-law/)

---

## 3. Pyramid Principle (Minto) — Headline First ✅

Minto's rule: **lead with the conclusion, then key supporting points, then evidence**. The reader should be able to stop at any level and still have the answer (Minto, *The Pyramid Principle*; Untools summary).

Applied to a "Deploy this stack of N tools" page, the right vertical order is:

1. **Headline (1 sentence, 14-16px bold).** "Hire a part-time RN before raising prices." — the *answer*.
2. **Why (2-3 sentences, plain text).** Names the tradeoff ("relieves the workload bottleneck without alienating long-term patients").
3. **Confidence + robust alternative** (the integrity surface — persona panel praised this).
4. **The stack** (the 2-4 recommended tools/actions, ranked).
5. **Per-item detail** (collapsed by default for items 2-N).
6. **Methods/assumptions** (deepest disclosure layer).

This inverts the engineer-default of "show inputs → show calculation → show output." Engineers want provenance first; users want **the answer** first, with provenance available on demand.

**For Decision Doctor specifically:** the page must answer the user's literal question *in the first sentence*, not after the methodology card. Move "We considered X factors..." below the recommendation, never above.

Sources: [Untools — Minto Pyramid](https://untools.co/minto-pyramid/) · [Simon Whatley — Applying Minto to UX](https://www.simonwhatley.co.uk/writing/applying-the-minto-pyramid-principle-to-user-experience-design/)

---

## 4. MECE Segmentation — ≤4 Buckets, No Overlap ✅

MECE was invented by Minto at McKinsey (Wikipedia, *MECE principle*). For UI: **mutually exclusive** = no tool appears in two buckets; **collectively exhaustive** = every tool fits somewhere. Persona panel confirmed: 4 reducer chips with engineering taxonomy (`type` `automationLevel` `coverage` `permission_tier=T1`) failed because the buckets were neither mutually exclusive nor user-meaningful.

**For 12 candidate AI tools, valid ≤4-bucket cuts** (pick *one* axis, not all four):
- **By workflow stage:** Intake · Documentation · Billing · Follow-up
- **By time-saved tier:** Quick wins (<1 hr setup) · Weekend project · Multi-week rollout
- **By risk surface:** No PHI ever · PHI optional · PHI required (BAA needed)
- **By user posture:** I want to try one thing today · I want a 90-day plan

Pick the axis the *user* would pick, not the one your taxonomy enforces. The persona panel's praised "Capacity / Pricing / Hire" was a workflow-stage cut and worked because it matched how solo practitioners actually frame decisions.

**For Decision Doctor specifically:** use ONE segmentation axis user-side. The internal taxonomy (T0–T5 tiers, automation levels) stays in the engine; never leak it into the UI.

Sources: [Wikipedia — MECE](https://en.wikipedia.org/wiki/MECE_principle) · [StrategyU — MECE Explained](https://strategyu.co/wtf-is-mece-mutually-exclusive-collectively-exhaustive/)

---

## 5. Color — Trust + WCAG AA on a Light Background ✅ (palettes), ⚠️ (psychology claims)

**Hard rule:** WCAG 2.1 AA = **4.5:1 contrast for body text, 3:1 for large text (≥18pt or 14pt bold) and UI components** (WebAIM). On a `#fafaf9` (stone-50) background, body text needs to be approximately stone-700 (`#44403c`) or darker. Do not use stone-500 for body text — it fails AA at small sizes.

**Palette frameworks that ship pre-vetted contrast pairs:**
- **Radix Colors** — 12-step scales with documented "accessible text" steps (11, 12) on each base. ✅ verified contrast pairs.
- **Tailwind v4 with OKLCH** — perceptually uniform, every step distance is consistent.
- **Material Design 3** — has explicit "tonal palette" with on-color pairs that meet AA by construction.

**Healthcare-warm-but-not-clinical** ⚠️ T3-only territory: 2025 healthcare branding articles converge on "anchor in blue + white, accent with corals/peach/soft greens" (Naskay; ThinkPod) but I found no peer-reviewed claim. Treat as design convention, not science.

A defensible Decision Doctor palette on `#fafaf9`:
- Surface: `#fafaf9` (stone-50)
- Border: `#e7e5e4` (stone-200)
- Body text: `#1c1917` (stone-900) — 16.8:1 ✅
- Muted text: `#57534e` (stone-600) — 7.6:1 ✅
- Primary action: a desaturated teal/sage (e.g. `#0f766e` teal-700) — pairs warmly with a peach accent for "robust alternative" highlights
- Status: green-700 / amber-600 / red-700 — text colors only, never background pills (per your house rule)

**For Decision Doctor specifically:** ship one palette with pre-computed contrast ratios documented per token; refuse any usage that requires a contrast checker mid-edit.

Sources: [WebAIM — Contrast and Color Accessibility](https://webaim.org/articles/contrast/) · [Radix Colors documentation](https://www.radix-ui.com/colors) · [Naskay — Color Psychology in Healthcare 2025](https://naskay.com/blog/color-psychology-in-healthcare-ui-2025/)

---

## 6. Spacing — 8pt Grid, Tighten Inside, Relax Outside ✅

Industry-standard 8pt grid: all spacing is multiples of 8 (or 4 for type-tight cases). Reasoning is screen-divisibility and rhythmic consistency (Spec.fm; UXPlanet).

**Where to tighten on a content-heavy recommendation page:**
- *Inside* a card — 4-8px between label and value, 8-12px between fields. Tight = "these belong together."
- *Inside* a typographic block — line-height ~1.5x font-size for body; 1.2x for headings.

**Where to relax:**
- *Between* cards — 24-32px. Wide = "these are separate things."
- *Above* a section heading — 32-48px. Large gap = "new thought."
- Around the primary CTA — 24-40px breathing room. Confined CTAs read as risky.

The internal-vs-external spacing rule (Cieden) is the single best heuristic: **internal padding < external margin**. If your card has 16px padding and 16px margin, the boundary disappears.

**For Decision Doctor specifically:** audit current recommendation card — likely has uniform 16px everywhere, which is the most common content-density failure mode.

Sources: [Spec.fm — 8-Point Grid](https://spec.fm/specifics/8-pt-grid) · [Designsystems.com — Spacing, Grids, Layouts](https://www.designsystems.com/space-grids-and-layouts/) · [Cieden — Spacing Best Practices](https://cieden.com/book/sub-atomic/spacing/spacing-best-practices)

---

## 7. Primary CTA Placement — Mobile vs Desktop Diverge ✅

**Mobile:** thumb zone is the **bottom third**. The bottom-right corner is a "red zone" for right-handed users in one-handed grip (UXMovement). A **sticky bottom action bar** containing the primary CTA is the validated pattern — Ünkut A/B test showed +55% CTA clicks, +7% transactions with sticky mobile CTA (AB Tasty). For long pages (recommendations + rationale + share + print), sticky-bottom is non-negotiable.

**Desktop:** F-pattern dominates text-heavy pages, Z-pattern on lighter pages (NN/g). Both terminate in the **middle-right** of the viewport — that's where eye-tracking shows scan-end. Desktop primary CTA belongs **inline at the natural reading terminus** of the recommendation, not stuck to the bottom of the viewport. Sticky desktop CTAs are usually overkill and obstruct content.

**Hybrid principle:** the primary action ("Use this stack" / "Save to my decisions" / "Share with my partner") must *always* be reachable without scroll-hunt. On mobile that means sticky-bottom; on desktop that means inline + a secondary CTA in the page header.

**For Decision Doctor specifically:** sticky-bottom action bar on mobile holding *one* CTA (the highest-intent action). Inline CTA at recommendation-end on desktop. Do not invert.

Sources: [UXMovement — Mobile CTA Placement](https://uxmovement.com/mobile/optimal-placement-for-mobile-call-to-action-buttons/) · [AB Tasty — Sticky CTA mobile case study](https://www.abtasty.com/blog/mobile-stick-to-scroll/) · [NN/g — F-pattern reading](https://www.nngroup.com/articles/f-shaped-pattern-reading-web-content/)

---

## 8. Fading / Contextual Navigation — Hide on Scroll, Reveal on Up ✅

Pattern: navigation hides on scroll-down, returns on scroll-up. Smart Interface Design Patterns is explicit: **never hide critical navigation on mobile** if the user needs it to complete the current task. Acceptable to hide *secondary* chrome (header bar, filter chips); never hide the primary action.

NN/g empirical: fixed/sticky navigation saved 36 seconds on a 5-minute visit, and 100% of test participants preferred fixed-nav. But sticky obscures content on small screens. The reconciliation is the **partially persistent header** — visible on scroll-up, hidden on scroll-down (Smart Interface Design Patterns / NN/g).

**Mobile:** auto-hide top nav on scroll-down is fine *if* the primary CTA is sticky-bottom (so user always has an action surface).
**Desktop:** keep the header persistent. Real estate cost is small relative to navigability gain.

**For Decision Doctor specifically:** mobile — auto-hide top nav on scroll-down, sticky-bottom action bar always visible. Desktop — persistent header, no auto-hide.

Sources: [Smart Interface Design Patterns — Never Hide Critical Navigation](https://smart-interface-design-patterns.com/articles/never-hide-critical-navigation/) · [NN/g — Sticky Headers](https://www.nngroup.com/articles/sticky-headers/) · [Smart Interface Design Patterns — Designing Sticky Menus](https://smart-interface-design-patterns.com/articles/sticky-menus/)

---

## 9. Progressive Disclosure — Pick the Right Mechanism ✅

NN/g's foundational principle: show what 80% of users need 80% of the time; hide the rest behind one click (NN/g, *Progressive Disclosure*). The mechanism matters:

| Mechanism | Use when | Avoid when |
|-----------|----------|------------|
| **Inline reveal / "Show more"** | Truncated text where the full version is short (1-3 paragraphs). Trust-low. | Content >1 screen — user loses anchor on collapse. |
| **Accordion** | 3-7 parallel detail blocks where user wants to compare a couple. | Long internal lists — NN/g warns "users get lost while scrolling" inside long accordions. |
| **Modal / overlay** | Single deep-detail view on a single item. Non-blocking dismissal. | Multi-step disclosure or anything users want side-by-side. |
| **New page (drill-down / hub-and-spoke)** | Detail is a *thing in itself* (the tool's own page, deployment guide). Saves working memory because URL = bookmark. | Quick comparisons across N items — context-switch cost. |

**First-time-user trust killer (NN/g):** "false simplicity" — hiding so much that when the user inevitably bumps into the edge, they distrust the system. The fix is honest disclosure — show that more exists ("3 more recommendations · expand"), not a magic-trick reveal.

**For Decision Doctor specifically:** top-3 stack visible by default; rank 4 collapsed under one explicit "show 9 more options" affordance (count is named, not hidden); per-item rationale uses inline-reveal for the first 2 sentences, "view full rationale" routes to a new page where Hank can read at his pace and print.

Sources: [NN/g — Progressive Disclosure](https://www.nngroup.com/articles/progressive-disclosure/) · [LogRocket — Progressive Disclosure Types](https://blog.logrocket.com/ux-design/progressive-disclosure-ux-types-use-cases/)

---

## 10. Stack-of-Recommendations Layout — The Synthesis ⚠️ (T2/T3 examples)

The composite pattern, drawing on §1-9:

**Per-card structure** (top-to-bottom, Pyramid order):
1. **Rank chip + headline** — "Recommended" pill (only on item 1) + 1-sentence answer in 14-16px bold.
2. **Confidence number** (e.g. "78% confidence") — text-only, no background pill (your house rule).
3. **One-line "why"** — plain English, 12-14px regular.
4. **Structured row of 2-3 facts** — time-to-deploy · estimated cost · PHI status. Icon + label + value pattern. Uniform across cards (similarity → comparability).
5. **Inline "view full rationale" link** — routes to per-tool page.

**Stack-level structure:**
- Outer container (single border, light tint) wraps all 2-4 cards.
- Horizontal dividers between cards, no per-card borders (except item 1 to signal primacy).
- Card 1 visually heavier (1px border, slightly larger title, "Recommended" pill).
- Cards 2-N are visually peer (no rank pill, slightly muted title).
- "Robust alternative" card sits *below* the ranked stack with a distinct visual treatment (peach/amber left border) — your persona panel called this out as a trust-earning surface.

**Cited product examples** ⚠️ (observed-in-the-wild, not formally documented):
- **Linear's Insights / suggestion stack** — minimal chrome, single divider line between items, inline reveal for context.
- **Stripe Tax dashboard** — top recommendation has a distinct background tint; secondaries are textual list items below.
- **Notion AI suggestions** — uses a single-card container with chip-level differentiation between options, no per-option borders.
- **Anthropic Console (claude.ai)** — pyramid-ordered: result → rationale → controls. The result is always the largest, most-prominent block.

The convergent pattern: **one emphasized winner + 1-3 peer alternatives + one explicit alternative pathway**, never a flat ranked list of 4 visually-identical items.

**For Decision Doctor specifically:** rebuild the recommendation page around this layout — single outer container, item 1 as visual primary, items 2-N as peers under dividers, robust alternative as a separately-styled card *below* the stack.

Sources: [NN/g — Cards (UI Pattern)](https://www.nngroup.com/articles/cards-component/) · [Eleken — Card UI Examples](https://www.eleken.co/blog-posts/card-ui-examples-and-best-practices-for-product-owners) · [Smart Interface Design Patterns library](https://smart-interface-design-patterns.com/)

---

## Cross-Source Conflicts Flagged

- **Sticky vs auto-hide nav on mobile:** NN/g data favors fixed-everywhere; Smart Interface Design Patterns favors hide-on-scroll-down. Resolution: hide *non-critical* chrome, never hide the primary action surface.
- **Miller 7±2 vs Cowan 4±1:** widely conflated. Cowan is the modern empirical answer for working memory; Miller's number is historical curiosity. Cite Cowan when designing for cognitive load.
- **Healthcare color "warmth":** T3 design-blog consensus (warm accents on cool base) ⚠️ — no peer-reviewed evidence found. Treat as convention.

---

## What to Apply First (3 lines)

1. **Restructure the recommendation page in pyramid order** — answer first sentence, rationale second, methodology last. Move any "we considered X factors…" copy *below* the stack.
2. **Collapse to one outer container with internal dividers** — kill per-card borders except on the top "Recommended" item; this single change eliminates the "engineer-built" smell the persona panel flagged.
3. **Mobile sticky-bottom CTA + auto-hide top nav; desktop persistent header + inline CTA** — the highest-leverage layout change for Hank (one-handed iPhone) and Maya (iPad scroll).
