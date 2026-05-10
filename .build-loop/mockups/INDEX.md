# Decision Doctor — 5 Alternative UI Mockups (light)

All five are **light backgrounds**. Each adapts SPACING and LAYOUT principles from `~/dev/git-folder/UI Guidance` (calm-precision, warm-craft, aurora-glass) but keeps a friendly light surface for the solo-healthcare-practitioner ICP.

Each mockup shows the same scenario: the chat-first flow walked end-to-end (first turn → mid-conversation → recommendation). Open each `.html` file in a browser.

## How to view
```bash
open /Users/tyroneross/dev/git-folder/decision-doctor-cc2/.build-loop/mockups/INDEX.md   # or any .html file
```

## The 5 directions

| # | File | Feel | Best persona fit | Tradeoff |
|---|------|------|------------------|----------|
| 1 | [1-calm-light.html](1-calm-light.html) | Clean white, indigo accent, generous whitespace | Maya, Hank | Safe but generic — could be any SaaS |
| 2 | [2-warm-paper.html](2-warm-paper.html) | Cream paper, sepia text, ember accent, serif body | Maya, Hank | Distinctive + warm; serif slows scanning for power users |
| 3 | [3-aurora-light.html](3-aurora-light.html) | Pearl + glass cards + indigo aurora gradient | Sam, Priya | Premium + modern; risks feeling like another LLM tool |
| 4 | [4-card-stack.html](4-card-stack.html) | Chat with inline answer cards (tap to edit) | All — but excellent for Sam/Priya | Less "chat", more "structured wizard with conversation polish" |
| 5 | [5-split-sketch.html](5-split-sketch.html) | Chat left, live decision sketch right (Cursor / Lovable / Claude artifact-style) | Priya (power user) | Desktop-first; mobile collapses to drawer |

---

## 1 · Calm Light

**Adapted from**: Calm Precision (current direction).

**Surfaces**: pure white card on `#fafaf9` page; `#e2e8f0` borders; indigo accent only on focus + primary CTA.

**Type**: -apple-system / Inter, 14.5px body, 22px H1, -0.01em tracking.

**Spacing**: 8pt grid (4 / 8 / 16 / 24 / 32 / 48), card padding 20px, hero section padding 24px.

**When to ship this**: when you want zero risk of confusing low-tech users (Maya, Hank). Reads as "professional, no agenda."

**Pros**: never wrong; passes WCAG; familiar.
**Cons**: looks like every other Next.js SaaS. No memorable identity.

---

## 2 · Warm Paper

**Adapted from**: Warm Craft (inverted to light).

**Surfaces**: cream paper `#faf6ee` page, warmer white `#fffdf8` cards, soft warm shadows. Sepia text (`#2a221c` / `#6a5b48`). 4px corner radius (book / paper feel, not iOS bubble).

**Accents**: ember `#c8651e` (darker for AA on light), sage `#4f8f5a`, clay `#a8543c`.

**Type**: Georgia serif body (16px) + DM Sans for UI chrome (12-14px). Builds on the published warm-craft type ladder but inverts to light.

**Layout flourishes**:
- Assistant messages have a 3px ember left-border (no bubble) — feels like a margin note from a trusted advisor
- Eyebrows in ember + UPPERCASE + 0.10em tracking
- "Print / Save as PDF" button is uppercase ember (calls back to apothecary labels)

**When to ship this**: when you want the product to feel **distinctly NOT another AI tool**. Reads as a trusted advisor or family doctor.

**Pros**: memorable identity, calming, signals craft.
**Cons**: serif body slows power-user scanning; ember + cream needs careful contrast tuning for AA.

---

## 3 · Aurora Light

**Adapted from**: Aurora Glass (inverted to light + softened).

**Surfaces**: `#fafbff` page with **subtle indigo / cyan / violet aurora gradient** behind everything (max opacity 0.08; static, no animation — Aurora Glass approach, not Deep). Cards are `rgba(255,255,255,0.85)` with `backdrop-filter: blur(20px)` and a faint indigo border.

**Accents**: indigo `#4f46e5` + violet `#7c3aed` linear gradient on brand mark and CTA. Emerald confidence pill with soft glow.

**Type**: same Inter ladder as Calm Light, but H1 uses -0.02em tracking (Aurora's "negative tracking on titles" rule).

**When to ship this**: when targeting Sam / Priya as the primary buyer. Reads as "Linear meets Notion meets Cursor."

**Pros**: feels current; visually distinctive at first glance.
**Cons**: glassmorphism on light is harder than dark — backdrop-filter performance on older iOS devices is a real concern; the aurora gradient must never compete with text contrast.

---

## 4 · Card Stack

**Adapted from**: Aurora Glass spacing + ProductPilot adaptive-intake pattern + Linear command-palette interactions.

**Mechanics that distinguish it**:
- Assistant messages are SHORT (≤14 words) — no bubbles, just text
- User answers don't appear as bubbles either — they crystallize into **answer cards** stacked between assistant messages
- Each card shows label + captured value + "Edit" pill (so the user can revisit any prior answer without scrolling back through chat)
- Numeric / select fields render as a **3-4 cell quick-answer grid** under the assistant message (one tap = answer)
- The "recommendation" page has a **2x2 summary card grid** (hours freed, cost, income impact, reversibility) above the rationale — the engine's structure becomes legible at a glance

**Type**: Inter, 14px body, 22px H1.

**When to ship this**: when you want to honor "easy for users" *and* "complex behind the scenes is fine." Reads as "I'm having a conversation" but feels like "I'm filling a smart form."

**Pros**: best of both — chat affordance + form structure + revisable state. Highest information density per turn.
**Cons**: more components to build; harder to implement well; the "tap a card to edit" interaction needs a polished modal that none of the other 4 mockups need.

---

## 5 · Split Sketch

**Adapted from**: Cursor / Lovable / Claude.ai artifact panels.

**Layout**: 50/50 split on desktop. **Chat on left** stays focused on dialogue. **"Decision sketch" on right** updates live — shows the 7 fields the engine needs, with each one's status (Captured ✅ / Now ⚪ / Pending ◯), a progress bar, and a "Forming recommendation" preview card that fills in as data accumulates.

When the engine completes, the right column transforms — the sketch becomes the full recommendation, the chat collapses to a transcript + follow-up input.

**Mobile** (≤720px): right column collapses below the chat as a swipe-up drawer (not shown in mockup; commented in CSS).

**When to ship this**: when targeting power users (Priya). The visible-reasoning-as-you-talk pattern is what makes Cursor and Lovable feel magical; brings the same to a decision tool.

**Pros**: maximum transparency; the user can see the math forming; fewest "wait, what was my second answer?" moments.
**Cons**: desktop-first; mobile is harder; the "decision sketch" needs to be designed twice (mid-conversation state + recommendation state).

---

## Recommended next step

If you want me to wire ONE of these into the live `/app/chat`, my opinion ordering:

1. **#4 Card Stack** — biggest UX win (revisable answers + dense rec grid) for moderate implementation cost. Persona panel showed the strongest signal that the chat needs MORE structure, not less.
2. **#1 Calm Light** — lowest risk; ships closest to current code; safe pick.
3. **#5 Split Sketch** — most ambitious; biggest payoff for Priya-tier users; highest dev cost.
4. **#2 Warm Paper** — best brand identity; but worth a separate persona test first because serifs polarize.
5. **#3 Aurora Light** — looks the most "current AI product"; but the personas told us they're tired of "AI tools" — distinctiveness here might cost trust.

Each mockup is a single self-contained `.html` file with inline CSS — no build, no JS dependencies. You can also send these files to a designer for further iteration without touching the codebase.
