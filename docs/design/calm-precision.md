# CALM PRECISION 6.4.1
*Interfaces that think as clearly as their users*

> **Token-optimized guidance for LLM implementation**
> Plain language • Decision trees • Perceptual foundations • Audit-ready

**Project note:** this is the canonical 6.4.1 spec, copied verbatim. Decision Doctor's project-specific palette + token application lives in `docs/design/sunrise-palette.md`. When Calm Precision evolves to 6.5+, update this file from the canonical source.

---

## ⚡ NAVIGATION CHECKPOINTS

> **For LLMs:** Use these checkpoints to jump to the section you need. Don't read the entire file unless doing a full build.
>
> - **Building components?** → Jump to `[CP:TREES]` and `[CP:PATTERNS]`
> - **Building mobile/responsive?** → Jump to `[CP:MOBILE]`
> - **Writing UI copy?** → Jump to `[CP:VOICE]`
> - **Handling errors/empty states?** → Jump to `[CP:ERRORS]`
> - **Laying out a page?** → Jump to `[CP:PAGE-HIERARCHY]`
> - **Auditing existing work?** → Jump to `[CP:AUDIT]`
> - **Quick reference only?** → Jump to `[CP:QUICK-REF]`
> - **Need rules table?** → Jump to `[CP:RULES]`

---

<!-- [CP:PHILOSOPHY] -->
## PHILOSOPHY

**Goal:** Cognitive predictability through information-first structure within accessibility envelope

**Method:** Encode decision trees that LLMs can interpret and audit

**Foundation:** Each rule traces to perceptual science (Gestalt, Fitts, Hick, Cognitive Load, Signal-to-Noise, Affordance, Temporal Gestalt, Dual-Coding, Pragmatic Inference, Attentional Cascade, Cooperative Principle)

---

<!-- [CP:PRINCIPLES] -->
## CORE PRINCIPLES

### 1. Group, Don't Isolate
**Gestalt Proximity + Common Region**
Single border around related items, dividers between them. Individual borders imply separation.

### 2. Size = Importance
**Fitts' Law**
Button size matches user intent weight. Critical conversions = large, quick actions = compact.

### 3. Three-Line Hierarchy + Page-Level Cascade
**Cognitive Load + Information Scent + Attentional Cascade**
Within components: Title (14–16px, bold) → Description (12–14px) → Metadata (11–12px, muted). Consistent vertical rhythm.

Across pages: Four attention levels control what users see first, second, third:

| Level | Role | Characteristics | Example |
|-------|------|-----------------|---------|
| L1 Anchor | One per page. First thing the eye hits. | Largest text, highest contrast, top-left or center | Page title, hero metric, primary headline |
| L2 Orient | Navigation and controls. Tells user where they are. | Smaller than L1, fixed position, consistent across pages | Top nav, breadcrumbs, view toggles, search |
| L3 Primary Content | The reason the user came. ≥60% of viewport. | Three-line hierarchy applies within each item | Feed cards, data tables, article body, form fields |
| L4 Supporting | Context that aids L3. Hideable on mobile without loss. | Smallest, lowest contrast, often in sidebar or footer | Metadata panels, related links, help text, ads |

**Page-level rules:**
- Only one L1 per page. Multiple L1s = no anchor = scanning chaos.
- L2 must be visually subordinate to L1. If nav dominates the page title, hierarchy is broken.
- L3 gets ≥60% of viewport on mobile. If chrome (L2+L4) exceeds 40%, content is suffocated.
- L4 collapses or hides on mobile. If it can't be hidden without breaking the page, it's actually L3.

### 4. Progressive Disclosure
**Hick's Law**
Show less, reveal more on demand. Fewer visible choices = faster decisions.

### 5. Text Over Decoration
**Signal-to-Noise Ratio**
Color and weight create hierarchy, not boxes. Remove decoration that doesn't aid comprehension.

### 6. Content Over Chrome
**Information Density**
≥70% content-chrome ratio. Users come for content, not interface.

### 7. Natural Language
**Mental Models**
Readable phrases over jargon. Match user vocabulary.

### 8. Rhythm & Alignment
**Gestalt Continuity**
8pt grid, consistent spacing, aligned baselines. Visual rhythm creates calm.

### 9. Functional Integrity
**Affordance Theory + Data Integrity**
Every interactive element must have:
1. A working action (UI behavior)
2. Real data source/destination (backend connection)
3. Visual affordance matching its interactivity level

**DON'T BUILD:** Buttons without endpoints, forms without APIs, lists without sources, features as placeholders, mock data that looks real, interactive styling on static elements.

**IF BUILDING INCREMENTALLY:** Mark what's functional vs mock. Hide incomplete features. Document real vs placeholder. Use visible "Demo mode" warnings.

### 10. Content Resilience + Error Strategy
**Fault Tolerance + Dual-Coding Theory + Cooperative Principle**
Components handle variable formats gracefully: structured data, plain text, markdown. Numeric data includes semantic context — numbers without labels are brittle content.

Error and empty states follow structured content strategy:

**Error message pattern (what → why → fix):**
- **What happened:** One sentence, no jargon. "Your file couldn't be uploaded."
- **Why:** Brief, honest cause. "Files over 25MB aren't supported yet."
- **What to do:** Actionable CTA. "Compress the file or try a smaller one."

**Empty state pattern by context:**
- **First time:** Value promise + setup CTA. "Your research starts here."
- **Search:** Broaden query suggestion. "No matches — try different keywords."
- **Filter:** Reset filters CTA. "No sources match. Clear filters to see all 12."
- **All done:** Celebration + next step. "All caught up! Add more sources?"

**Error routing by type:**
- User error (typo, wrong format) → Inline correction with fix
- System error (timeout, server) → Retry action + "not your fault" language
- Permission error (auth, plan limit) → Upgrade CTA or login prompt
- Data error (empty API, malformed) → Graceful fallback + retry

### 11. Mobile-First Structure
**Responsive Design**
Base styles target mobile. Breakpoints add complexity for larger screens. Touch targets sized by screen position.

### 12. Purposeful Motion
**Temporal Gestalt + Affordance Theory**
Motion communicates meaning: lift signals interactivity, stagger signals group relationship, press-in confirms action. Never decorative. Always traceable to a communication purpose.

**Rules:**
- Every animation must answer: "What is this telling the user?"
- If the answer is "nothing" or "it looks nice," remove it
- Respect `prefers-reduced-motion` — reduce or eliminate

### 13. Voice Calibration
**Mental Models + Pragmatic Inference**
UI copy follows consistent voice rules. Tone adapts to context, but structure stays predictable. Users read UI copy in fragments — every word must earn its place.

**Button labels:** Verb + Object, ≤3 words. "Add Source" not "Click here to add a new source."
**Placeholder text:** Instruction, not description. "Search sources..." not "Enter your search query here."
**Tooltip copy:** Answer "what does this do?" in ≤8 words.
**Loading messages:** Tell what's happening. "Analyzing 3 sources..." not "Loading..."
**Confirmation messages:** State what happened + what changed. "Source added to research" not "Success!"

**Tone ladder:**
| Tone | When | Example |
|------|------|---------|
| Neutral | Default state, forms, data display | "No sources added yet." |
| Encouraging | First-time, empty states, onboarding | "Your research starts here." |
| Urgent | Errors, destructive actions, time limits | "Delete 3 sources? This can't be undone." |
| Celebratory | Completion, milestones, export success | "Summary ready — 2,400 words from 5 sources." |

---

<!-- [CP:TREES] -->
## DECISION TREES

### Border Usage
```
Need visual grouping?
├── Yes → Items share type?
│   ├── Yes → Single border around ALL, dividers between items
│   └── No → Category headers, separate groups
└── No → Use whitespace only
```

### Button Sizing
```
User intent?
├── Core conversion? (login, checkout, submit) → Full width
├── Equal choices? (yes/no, join/skip) → Side-by-side equal
└── Quick action? (save, edit, cancel) → Compact inline
```

### Content Format
```
Receive content → Type?
├── Object → Try flexible field names (title/headline/name)
├── String with markdown → Render markdown
├── Plain string → Render with paragraph breaks
└── Null/undefined → Show empty state
All paths → Apply three-line hierarchy
```

### Functional Integrity Check
```
Building interactive element?
├── Has backend API?
│   ├── Implemented → Build with real data
│   └── Not yet → Demo/prototype only?
│       ├── Yes → Mark clearly as demo
│       └── No → STOP — Don't build yet
└── No API → STOP — Don't build yet
```

### Element State
```
Has working action?
├── Yes → Make interactive
└── No →
    ├── Coming soon? → Mark "Coming soon" or hide
    ├── Needs upgrade? → Mark "Pro", link to upgrade
    └── Permanent no access? → HIDE entirely
```

### Progressive Disclosure
```
Content type?
├── Essential? → Always visible
└── Not essential?
    ├── Frequently needed? → Expand on hover/tap
    └── Rarely needed? → Behind action/link
```

### Loading State
```
Expected wait?
├── <100ms → No indicator
├── 100ms–1s → Spinner/pulse
├── 1s–3s → Skeleton screen
└── >3s → Progress bar
```

### Touch Target Sizing
```
Element type?
├── Primary action? → h-12 (48px), full-width on mobile
├── Secondary action? → h-10 or h-11 (40–44px)
├── Icon-only button? → w-11 h-11 (44px square)
├── Form input? → h-11 minimum (44px)
└── Other interactive? → min-h-[44px] with padding
```

Screen position: Top ≥46px, Center ≥27px, Bottom ≥44px

### Mobile Content Display
```
Content length?
├── Title → Mobile: line-clamp-2, Desktop: line-clamp-none
├── Description → Mobile: line-clamp-2, Desktop: full or line-clamp-3
├── Tags/Items → Mobile: 2–3 visible + count, Desktop: all or 5 + count
└── Actions → Mobile: stack primary/secondary, Desktop: horizontal row
```

### Mobile Navigation
```
Number of nav items?
├── ≤5 → Show all as tabs/buttons (horizontal scroll if needed)
└── >5 → Hamburger menu
    ├── Simple list → Slide panel
    └── Complex/nested → Full-screen overlay
```

### Contextual Metric Labels
```
Displaying a numeric value?
├── Meaning obvious from surrounding content? → Skip label
├── Number in isolation? (card corner, widget) → Always add label
├── Number in data table with column headers? → Column header suffices
└── Number is a KPI or metric? → Always add label
```

### Card Interactivity Affordance
```
Card component — interactive?
├── No (display only) → No lift, no shadow change, no cursor change
├── Yes, navigates (detail view, link) → Full lift: -translate-y-0.5 + shadow-lg + pointer
├── Yes, inline actions (buttons/toggles inside) → Subtle lift: -translate-y-px + shadow-md
└── Yes, card IS the action (select/toggle) → Full lift + border accent change
```

### Staggered Transitions
```
Multiple elements changing state together?
├── How many?
│   ├── 1 → No stagger
│   ├── 2–5 → Stagger 40–80ms per item
│   └── 6+ → Stagger first 5, batch the rest
├── What's changing?
│   ├── Appearance (fade/slide in) → 50–80ms
│   ├── Color/style change → 40–60ms
│   └── Removal → Simultaneous or reverse stagger
└── Loading sequence? → Skeleton stagger
```

<!-- [CP:ERRORS] -->
### Error & Empty State Routing
```
Content area is empty or errored?
├── Error?
│   ├── User error → Inline fix near input. Neutral tone.
│   ├── System error → "Not your fault" + retry. Neutral/encouraging.
│   ├── Permission error → Upgrade/login CTA. Neutral.
│   └── Data error → Graceful fallback + retry. Neutral.
└── Empty?
    ├── First time → Value promise + setup CTA. Encouraging.
    ├── Search → Suggestions, broaden query. Neutral.
    ├── Filter → Reset filters CTA + total count. Neutral.
    └── All done → Celebration + next step. Celebratory.
```

<!-- [CP:PAGE-HIERARCHY] -->
### Page-Level Visual Hierarchy
```
Laying out a full page?
├── Identify L1 Anchor
│   ├── Exactly one? → Good
│   └── Multiple competing? → Demote all but one
├── Check L2 (nav/controls)
│   ├── Visually smaller than L1? → Good
│   └── Dominates page title? → Reduce nav weight
├── Check L3 (primary content)
│   ├── ≥60% mobile viewport? → Good
│   └── Chrome > 40%? → Reduce chrome
└── Check L4 (supporting)
    ├── Hides on mobile without breaking? → Good, it's L4
    └── Breaking? → It's L3, promote it
```

<!-- [CP:VOICE] -->
### UI Copy Voice
```
Writing UI copy?
├── Button label? → Verb + Object, ≤3 words
├── Placeholder? → Instruction, not description
├── Error message? → What → Why → Fix (≤1 sentence each)
├── Empty state? → Match context + actionable CTA
├── Loading message? → State what's happening + count
├── Confirmation? → What happened + what changed
└── Tooltip? → "What does this do?" ≤8 words
```

### Mobile Enhancement Patterns
```
Building mobile interface?
├── Feed/list of cards?
│   ├── Need quick actions? → Add swipe gestures
│   ├── Cards expand to details? → Use bottom sheet
│   └── Content updates? → Add pull-to-refresh
├── Detail view from list? → Use bottom sheet (not modal)
├── Action menu with 3+ options? → Use bottom sheet (not dropdown)
└── Native app? → Add haptic feedback on actions
```

---

<!-- [CP:PATTERNS] -->
## PATTERN CATALOG

### Three-Line Content Structure

**Title:** 14–16px, medium weight, high contrast (7:1)
**Description:** 12–14px, regular, medium contrast (4.5:1), 3–4 line limit
**Metadata:** 11–12px, regular, low contrast (3:1)
**Spacing:** 3–4px after title, 4px after description (8pt grid)
**Mobile:** Single line preferred, max 2 lines for title

### Page-Level Hierarchy Implementation

```jsx
function PageLayout({ title, nav, children, sidebar }) {
  return (
    <div className="min-h-screen">
      {/* L1 Anchor — one per page, largest, highest contrast */}
      <header className="px-4 pt-6 pb-4">
        <h1 className="text-2xl md:text-3xl font-bold text-gray-900">{title}</h1>
      </header>
      {/* L2 Orient — navigation, controls, smaller than L1 */}
      <nav className="px-4 py-2 border-b border-gray-200 sticky top-0 bg-white z-10">{nav}</nav>
      <div className="flex">
        {/* L3 Primary Content — ≥60% viewport */}
        <main className="flex-1 min-w-0 p-4">{children}</main>
        {/* L4 Supporting — hides on mobile */}
        {sidebar && (
          <aside className="hidden lg:block w-72 p-4 border-l border-gray-200">{sidebar}</aside>
        )}
      </div>
    </div>
  );
}
```

L1 sizing: Mobile `text-2xl`, desktop `text-3xl`, never smaller than L2, never more than one.

### Contextual Metric Display

```jsx
function MetricDisplay({ value, label, color = 'text-blue-600' }) {
  if (!value) return null;
  return (
    <div className="text-right">
      <span className={`text-sm font-bold ${color}`}>{value}</span>
      {label && <p className="text-[10px] text-gray-400 mt-0.5">{label}</p>}
    </div>
  );
}
```

Skip label when: explicit label nearby, column header in table, self-evident value.

### Grouped Container

```
SECTION HEADER (11px uppercase, gray-500)
┌─────────────────────────────────┐ ← Single border
│ Title            │    Metadata  │
│ Description      │              │
├─────────────────────────────────┤ ← Divider
│ Title 2          │    Metadata  │
└─────────────────────────────────┘
```

Group when: items share type, user scans multiple, actions apply to group. Don't when: items distinct, 1–2 items, single item focus.

### Flexible Content Handling

**Field name alternatives:** Title: `title`→`headline`→`name`→`subject`. Description: `description`→`summary`→`content`→`body`. Date: `date`→`timestamp`→`published`→`created_at`. Metric: `value`→`amount`→`count`→`total`.

```javascript
function ContentCard({ data }) {
  if (typeof data === 'string') return renderMarkdown(data);
  const title = data.title || data.headline || data.name;
  const desc = data.description || data.summary || data.content;
  const meta = data.date || data.timestamp;
  const metricValue = data.value || data.amount || data.count;
  const metricLabel = data.label || data.unit || data.context;
  return (
    <div>
      {title && <h3 className="font-medium">{title}</h3>}
      {desc && <p className="text-gray-600">{desc}</p>}
      {meta && <span className="text-gray-500 text-xs">{meta}</span>}
      {metricValue && (
        <div className="text-right">
          <span className="text-sm font-bold text-blue-600">{metricValue}</span>
          {metricLabel && <p className="text-[10px] text-gray-400 mt-0.5">{metricLabel}</p>}
        </div>
      )}
    </div>
  );
}
```

### Error & Empty State Content

```jsx
function ErrorState({ what, why, fix, onRetry }) {
  return (
    <div className="text-center py-8 px-4">
      <div className="mx-auto mb-3 w-10 h-10 rounded-full flex items-center justify-center bg-red-100 text-red-600">
        <AlertIcon size={20} />
      </div>
      <h3 className="text-base font-semibold text-gray-900 mb-1">{what}</h3>
      {why && <p className="text-sm text-gray-600 mb-4">{why}</p>}
      {onRetry && (
        <button onClick={onRetry} className="h-10 px-4 bg-blue-600 text-white rounded-lg text-sm font-medium">
          {fix || 'Try Again'}
        </button>
      )}
    </div>
  );
}
```

```jsx
function EmptyState({ icon, title, description, actionLabel, onAction }) {
  return (
    <div className="text-center py-12 px-4">
      {icon && <div className="mx-auto mb-3 opacity-50">{icon}</div>}
      <h3 className="text-base font-medium text-gray-700 mb-1">{title}</h3>
      {description && <p className="text-sm text-gray-500 mb-4 max-w-sm mx-auto">{description}</p>}
      {onAction && (
        <button onClick={onAction} className="h-10 px-4 bg-blue-600 text-white rounded-lg text-sm font-medium">
          {actionLabel}
        </button>
      )}
    </div>
  );
}
```

**Copy by context:**
| Context | ✗ Don't | ✓ Do |
|---------|---------|------|
| First time | "No items found." | "Your research starts here. Add your first source." |
| Search | "No results." | "No matches for 'Kuberntes' — check spelling?" |
| Filter | "Nothing matches." | "No sources match these filters. Clear all?" |
| System error | "Something went wrong." | "Couldn't load sources. Check connection and retry." |
| Permission | "Access denied." | "This requires a Pro plan. Upgrade to unlock." |
| Completion | "No more items." | "All caught up! Add more sources to keep going." |

### Voice Quick Reference

| Element | Pattern | Max | Example |
|---------|---------|-----|---------|
| Button | Verb + Object | ≤3 words | "Add Source" |
| Destructive button | Verb + Object + consequence | ≤5 words | "Delete 3 sources" |
| Placeholder | Instruction + context | ≤4 words | "Search sources..." |
| Tooltip | "What does this do?" | ≤8 words | "Filter by document type" |
| Loading | Action + count | ≤5 words | "Analyzing 3 sources..." |
| Success | What happened + delta | ≤8 words | "Source added to research" |
| Error (inline) | Wrong + fix | ≤12 words | "File too large. Max 25MB." |

### Status Indication

Text color only (no backgrounds): Success `green-600`, Warning `amber-600`, Info `blue-600`, Error `red-600`, Neutral `gray-600`. Exception: removable filter chips need subtle background.

### Navigation States

**Top Nav:** Unselected `gray-600`, hover `gray-900` (150ms), selected `gray-900` medium + 2px bottom border. Never background boxes.

**Side Nav:** Unselected `gray-700` + `hover:bg-gray-100`, selected `bg-blue-50 text-blue-700` medium. 224px width, 18px icons.

```jsx
<nav className="flex gap-8 border-b border-gray-200">
  {tabs.map(tab => (
    <button className={`py-4 text-sm ${
      active === tab ? 'text-gray-900 font-medium border-b-2 border-gray-900' : 'text-gray-600 hover:text-gray-900'
    }`}>{tab}</button>
  ))}
</nav>
```

### Card Interaction States

**Interactive (navigates):** `hover:-translate-y-0.5 hover:shadow-lg hover:shadow-gray-200/50 hover:border-gray-300 cursor-pointer`
**Inline actions:** `hover:-translate-y-px hover:shadow-md hover:shadow-gray-200/50 hover:border-gray-300`
**Non-interactive:** No lift, no shadow, no pointer.
**Mobile press-in:** `active:scale-[0.98] transition-transform duration-100`
**Timing:** 200ms desktop / 100ms mobile. `ease-out`.

### Element States

**HIDE:** Permanently unavailable → don't render. **DISABLE:** Contextually unavailable → `bg-gray-200 text-gray-400 cursor-not-allowed`. **MARK:** Requires action → badge (Coming soon = amber, Pro = purple, Beta = blue).

### Loading States

<100ms: none. 100ms–1s: spinner. 1s–3s: skeleton (match three-line, shimmer 1.5s, max 5 items). >3s: progress bar. Loading copy: "Analyzing 3 sources..." not "Loading..."

### Staggered Transitions

Per-item: 40–80ms (60ms sweet spot). Total: ≤400ms. Duration per item: 200–300ms. Easing: ease-out entry, ease-in exit. Exit: simultaneous or reverse-faster.

```jsx
{items.map((item, index) => (
  <span className="transition-all duration-300"
    style={{ transitionDelay: `${index * 60}ms` }}>
    {item.label}
  </span>
))}
```

### Functional Integrity

```jsx
// ❌ DON'T
<button onClick={() => console.log('TODO')}>Save</button>

// ✅ DO: Only if backend exists
{hasBackendAPI && <button onClick={async () => { await fetch('/api/save', { method: 'POST', body: JSON.stringify(formData) }); }}>Save</button>}

// ✅ DO: Mark as demo
<div className="border-2 border-amber-500 rounded-lg p-4">
  <p className="text-amber-700 text-xs font-medium">Demo mode — not connected to real data</p>
</div>
```

---

<!-- [CP:MOBILE] -->
## MOBILE PATTERNS

### Touch Targets
WCAG 2.2: AA ≥24×24px, AAA ≥44×44px. 4px minimum spacing between adjacent targets under 24px.

```html
<button class="w-11 h-11 flex items-center justify-center"><Icon size={16} /></button>
<button class="h-11 px-4 text-sm font-medium">Action</button>
<button class="h-12 w-full text-sm font-medium">Primary Action</button>
```

### Mobile-First Classes
```html
<!-- ✓ --> <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
<!-- ✗ --> <div class="grid grid-cols-3 md:grid-cols-2 sm:grid-cols-1">
```

### Content Truncation
```html
<h3 class="line-clamp-2 md:line-clamp-none">
<p class="line-clamp-2 md:line-clamp-3 lg:line-clamp-none">
```

### Limited Items
```jsx
{tags.slice(0, 2).map(tag => <Tag>{tag}</Tag>)}
{tags.length > 2 && <span className="text-xs text-gray-500">+{tags.length - 2}</span>}
```

### Action Stacking
```html
<div class="flex flex-col gap-2">
  <button class="w-full h-12 bg-blue-600 text-white rounded-xl active:bg-blue-700">Primary</button>
  <div class="flex gap-2">
    <button class="flex-1 h-10 bg-gray-100 rounded-lg active:bg-gray-200">Secondary</button>
    <button class="flex-1 h-10 bg-gray-100 rounded-lg active:bg-gray-200">Tertiary</button>
  </div>
</div>
```

### Input Sizing
`h-11 px-4 text-base rounded-xl` (≥16px prevents iOS auto-zoom)

### Safe Area Padding
`pb-6` or `padding-bottom: max(1.5rem, env(safe-area-inset-bottom))`

### Overflow Indicators
```html
<div class="relative">
  <div class="flex gap-2 overflow-x-auto scrollbar-hide">...</div>
  <div class="absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-white to-transparent pointer-events-none" />
</div>
```

### Active States
`active:bg-blue-700` / `active:bg-gray-200` on all tappable elements

### Scroll Margin
`[id] { scroll-margin-top: 5rem; }` when using sticky headers

### Swipe Actions
Right = positive (save), left = negative (delete). 80px threshold. Haptic on trigger.

### Bottom Sheet
Use over modal for: detail views, 3+ option menus, context-preserving forms. Sizes: small `max-h-[40vh]`, medium `max-h-[60vh]`, large `max-h-[85vh]`.

### Pull to Refresh
60px threshold. Spinner during refresh. Return to top after.

### Complete Mobile Card

```jsx
function MobileCard({ item, isInteractive = true }) {
  return (
    <div className={`bg-white border border-gray-200 rounded-xl p-4 space-y-3
      transition-all duration-200 ease-out
      ${isInteractive ? 'hover:-translate-y-0.5 hover:shadow-lg hover:shadow-gray-200/50 hover:border-gray-300 cursor-pointer active:scale-[0.98]' : ''}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">{item.source}</span>
          <span className="text-gray-300">•</span>
          <span className="text-sm text-gray-500">{item.time}</span>
        </div>
        <button className="w-10 h-10 flex items-center justify-center text-gray-400 -mr-2">
          <ExternalLink size={16} />
        </button>
      </div>
      <h3 className="text-base font-semibold line-clamp-2 md:line-clamp-none">{item.title}</h3>
      <p className="text-sm text-gray-600 line-clamp-2">{item.description}</p>
      <div className="flex items-center gap-1.5">
        {item.tags.slice(0, 2).map((tag, i) => (
          <span className={`px-2 py-0.5 text-xs rounded-full ${i === 0 ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'}`}>{tag}</span>
        ))}
        {item.tags.length > 2 && <span className="text-xs text-gray-500">+{item.tags.length - 2}</span>}
      </div>
      {item.metric && (
        <div className="text-right">
          <span className="text-sm font-bold text-blue-600">{item.metric.value}</span>
          {item.metric.label && <p className="text-[10px] text-gray-400 mt-0.5">{item.metric.label}</p>}
        </div>
      )}
      <div className="flex flex-col gap-2 pt-1">
        <button className="w-full h-12 bg-blue-600 text-white rounded-xl text-sm font-medium active:bg-blue-700">Primary</button>
        <div className="flex gap-2">
          <button className="flex-1 h-10 bg-gray-100 rounded-lg text-sm font-medium active:bg-gray-200">Secondary</button>
          <button className="flex-1 h-10 bg-gray-100 rounded-lg text-sm font-medium active:bg-gray-200">Tertiary</button>
        </div>
      </div>
    </div>
  );
}
```

---

<!-- [CP:RULES] -->
## IMPLEMENTATION GUIDE (FOR LLMs)

### Auto-Apply Rules

| # | Rule | Implementation |
|---|------|----------------|
| 1 | Content structure | Three-line pattern (title, description, metadata) |
| 2 | Grouping | Single border + dividers for related items |
| 3 | Button sizing | Core conversion = full, quick action = compact |
| 4 | Category headers | Above grouped content (11px uppercase gray-500) |
| 5 | Search debounce | 300ms |
| 6 | Touch targets | ≥44px mobile, ≥24px desktop |
| 7 | Loading states | Match wait time (skeleton for 1–3s) |
| 8 | Empty states | Value-driven with CTA, tone matched to context |
| 9 | Status | Text color only |
| 10 | Icons | Max 2 colors per context |
| 11 | Content input | Accept string OR object |
| 12 | Field names | Try alternatives (title/headline/name) |
| 13 | Markdown | Support `#` `**` `-` paragraphs minimum |
| 14 | Functional integrity | Only build with real backend endpoints |
| 15 | Data sources | Verify API exists before building UI |
| 16 | Mobile-first ordering | Base = mobile, breakpoints add complexity |
| 17 | Input font size | ≥16px on mobile (prevents iOS zoom) |
| 18 | Content truncation | line-clamp-2 on mobile, expand on demand |
| 19 | Limited items | Show 2–3 + count, reveal on demand |
| 20 | Action stacking | Primary full-width, secondary row on mobile |
| 21 | Safe area padding | pb-6 minimum for home indicator |
| 22 | Active states | All tappable elements need `active:` feedback |
| 23 | Overflow hints | Fade gradient for horizontal scroll |
| 24 | Scroll margin | Add when using sticky headers |
| 25 | Contextual metrics | Numeric KPIs include semantic label beneath value |
| 26 | Card interactivity | Interactive cards get lift (desktop) or press-in (mobile) |
| 27 | Staggered transitions | Multi-element state changes stagger 40–80ms/item, ≤400ms total |
| 28 | Button labels | Verb + Object, ≤3 words |
| 29 | Error messages | Three-part: what → why → fix. Route by error type. |
| 30 | Page hierarchy | Exactly one L1 anchor per page. L3 ≥60% mobile viewport. |

### Always Ask Before

1. Individual borders on list items
2. Full-width buttons for non-critical actions
3. Background boxes for status
4. >2 icon colors in same context
5. Technical jargon without confirmation
6. Non-functional elements that look interactive
7. UI without real data source/API endpoint
8. Forms without backend submission handler
9. Mock data that looks real
10. Desktop-first class ordering
11. Touch targets under 44px on mobile
12. All items visible when list exceeds 3–5 on mobile
13. Numeric values without semantic labels
14. Hover lift on non-interactive cards
15. Simultaneous state change on 3+ elements
16. Generic error copy ("Something went wrong")
17. Empty states without actionable CTA
18. Multiple L1 anchors on a single page
19. Button labels >3 words or missing verb
20. Loading messages that say "Loading..." without context

### Strict vs Flexible

**Flexible (maintain principle, vary implementation):** Color values (keep ratios), border radius (stay consistent), font family (keep size/weight ratios), spacing (8pt grid), lift amount (1–3px), stagger timing (40–80ms), shadow tint, metric label position, tone choice, L1 placement, error icon choice.

**Strict (audit as violations):** Group vs individual borders, button sizing by context, three-line hierarchy, touch ≥44px mobile, contrast ≥4.5:1 text / ≥3:1 large, content-chrome ≥70%, functional integrity, real data sources, mobile-first ordering, content truncation, interactive card lift, non-interactive no lift, metric labels, stagger ≤400ms, button labels ≤3 words Verb+Object, error what→why→fix, empty states must have CTA, one L1 per page, L3 ≥60% viewport, loading states what's happening.

---

## ACCESSIBILITY (WCAG 2.2 AA)

| Requirement | Minimum | Why |
|------------|---------|-----|
| Text contrast | 4.5:1 normal, 3:1 large | Low vision |
| Touch targets | 44×44px mobile, 24×24px desktop | Fitts' Law |
| Focus indicators | Visible on all interactive | Keyboard nav |
| Color + text/icon | Never color alone | Colorblind |
| Motion respect | Honor prefers-reduced-motion | Vestibular |

**Checklists:** Keyboard navigable? Focus visible? Info clear without color? Targets meet minimums? Animations respect motion prefs? Skip link? Input ≥16px? Safe area padding? Active states on tappables? Errors explain what/why/fix? Empty states actionable? Loading describes what?

---

## ANTI-PATTERNS

| Don't | Do | Audit |
|-------|----|-------|
| Individual borders per item | Single group border + dividers | "Group or isolate?" |
| Full-width quick actions | Compact inline | "Size = intent?" |
| Status badges with backgrounds | Text color only | "Aids comprehension?" |
| Nav boxes on active tab | Text + bottom border | "Button or state?" |
| >2 icon colors | 2 semantic colors | "Count ≤2?" |
| Technical jargon | Natural language | "Non-expert understands?" |
| Non-functional buttons | Only if action exists | "Click does something?" |
| Mock data looking real | Mark demo OR hide | "Real or mock?" |
| Forms without APIs | Wait for backend | "Where submits?" |
| Strict content schemas | String OR object | "Variable formats?" |
| Desktop-first classes | Mobile base, breakpoints add | "First class = mobile?" |
| All tags on mobile | 2–3 + count | "Mobile cluttered?" |
| Small touch targets | ≥44px mobile | "Thumb can tap?" |
| Input <16px | text-base minimum | "iOS auto-zoom?" |
| Bare numeric KPIs | Semantic label | "Number alone sensible?" |
| Lift on static cards | No lift/shadow/pointer | "False interactivity?" |
| Full lift + inline actions | Subtle lift (-translate-y-px) | "Lift vs inner buttons?" |
| No hover on interactive cards | Lift (desktop) / press-in (mobile) | "Clickable obvious?" |
| 3+ items change at once | Stagger 40–80ms/item | "Everything snaps?" |
| Stagger >400ms | Cap 5 items, batch rest | "Feels sluggish?" |
| Forward stagger removal | Simultaneous/reverse | "Exit hesitant?" |
| "Something went wrong" | what → why → fix | "User knows what happened?" |
| "No results found" | Context CTA + value | "Helps or dead-ends?" |
| "Loading..." | State what's loading | "Knows what waiting for?" |
| Button >3 words | Verb + Object ≤3 | "Scans <1 second?" |
| Multiple L1 on page | Demote to L2+ | "Eye lands where?" |

---

<!-- [CP:AUDIT] -->
## AUDIT FRAMEWORK

### Quick Audit (26 Questions)

**Core (1–15):** 1. Borders group/isolate? 2. Button size = intent? 3. Three-line hierarchy clear? 4. Only needed content visible? 5. Status text-only? 6. Icons ≤2 colors? 7. Natural language? 8. Chrome ≤30%? 9. Loading = wait time? 10. Click does something? 11. Handles string+object? 12. Field names flexible? 13. Left/top aligned? 14. Real backend? 15. API exists?

**Mobile (16–20):** 16. Touch ≥44px? 17. Base = mobile? 18. Content clamped? 19. Items 2–3+count? 20. Actions stacked?

**Interaction (21–23):** 21. Metrics labeled? 22. Cards lift on hover? 23. Groups stagger?

**Content Strategy (24–26):** 24. Errors what→why→fix? 25. Empty states CTA+context? 26. One L1, L3 ≥60%?

### Deep Audit (By Principle)

**Gestalt:** Related items share single border? Dividers between not around? Unrelated items whitespace/headers?

**Fitts:** Core = full-width? Equal = side-by-side? Quick = compact? Touch ≥44px mobile?

**Cognitive Load:** Three-line consistent? Same positions? 8pt rhythm?

**Signal-to-Noise:** Status text-only? Icons ≤2 colors? Decoration serves comprehension?

**Hick:** Detail on demand? Filters collapsible? Advanced hidden?

**Mental Models:** Labels match vocabulary? Errors explain what/why/fix? Time relative <24h?

**Content Focus:** ≥70% content? Search prominent? Nav doesn't dominate?

**Affordance:** All interactive have actions? Non-functional don't look clickable? States marked? APIs verified? Mock labeled? Forms have endpoints?

**Resilience:** Multiple formats? Alternative field names? Basic markdown? Null/undefined graceful? Metric labels? Error three-part? Empty states CTA?

**Mobile-First:** Base = mobile? Breakpoints add? Touch ≥44px? Truncated? Items limited? Stacked? Input ≥16px? Safe area? Active states?

**Motion:** Interactive lift desktop? Press-in mobile? Non-interactive NO lift? Lift matches type? Stagger 40–80ms? Total ≤400ms? Exit simultaneous/reverse? Respects reduced-motion?

**Voice:** Buttons Verb+Object ≤3? Placeholders instruction? Tooltips ≤8 words? Loading what's happening? Confirmations what changed? Destructive shows consequence? Errors route by type? Empty states match context?

**Page Hierarchy:** One L1? L1 largest/highest contrast? L2 subordinate? L3 ≥60% mobile? L4 hideable?

---

## SEMANTIC TOKENS

```
Contrast:     high ~7:1 (text, L1) | medium ≥4.5:1 (desc, L3) | low ≥3:1 (meta, L4) | accent ≥4.5:1 (links, metrics)
Surface:      base (page bg) | elevated (cards) | grouped (list containers)
Border:       group (outer) | divider (within) | subtle (hairline)
Touch:        primary 48px | secondary 44px | minimum 44px
Motion:       lift.full -2px | lift.subtle -1px | press scale-0.98 | duration 200ms/100ms | stagger 60ms | ease-out/ease-in
Metric:       value text-sm font-bold | label text-[10px] gray-400 mt-0.5
Hierarchy:    L1 text-2xl/3xl bold | L2 text-sm medium | L3 three-line ≥60% | L4 text-xs gray-500 hidden lg:block
Voice:        button ≤3 words | error what→why→fix | empty CTA+tone | loading ≤5 words | confirm ≤8 words | tooltip ≤8 words
```

---

<!-- [CP:QUICK-REF] -->
## QUICK REFERENCE

### For Every Component Ask

Borders: group or isolate? • Buttons: size = intent? Label Verb+Object ≤3? • Content: three-line? • Status: text only? • Icons: ≤2 colors? • Language: natural? • Chrome: ≥70% content? • Loading: matches wait? Says what? • Functional: click does something? • Backend: verified? • Data: real? • Format: string+object? • Fields: alternatives? • Mobile-first: base = mobile? • Touch: ≥44px? • Truncation: clamped? • Metrics: contextual? • Cards: lift = interactivity? • Groups: stagger? • Errors: what→why→fix? • Empty: CTA+tone? • Page: one L1? L3 ≥60%?

### North Star Questions

1. Cognitive predictability?
2. Traceable to perceptual science?
3. Auditable by humans and LLMs?
4. Reduces user strain?
5. Quiet intelligence or ornament?
6. Real data or just looks real?
7. Works on 320px?
8. Motion communicates or just moves?
9. User knows what to do on this error?
10. Copy scans in <1 second?

### Tailwind Quick Reference

```
Touch:     w-11 h-11 (44px icon) | h-11/h-12 (input/btn) | min-h-[44px]
Mobile:    flex-col md:flex-row | grid-cols-1 md:grid-cols-2 lg:grid-cols-3
Truncate:  truncate | line-clamp-2 | line-clamp-none (desktop)
Safe:      pb-6
Active:    active:bg-gray-200 | active:bg-blue-700
Lift:      hover:-translate-y-0.5 (full) | hover:-translate-y-px (subtle)
Press:     active:scale-[0.98] transition-transform duration-100
Stagger:   style={{ transitionDelay: `${index * 60}ms` }}
Metrics:   text-sm font-bold / text-[10px] text-gray-400 mt-0.5
L1:        text-2xl md:text-3xl font-bold text-gray-900
L3:        flex-1 min-w-0 (≥60%)
L4:        hidden lg:block w-72
```

---

## VERSION HISTORY

| Version | Changes |
|---------|---------|
| 6.2 | Mobile-first foundations, touch targets, content truncation, action stacking, safe area |
| 6.2.1 | Mobile enhancements: swipe, bottom sheet, pull-to-refresh, haptic |
| 6.2.2 | Interaction patterns: metric labels, card lift, staggered transitions |
| 6.3 | Consolidation: 12 principles, 27 rules, 23 audit questions |
| 6.4.1 | Content strategy: Voice Calibration (P13), Error/Empty routing (P10 ext), Page Hierarchy (P3 ext). 13 principles, 30 rules, 26 audit questions |

---

*Calm Precision 6.4.1 — Content Strategy + Interaction Patterns*
*Token-optimized • Plain language • Decision trees • Audit-ready*
*Foundation: Gestalt, Fitts, Hick, Cognitive Load, Signal-to-Noise, Affordance, Fault Tolerance, Temporal Gestalt, Dual-Coding, Pragmatic Inference, Attentional Cascade, Cooperative Principle*
