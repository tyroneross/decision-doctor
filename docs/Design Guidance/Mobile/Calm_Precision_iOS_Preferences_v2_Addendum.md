# Calm Precision — iOS Mobile Preferences v2 Addendum

Updates to iOS Mobile Preferences v1.0 based on resolved A/B selections (4/15/2026 v2).
Codifies the 8 previously-open categories, flags new conflicts introduced by second-pass choices,
and closes coverage gaps the first spec deferred.

**Reads with:** CP Native v1.1 + iOS Charts + iOS Preferences v1.0
**Authority:** v2 supersedes v1.0 where both address the same item. v1.0 sections not touched here remain in force.

---

## 0. DOCUMENT MAP

| Section | Covers |
|---------|--------|
| §1 | Change Summary (v1 → v2 deltas) |
| §2 | Tab Bar System (previously open) |
| §3 | Back Navigation (previously open) |
| §4 | Sheet System (handle + detents, previously open) |
| §5 | Tap / Press Feedback (previously open — HIGH CONFLICT) |
| §6 | Primary Button Depth (previously open — HIGH CONFLICT) |
| §7 | Swipe-to-Reveal Actions (previously open) |
| §8 | New Options Added in v2 (Cross-Fade, Branded Refresh, Full-Width Line, System Icon Empty, Top Banner) |
| §9 | Coverage Gaps the A/B Didn't Test (must-decide list) |
| §10 | Updated Auto-Apply Rules (P26–P45) |
| §11 | Updated CP 6.4.1 Conflict Audit |
| §12 | v2 Decision Backlog (what's still open) |

---

## §1. CHANGE SUMMARY (v1 → v2)

### 1.1 Previously Open Items — Now Decided

| Category | v2 Decision | Complexity |
|----------|-------------|------------|
| Tab Bar Style | Floating Pill + Auto-Hide + Icon-Only (stackable) | High — three patterns that can combine |
| Active Tab Indicator | Color Fill + Label Color | Low — single decision |
| Back Navigation | Back+Parent Title (push) + X Close (modal) | Medium — context-split |
| Bottom Sheet Handle | Dark Pill + Full Top Bar | Medium — context-split by sheet complexity |
| Sheet Detent Behavior | Two-Stop Snap (~30% / ~85%) | Low — single decision |
| Swipe-to-Reveal | Icon+Label Button + Full-Width Destructive | Medium — standard + destructive variant |
| Tap / Press Feedback | Opacity Dim + BG Highlight + Contained Ripple | **HIGH CONFLICT** — three different paradigms |
| Primary Button Depth | Soft Drop Shadow + Inner Rim + Glass | **HIGH CONFLICT** — can stack to over-decoration |

### 1.2 New Options Introduced in v2

| Category | Previously | Added in v2 | Implication |
|----------|-----------|-------------|-------------|
| Screen Transitions | 3 transitions | +Cross-Fade | Closes tab-switch / non-hierarchical gap |
| Pull-to-Refresh | Progress Arc only | +Logo/Brand Animation | Premium tier for branded moments |
| Pull-to-Refresh tier structure | Single choice | Now 2-tier | Standard + signature |
| List Separator | Card + Inset Hairline | **Inset Hairline REMOVED**, +Full-Width Line | Aggressive shift — see §8.3 |
| Empty States | 2 options | +System Icon + Text | Closes middle ground between minimal and illustrated |
| Toast | 2 options | +Top Banner | Adds high-visibility error channel |

### 1.3 Unchanged from v1

Typography, Numeric Display, Haptics, Toggles, Onboarding, Profile, Celebration, Splash, Scroll Physics, Skeleton Loading, Search Placement, Gradients (color/dark mode/accent).

---

## §2. TAB BAR SYSTEM

Three patterns selected that CAN combine: a floating pill tab bar that auto-hides on scroll and uses icon-only controls. This is a unified system, not three alternatives.

### 2.1 The Composed Tab Bar

```
┌─────────────────────────────────────┐
│                                     │
│         CONTENT AREA                │
│         (content scrolls)           │
│                                     │
│                                     │
│                                     │
│     ╭──────────────────────╮        │ ← Floating (12pt from bottom)
│     │  ◉   ○   ○   ○      │        │ ← Icon-only, 4 max
│     ╰──────────────────────╯        │ ← Pill shape, blur bg
└─────────────────────────────────────┘
```

**Behavior:**
- Floats 12pt above safe area bottom inset
- 28pt corner radius (full pill at standard height)
- `.ultraThinMaterial` or `.thinMaterial` backdrop for blur
- Auto-hides on scroll-down, reappears on scroll-up (300ms spring)
- Always visible on tab switch (not scroll-driven after explicit nav)
- Icon-only — no labels
- Max 4 tabs (icon-only readability)
- Minimum 44×44pt target

### 2.2 Active Tab Indicator

Single decision: **Color Fill + Label Color** — but since tabs are icon-only, "label color" doesn't apply. Translation:

- Inactive: SF Symbol outline, `.secondary` foreground
- Active: SF Symbol `.fill` variant, accent foreground
- Optional: subtle pill background behind active icon (3pt horizontal, 4pt vertical padding, accent at 12% opacity)

### 2.3 SwiftUI Implementation

```swift
struct FloatingTabBar: View {
    @Binding var selected: Tab
    @Binding var isVisible: Bool  // driven by scroll observer

    enum Tab: String, CaseIterable {
        case home, search, library, profile

        var iconOutline: String {
            switch self {
            case .home: return "house"
            case .search: return "magnifyingglass"
            case .library: return "books.vertical"
            case .profile: return "person.crop.circle"
            }
        }
        var iconFill: String { iconOutline + ".fill" }
    }

    var body: some View {
        HStack(spacing: 8) {
            ForEach(Tab.allCases, id: \.self) { tab in
                Button {
                    selected = tab
                    UISelectionFeedbackGenerator().selectionChanged()
                } label: {
                    Image(systemName: selected == tab ? tab.iconFill : tab.iconOutline)
                        .font(.system(size: 22, weight: .medium))
                        .foregroundStyle(selected == tab ? Color.accentColor : .secondary)
                        .frame(width: 44, height: 44)
                        .background(
                            selected == tab
                                ? Color.accentColor.opacity(0.12)
                                : Color.clear,
                            in: RoundedRectangle(cornerRadius: 10)
                        )
                }
                .buttonStyle(.plain)
            }
        }
        .padding(.horizontal, 8)
        .padding(.vertical, 6)
        .background(.ultraThinMaterial, in: Capsule())
        .overlay(Capsule().stroke(.white.opacity(0.1), lineWidth: 0.5))
        .padding(.horizontal, 40)  // inset from screen edges
        .padding(.bottom, 12)
        .offset(y: isVisible ? 0 : 120)
        .animation(.spring(duration: 0.3, bounce: 0.2), value: isVisible)
    }
}
```

### 2.4 Scroll-Driven Visibility

Track scroll direction with a `ScrollView` offset observer:

```swift
@State private var lastOffset: CGFloat = 0
@State private var isTabBarVisible = true

ScrollView {
    content
        .background(
            GeometryReader { geo in
                Color.clear.preference(
                    key: ScrollOffsetKey.self,
                    value: geo.frame(in: .named("scroll")).origin.y
                )
            }
        )
}
.coordinateSpace(name: "scroll")
.onPreferenceChange(ScrollOffsetKey.self) { offset in
    let delta = offset - lastOffset
    if abs(delta) > 30 {  // threshold to prevent jitter
        isTabBarVisible = delta > 0  // scroll up shows
        lastOffset = offset
    }
}
```

### 2.5 Constraints & Gotchas

- **Floating pill must not obscure content.** Add `.safeAreaInset(edge: .bottom) { Color.clear.frame(height: 70) }` so scroll content has bottom padding.
- **Auto-hide conflicts with modals.** When a sheet presents, the tab bar must stay hidden (presentationDetent logic).
- **Icon-only at 4 tabs is the ceiling.** 5+ tabs require labels for legibility — reconsider if the app has more top-level sections.
- **Accessibility.** Add `.accessibilityLabel("Home", traits: .isButton)` to every tab since there's no visible label.

### 2.6 Tab Bar Decision Tree

```
Building a tab bar?
├── Does the app have ≤4 top-level sections?
│   ├── YES → Floating Pill + Icon Only + Auto-Hide (standard)
│   └── NO → Reconsider architecture OR fall back to standard iOS tab bar with labels
├── Is the app primarily content consumption (feed, video, reading)?
│   └── YES → Auto-Hide is critical (maximize content area)
└── Is the app utility-first where nav should always be visible?
    └── Auto-Hide off — floating pill stays fixed
```

---

## §3. BACK NAVIGATION

Context-split across two modes.

### 3.1 The Two Modes

| Mode | Pattern | Use When |
|------|---------|----------|
| Hierarchical (push stack) | **Back + Parent Title** ("← Settings") | Any `NavigationLink` drilling deeper into a stack |
| Modal / Sheet | **X Close Button** (top-right) | `.sheet`, `.fullScreenCover`, anything presented as a layer |

### 3.2 Why the Split Matters

The visual distinction signals **modality vs. hierarchy** — a design principle that reduces user confusion about how to dismiss a screen:
- `←` tells user "going back to where I came from in a sequence"
- `×` tells user "closing this overlay, returning to base context"

If both modes use `×`, users can't predict whether they'll lose context or keep it.

### 3.3 Hierarchical Back Spec

- Position: top-left
- Icon: `chevron.backward` (SF Symbol)
- Label: parent screen's title
- Truncate at 80pt — longer parent titles show leading characters + ellipsis
- Swipe-right-from-edge gesture always enabled
- Never hide the back button (breaks user expectation)

```swift
NavigationStack {
    RootView()
        .navigationDestination(for: Session.self) { session in
            SessionDetailView(session: session)
                .navigationTitle("Session")
                .navigationBarTitleDisplayMode(.inline)
                .navigationBarBackButtonHidden(false)
        }
}
```

SwiftUI handles the parent title automatically via `navigationTitle()` on the root.

### 3.4 Modal Close Spec

- Position: top-right
- Icon: `xmark` or `xmark.circle.fill` (with background)
- Size: 28×28pt circle background, `Color(.tertiarySystemFill)` fill
- Swipe-down-to-dismiss enabled for sheets (disabled for destructive flows)
- Explicit "Done" text button if the action completes something (e.g., editing profile → "Done" saves)

```swift
.sheet(isPresented: $showEditor) {
    NavigationStack {
        EditorView()
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        showEditor = false
                    } label: {
                        Image(systemName: "xmark.circle.fill")
                            .font(.title3)
                            .foregroundStyle(.secondary)
                            .symbolRenderingMode(.hierarchical)
                    }
                    .accessibilityLabel("Close")
                }
            }
    }
    .presentationDragIndicator(.visible)
}
```

### 3.5 Edge Cases

- **Destructive flows:** Disable swipe-to-dismiss. Use `.interactiveDismissDisabled()` when unsaved changes exist. Prompt confirmation.
- **Multi-step modals:** Back within the modal uses `←`, close uses `×`. Both can coexist in the same screen top bar.
- **Full-screen cover without a stack:** Use X Close. Full-screen covers without nav stacks need dismissal affordance.

---

## §4. SHEET SYSTEM

### 4.1 Detent Behavior — Two-Stop Snap

Single decision: sheets snap between ~30% (compact) and ~85% (expanded). Drag crosses midpoint to transition.

```swift
.sheet(isPresented: $isPresented) {
    SheetContent()
        .presentationDetents([.fraction(0.30), .fraction(0.85)])
        .presentationDragIndicator(.visible)  // or custom per §4.2
        .presentationBackgroundInteraction(.enabled(upThrough: .fraction(0.30)))
}
```

**Behavior spec:**
- Spring animation 0.4s, 0.7 damping
- Background interaction enabled at compact (user can tap underlying content)
- Background interaction disabled at expanded (full focus on sheet)
- No third "small" detent — two stops prevent decision fatigue

### 4.2 Handle Style — Context Split

Two handle patterns selected, split by sheet complexity:

| Pattern | When | Spec |
|---------|------|------|
| **Dark Pill on Card** | Simple sheets — action confirmations, single-purpose views, media controls | 36pt wide × 5pt tall pill, `.white.opacity(0.3)` on dark, top-center, 8pt from top edge |
| **Full Top Bar with Handle** | Complex sheets — forms, multi-step flows, browse/search views | Pill above a 52pt header with title + close button |

### 4.3 Handle Decision Tree

```
Designing a sheet?
├── Is it a single focused action with ≤3 interactive elements?
│   └── Dark Pill on Card (minimal chrome)
├── Does it have a title that's essential for context?
│   └── Full Top Bar (title + close + handle)
├── Multi-step flow within the sheet?
│   └── Full Top Bar (plus step counter per §onboarding rules)
└── Will users frequently drag between detents?
    └── Both patterns support drag — pill alone suffices if content is simple
```

### 4.4 SwiftUI Examples

**Dark Pill (simple sheet):**
```swift
.presentationDragIndicator(.visible)
.presentationBackground(.ultraThinMaterial)
```

**Full Top Bar (complex sheet):**
```swift
NavigationStack {
    ComplexContent()
        .navigationTitle("Edit Session")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarLeading) { Button("Cancel") { dismiss() } }
            ToolbarItem(placement: .topBarTrailing) { Button("Save") { save() }.bold() }
        }
}
.presentationDetents([.fraction(0.30), .fraction(0.85)])
.presentationDragIndicator(.visible)  // pill still shows above nav bar
```

---

## §5. TAP / PRESS FEEDBACK — HIGH CONFLICT

Three patterns selected that are NOT tiered — they're genuinely different paradigms. One (Contained Ripple) is explicitly non-native iOS.

### 5.1 The Conflict

| Pattern | Origin | iOS-Native? |
|---------|--------|-------------|
| Opacity Dim | Web + iOS ghost buttons | ✅ Yes |
| Background Highlight | iOS UITableViewCell native | ✅ Yes |
| Contained Ripple | Material Design / Google | ❌ No |

Stacking all three on the same app creates inconsistency. Users learn one feedback pattern and expect it everywhere.

### 5.2 Resolution — Context Gating by Element Type

| Element Type | Feedback | Rationale |
|--------------|----------|-----------|
| Text links, ghost buttons, icon-only buttons | **Opacity Dim** | No bounds-defined background to highlight; opacity is the only signal |
| List rows, cells, navigation targets | **Background Highlight** | Native iOS expectation. Rows have clear bounds. |
| Primary CTAs, high-investment buttons (signature moments) | **Contained Ripple** | Ripple is a craft/signature moment — reserve for primary actions where the extra animation earns its place |

### 5.3 Tap Feedback Decision Tree

```
Element is tappable — what feedback?
├── Is it a text link or icon-only button (no filled bg)?
│   └── Opacity Dim (0.45 at 80ms, return 1.0 at 180ms)
├── Is it a list row, cell, or navigation target?
│   └── Background Highlight (bg → gray-200 at 50ms, return 150ms)
├── Is it a primary CTA / signature moment?
│   └── Contained Ripple (white 35% opacity, 400ms ease-out, clipped to bounds)
└── Is it a toggle, picker, or system control?
    └── System default (don't override UISwitch, UISlider, etc.)
```

### 5.4 Cap on Ripple Usage

Ripple is non-native. Apply sparingly:
- Primary CTA on onboarding screens ✅
- Primary CTA on empty-state screens ✅
- Primary CTA on a main dashboard ✅
- Every button everywhere ❌ (breaks iOS expectation)

**Rule:** ≤3 ripple-enabled buttons per app. If you find yourself adding ripple to a fourth, revisit whether it's actually signaling a primary moment.

### 5.5 SwiftUI Implementations

**Opacity Dim:**
```swift
struct OpacityDimStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .opacity(configuration.isPressed ? 0.45 : 1.0)
            .animation(.easeOut(duration: configuration.isPressed ? 0.08 : 0.18), value: configuration.isPressed)
    }
}
```

**Background Highlight (Row):**
```swift
struct RowHighlightStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .background(
                configuration.isPressed
                    ? Color(.systemGray5)
                    : Color.clear
            )
            .animation(.easeOut(duration: configuration.isPressed ? 0.05 : 0.15), value: configuration.isPressed)
    }
}
```

**Contained Ripple** requires tracking tap location and animating a circle from that point. Use a custom `ButtonStyle` with `GeometryReader` or a lightweight animation library (Lottie if already included).

---

## §6. PRIMARY BUTTON DEPTH — HIGH CONFLICT

Three depth treatments selected that CAN stack, producing over-decoration that violates CP Signal-to-Noise.

### 6.1 The Conflict

| Treatment | Adds | Risk |
|-----------|------|------|
| Soft Drop Shadow | Colored shadow below button (colored, not gray) | Medium — can look clean if restrained |
| Inner Highlight Rim | Lighter top stroke, darker bottom (lighting simulation) | Medium — skeuomorphic-lite |
| Glass / Frosted | Blur + transparency + subtle border | High — needs non-white bg to work |

Stacking ALL THREE on the same button = drop shadow + gradient + inner rim + glass blur. This is the opposite of Calm Precision.

### 6.2 Resolution — Mutual Exclusivity by Button Class

A button picks ONE depth treatment based on its role. Never stack.

| Button Class | Treatment | When |
|--------------|-----------|------|
| Standard Primary CTA | **Soft Drop Shadow** | Default. Any primary CTA on a solid background. |
| Premium / Signature CTA | **Inner Highlight Rim** | Hero CTAs — onboarding primary, purchase confirmation, key moment |
| CTA on Media / Rich Background | **Glass / Frosted** | Primary action over imagery, video, or mesh gradient — where a solid color button would conflict |

### 6.3 Button Depth Decision Tree

```
Primary CTA styling?
├── On a solid background (light or dark solid)?
│   └── Soft Drop Shadow (colored shadow, 4-8pt, 40-50% opacity)
├── On media content (photo, video, gradient)?
│   └── Glass / Frosted (rgba white 15%, blur 16px, white 25% border)
├── Hero / signature moment?
│   └── Inner Highlight Rim (top lighten 10-15%, bottom darken 5-10%)
└── Never stack two of these on the same button
```

### 6.4 SwiftUI Examples

**Soft Drop Shadow (default primary):**
```swift
struct PrimaryButtonStyle: ButtonStyle {
    let tint: Color

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .frame(maxWidth: .infinity)
            .padding(.vertical, 14)
            .background(tint, in: RoundedRectangle(cornerRadius: 12))
            .foregroundStyle(.white)
            .font(.headline)
            .shadow(color: tint.opacity(configuration.isPressed ? 0.2 : 0.45), radius: 20, x: 0, y: 6)
            .scaleEffect(configuration.isPressed ? 0.98 : 1.0)
            .animation(.easeOut(duration: 0.15), value: configuration.isPressed)
    }
}
```

**Inner Highlight Rim (hero):**
```swift
struct HeroButtonStyle: ButtonStyle {
    let tint: Color

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .frame(maxWidth: .infinity)
            .padding(.vertical, 16)
            .background(
                LinearGradient(
                    colors: [tint.opacity(1.15), tint, tint.opacity(0.9)],
                    startPoint: .top, endPoint: .bottom
                ),
                in: RoundedRectangle(cornerRadius: 14)
            )
            .overlay(
                RoundedRectangle(cornerRadius: 14)
                    .inset(by: 0.5)
                    .stroke(
                        LinearGradient(
                            colors: [.white.opacity(0.25), .clear, .black.opacity(0.15)],
                            startPoint: .top, endPoint: .bottom
                        ),
                        lineWidth: 1
                    )
            )
            .foregroundStyle(.white)
            .font(.headline)
            .scaleEffect(configuration.isPressed ? 0.98 : 1.0)
    }
}
```

**Glass / Frosted (over media):**
```swift
struct GlassButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .frame(maxWidth: .infinity)
            .padding(.vertical, 14)
            .background(
                .ultraThinMaterial,
                in: RoundedRectangle(cornerRadius: 12)
            )
            .overlay(
                RoundedRectangle(cornerRadius: 12)
                    .stroke(.white.opacity(0.25), lineWidth: 1)
            )
            .foregroundStyle(.white)
            .font(.headline)
            .opacity(configuration.isPressed ? 0.8 : 1.0)
    }
}
```

---

## §7. SWIPE-TO-REVEAL ACTIONS

Two patterns selected, complementary (not conflicting).

### 7.1 Pattern Split

| Pattern | Use |
|---------|-----|
| **Icon + Label Button** | Standard swipe actions — archive, pin, mark read, share |
| **Full-Width Destructive** | Delete actions — power-user shortcut for instant delete with undo |

### 7.2 Spec

**Icon + Label Button:**
- Revealed button is a colored rectangle (accent-toned per action)
- Minimum 64pt wide
- Icon (16pt) + label (caption weight) stacked vertically
- Reveal threshold: 80pt swipe before buttons stick
- Haptic `.impact(.medium)` on reveal

**Full-Width Destructive:**
- Only for delete/destroy actions
- Swipe past ~70% screen width fills row red
- Commits on release (no confirmation)
- **Always paired with undo snackbar** (Bottom Pill toast per §7 v1, 5-second window)

### 7.3 SwiftUI Native API

```swift
List(items) { item in
    ItemRow(item: item)
        .swipeActions(edge: .trailing, allowsFullSwipe: true) {
            Button(role: .destructive) {
                pendingDelete = item
                deleteWithUndo(item)
            } label: {
                Label("Delete", systemImage: "trash")
            }
        }
        .swipeActions(edge: .trailing) {
            Button {
                archive(item)
            } label: {
                Label("Archive", systemImage: "archivebox")
            }
            .tint(.blue)
        }
        .swipeActions(edge: .leading) {
            Button {
                togglePin(item)
            } label: {
                Label(item.isPinned ? "Unpin" : "Pin", systemImage: "pin")
            }
            .tint(.orange)
        }
}
```

### 7.4 Undo Pattern (Required with Full-Width Destructive)

```swift
@State private var recentlyDeleted: Item?

.overlay(alignment: .bottom) {
    if let item = recentlyDeleted {
        UndoSnackbar(
            message: "\(item.name) deleted",
            action: { restore(item); recentlyDeleted = nil },
            onDismiss: { recentlyDeleted = nil }
        )
        .transition(.move(edge: .bottom).combined(with: .opacity))
    }
}
```

---

## §8. NEW OPTIONS ADDED IN v2

### 8.1 Cross-Fade Transition

Adds a fourth screen transition — fills the gap for non-hierarchical navigation.

| Use | Pattern |
|-----|---------|
| Tab switches | Cross-Fade (200ms ease-in-out) |
| Theme changes, auth state changes | Cross-Fade |
| Non-hierarchical swaps (logged-in vs logged-out root) | Cross-Fade |

**Rule:** Cross-Fade is for when the user hasn't initiated a directional navigation. If the direction has meaning (forward/back/up), use Push/Hero/Modal. Cross-Fade means "no direction."

### 8.2 Updated Transition Decision Tree

```
Presenting a new screen?
├── Tab bar selection changed?
│   └── Cross-Fade (NEW)
├── Auth state or app root changed?
│   └── Cross-Fade (NEW)
├── Tapped element has a defining image that anchors next screen?
│   └── Hero Expansion
├── Temporary layer (modal, sheet)?
│   └── Slide Up
└── Otherwise (drilling deeper)
    └── Slide Push
```

### 8.3 List Separator Change — Full-Width Line (INSET HAIRLINE REMOVED)

**Significant shift.** v1 had Inset Hairline as the CP-aligned default; v2 replaces it with Full-Width Line.

**Implication:** List rows now have stronger visual separation. This can work, but requires stricter adherence to CP Principle 1 (Group, Don't Isolate) — if rows genuinely form a group, the full-width line must still sit INSIDE a single container, not around each row.

**Revised list pattern decision:**

| Pattern | Use |
|---------|-----|
| **Card Per Row** | Independent entities (feed items, each row is its own navigable unit) |
| **Full-Width Line** | Logical groups where separation needs to be stronger than inset hairline |

**When to pick Full-Width over Card Per Row:**
- Rows are scanned top-to-bottom as a sequence, not visited individually
- Rows have short content (single line, 1-2 lines max)
- Rows represent uniform items (all messages, all transactions)

**When to pick Card Per Row:**
- Each row is its own visual entity with metadata
- Rows might be reordered, pinned, or favorited
- Each row has rich content (multi-line, imagery)

### 8.4 System Icon + Text Empty State

Adds a middle ground between Text Only (too bare) and Custom Illustration (too heavy).

Updated empty state decision:

| Style | When |
|-------|------|
| **Text Only** | Minimal/editorial apps with strong typographic identity |
| **System Icon + Text** | Default fallback. Works anywhere. Uses SF Symbol 56pt in `.quaternary`. |
| **Custom Illustration** | Consumer/playful apps where a brand illustration is warranted |

**SwiftUI Pattern:**
```swift
ContentUnavailableView {
    Label("No Sessions Yet", systemImage: "timer")  // 56pt implied
} description: {
    Text("Complete your first focus session to start your history.")
} actions: {
    Button("Start Focus", action: start)
        .buttonStyle(.borderedProminent)
}
```

`ContentUnavailableView` is the native SwiftUI implementation of System Icon + Text.

### 8.5 Top Banner Toast (Added to Toast System)

Adds a third toast channel for high-visibility errors/alerts.

| Channel | Use |
|---------|-----|
| **Bottom Pill** | Success, info, general confirmations |
| **Inline Context Toast** | Field-specific feedback, row action success |
| **Top Banner** (NEW) | Errors, critical warnings, connectivity alerts |

**Top Banner Spec:**
- Full-width, 48pt tall
- Slides from top below status bar
- Auto-dismiss 3-4s (longer than bottom pill due to criticality)
- Tappable to open details or dismiss
- Use `.red` tint for errors, `.orange` for warnings

**Toast Routing Decision Tree:**
```
What kind of feedback?
├── Success / info / confirmation?
│   └── Bottom Pill
├── Error / critical warning / connectivity?
│   └── Top Banner
└── Inline validation (field, specific element)?
    └── Inline Context Toast
```

### 8.6 Pull-to-Refresh Tier Added

v2 adds Logo/Brand Animation as a premium tier.

| Tier | Pattern | When |
|------|---------|------|
| Standard | **Progress Arc** | Every refreshable list |
| Premium / Branded | **Logo Animation** | One flagship screen per app (home/main feed) where the brand moment earns its investment |

**Rule:** Same principle as Lottie tab animations — reserve for ONE location, not everywhere.

---

## §9. COVERAGE GAPS THE A/B DIDN'T TEST

These critical design system elements have no preference data yet. They must be decided before a complete mobile spec exists.

### 9.1 Typography Scale (Size & Weight)

Decided in previous specs:
- Family: DM Sans (per CP memory) or SF Pro (per iOS Native v1.0)
- Tight tracking on headings (per v1)

**Undecided:**
- Complete size scale (11/12/13/14/15/17/20/22/28/34/56?)
- Weight pairings (which weight at which size?)
- Line heights
- Mobile-specific overrides (iPhone vs iPad)

**Recommendation:** Lock to Apple's semantic styles (`.caption2` through `.largeTitle`) per the iOS Native doc. Don't invent a custom scale. Use DM Sans as the font family if your CP brand identity requires it, but apply it via `.fontDesign(.default)` override, not a size reinvention.

### 9.2 Spacing Scale

Current state: 8pt grid mentioned throughout, no explicit scale.

**Recommended commit:**
```
4   — tight (between title and subtitle)
8   — standard (between related items)
12  — comfortable (between groups in a section)
16  — section padding (card inner padding, section gaps)
20  — section separation
24  — major section
32  — page margins / hero padding
48  — large breaks (between unrelated pages elements)
```

### 9.3 Corner Radius Scale

Mentioned in v2: 10pt cards, 12pt buttons, 14pt hero buttons, 28pt tab bar pill.

**Recommended commit:**
```
6   — small (chips, pills inline)
10  — standard (cards, inputs)
12  — buttons
14  — hero buttons, featured cards
20  — sheet corners (iOS standard)
28  — tab bar pill (full pill at 44pt height)
∞   — Capsule (for full-pill elements at any height)
```

### 9.4 Shadow / Elevation Tokens

Beyond primary button, no shadow system exists.

**Recommended commit:**
```
elevation.none    — no shadow
elevation.subtle  — 0 1pt 2pt / 4% opacity / black — rests on surface
elevation.low     — 0 2pt 8pt / 8% opacity — raised card
elevation.medium  — 0 4pt 16pt / 12% opacity — floating element (toast, tab bar)
elevation.high    — 0 8pt 24pt / 16% opacity — modal, popover
elevation.cta     — 0 6pt 20pt / 40% opacity / tint color — primary button (§6)
```

### 9.5 Iconography System

Undecided. Options:

| System | Pros | Cons |
|--------|------|------|
| SF Symbols only | Free, semantic, auto-scales, multi-weight, VoiceOver | Generic — can look like "just another iOS app" |
| SF Symbols + custom | Best of both — consistency + brand moments | Requires asset maintenance |
| Custom icon family | Full brand control | High ongoing cost, breaks platform expectations |

**Recommendation:** SF Symbols as the default, custom icons ONLY for app-specific concepts that have no SF Symbol equivalent (e.g., FlowDoro's focus modes might warrant custom icons; settings gear doesn't).

**Weight rules (if SF Symbols):**
- Navigation: `.medium` weight
- Standard UI: `.regular` weight
- Emphasis / active states: `.semibold` weight
- Never `.black` or `.heavy` — too aggressive for iOS

### 9.6 Form Field Patterns

Undecided:
- Text field style (underline vs rounded border vs bottom line)
- Label position (floating vs above vs inline)
- Error state presentation (inline red vs field border change vs both)
- Disabled state treatment
- Read-only state visual distinction

**Recommendation for follow-up:** Run an A/B on text input patterns specifically. Form-heavy screens (settings, profile edit, onboarding quiz) will expose these gaps fast.

### 9.7 Keyboard Behavior

Undecided:
- Dismiss on tap outside? (`UIResponder.keyboardWillHideNotification` patterns)
- Keyboard toolbar accessories (Done, Next, Previous buttons)?
- Avoid-keyboard scroll behavior for multi-field forms
- Return key behavior per field type

**Recommendation:** Add `.scrollDismissesKeyboard(.interactively)` on all forms. Add a Done button toolbar accessory on numeric/decimal inputs. Use `.submitLabel()` on text fields to change return key semantics.

### 9.8 Status Bar Style

Undecided per screen type. Default iOS behavior is automatic (adapts to content), but this can conflict with custom backgrounds (mesh gradients, media).

**Recommended commit:**
```swift
// For mesh gradient / dark hero screens
.preferredColorScheme(.dark)

// For always-light content
.toolbarColorScheme(.light, for: .navigationBar)
```

### 9.9 Alert & Dialog Style

Undecided: system alerts vs custom dialogs?

**Recommendation:** System alerts for standard confirmations (iOS users expect them). Custom dialogs only when an alert's capabilities are insufficient (custom imagery, multi-step decisions, rich content).

### 9.10 Context Menu Patterns

Undecided: when to use long-press context menus vs action sheets vs inline buttons?

**Recommendation:**
- Long-press menu (`.contextMenu`) for power-user shortcuts on list rows (preview + actions)
- Action sheets (`.confirmationDialog`) for destructive choices from a button tap
- Inline buttons for anything that benefits from persistent visibility
- Never hide critical actions behind long-press only (discoverability tax)

### 9.11 Notification Permission Priming

Undecided: when/how to ask for notification permission?

**Recommendation:**
- Never ask on first launch (highest rejection rate)
- Prime with a custom screen explaining value BEFORE the system prompt
- Ask at the moment notifications become relevant (e.g., after user sets up first reminder)
- Use `UNAuthorizationOptions.provisional` for non-interruptive delivery during trial period

### 9.12 Offline / Error Recovery

Undecided: what happens when network fails mid-action?

**Recommendation:**
- Queue failed mutations locally (SwiftData)
- Show persistent banner when offline
- Retry on connectivity restoration (Network Framework monitoring)
- Never silently drop user actions

---

## §10. UPDATED AUTO-APPLY RULES

Adding to v1 rules P1–P25. v2 rules: P26–P45.

| # | Rule |
|---|------|
| P26 | Tab bar: floating pill, auto-hide on scroll, icon-only, max 4 tabs |
| P27 | Active tab: SF Symbol `.fill` variant + accent color + optional subtle pill background |
| P28 | Back navigation: `←` + parent title for push; `×` top-right for modal |
| P29 | Sheets: two-stop snap (~30% / ~85%), spring 0.4s damping 0.7 |
| P30 | Sheet handle: dark pill for simple sheets; full top bar for complex sheets |
| P31 | Tap feedback: opacity dim on links/icons; bg highlight on rows; ripple ≤3 signature buttons per app |
| P32 | Primary button depth: drop shadow (default) XOR inner rim (hero) XOR glass (over media) — never stack |
| P33 | Colored drop shadow uses button tint color, not gray |
| P34 | Swipe-to-reveal: icon+label buttons (64pt min); full-width destructive ALWAYS paired with undo snackbar |
| P35 | Cross-Fade for tab switches and auth state changes; never for hierarchical navigation |
| P36 | List separator: card-per-row for independent entities; full-width line for logical sequences |
| P37 | Empty state: System Icon + Text as default fallback; Text Only for minimal apps; Custom Illustration for consumer |
| P38 | Toast routing: Bottom Pill (success/info), Top Banner (errors), Inline Context (field) |
| P39 | Pull-to-refresh: Progress Arc default; Logo Animation on one flagship screen max |
| P40 | `ContentUnavailableView` used for all standard empty states (iOS 17+) |
| P41 | Every sheet includes `.presentationDragIndicator(.visible)` unless using Full Top Bar pattern |
| P42 | Cross-Fade duration 200ms; Hero 350ms; Push 300ms; Modal 350ms — consistent timing library |
| P43 | Floating tab bar requires `.safeAreaInset(edge: .bottom)` spacer on scroll content |
| P44 | Glass button requires non-white background (media, gradient, dark) to render correctly |
| P45 | Destructive full-swipe commits immediately + shows undo snackbar for 5s minimum |

---

## §11. UPDATED CP 6.4.1 CONFLICT AUDIT

v1 audit (§15 of v1.0) remains. v2 adds:

### 11.1 Contained Ripple Conflict

**CP Principle 12 (Purposeful Motion):** Motion must communicate. Ripple is decorative by origin (Material Design).

**Reconciliation:** §5.4 — Ripple is a *signature* moment, not default feedback. Capped at ≤3 buttons per app, only primary CTAs. The rule itself communicates "this is important."

**Review checkpoint:** For every ripple, ask "does this button's importance justify a non-native iOS feedback pattern?" If the answer is "it's a standard button," remove ripple and use opacity dim or bg highlight.

### 11.2 Button Depth Stack Conflict

**CP Principle 5 (Text Over Decoration) + Principle 6 (Content Over Chrome):** Decoration competes with content.

**Reconciliation:** §6.2 — Mutual exclusivity enforced. One button = one depth treatment. Stacking is a violation.

**Review checkpoint:** Inspect every primary button — does it have drop shadow AND gradient AND border AND blur? If yes, strip to one. Pick by context (§6.3).

### 11.3 Floating Tab Bar vs CP Page Hierarchy

**CP Page Hierarchy §C:** L2 (navigation) must be visually subordinate to L1 (page anchor).

**Risk:** Floating pill tab bar with blur and glow can be visually dominant — stealing attention from L1 page titles.

**Reconciliation:** Tab bar is L2. Its visual weight must not exceed L1. Test: glance at a screen — does your eye go to the page title first or the tab bar? If tab bar, reduce its prominence (lower backdrop opacity, smaller icons, thinner stroke).

**Review checkpoint:** Build every major screen with placeholder L1. Confirm eye hits title before tab bar.

### 11.4 Full-Width Line Conflict Watch

**CP Principle 1 (Group, Don't Isolate):** Single border + dividers for grouped items.

**v1 → v2 shift:** Inset Hairline replaced with Full-Width Line. Full-width separators are more visually aggressive.

**Reconciliation:** Full-Width Line is still inside a single group container — it's a divider between rows, not a border around each row. The group still exists. What changed is the divider extends edge-to-edge rather than being inset.

**Review checkpoint:** For any list using Full-Width Line, confirm the list as a whole has a unifying container or section header. If each row stands alone with a full-width line below it, you've reinvented the per-row border pattern. Convert to Card Per Row OR group under a section header.

---

## §12. v2 DECISION BACKLOG

All 8 v1 open items now decided. New open items from §9 coverage gaps:

### 12.1 Priority 1 — Blocks Form-Heavy Screens

- Form field pattern (§9.6)
- Keyboard behavior (§9.7)

### 12.2 Priority 2 — Blocks Visual System Completion

- Spacing scale commit (§9.2)
- Corner radius scale commit (§9.3)
- Elevation/shadow tokens (§9.4)
- Iconography rules (§9.5)

### 12.3 Priority 3 — Context-Specific

- Alert vs custom dialog (§9.9)
- Context menu patterns (§9.10)
- Notification permission priming (§9.11)
- Offline/error recovery (§9.12)
- Status bar style per screen (§9.8)

### 12.4 Recommended Next A/B Session

Run a focused A/B specifically on **form fields** — text input style, label position, error presentation, keyboard toolbar. This is the biggest remaining coverage gap and touches onboarding, profile, settings, and any data entry screen.

---

## §13. KEY QUESTIONS TO VALIDATE NEXT

Beyond the coverage gaps in §9, three questions the preferences docs don't yet answer:

### 13.1 Does Calm Precision Scale to Consumer?

Your preferences skew between two poles: restrained utility (CTA-Only, Text-Only empty states, Pulse Fade) AND brand-expressive (Ripple, Mesh Gradients, Custom Illustrations, Lottie). These coexist via context rules, but are you building:

(a) A single app with context-gated expressiveness?
(b) A portfolio where some apps are utility-tier and some are consumer-tier?
(c) An evolving mobile language where early apps are restrained and later ones are expressive?

The answer determines whether you need a single unified spec or a tiered spec (utility preset vs consumer preset vs signature preset).

### 13.2 What's the Motion Budget Per Screen?

You've selected many motion options: Hero Expansion, Slide Push, Slide Up, Cross-Fade, Progress Arc refresh, Logo refresh, Checkmark Ripple, Score Tick, Spring Bounce tabs, Lottie tabs, Morphing onboarding, Parallax scroll, Animated status rings, Splash Morph... If all are present on one screen, motion becomes noise.

**Recommended constraint:** Define a "motion density ceiling" — max N motion moments per screen before a review is required. My suggestion: 3 animated elements in active state per screen. Entry/exit transitions don't count.

### 13.3 Accessibility Audit Plan

Your preferences include non-native patterns (ripple, floating tab bar, glass buttons, mesh gradients, Lottie animations). Each has accessibility implications:

- Contained ripple: must not interfere with VoiceOver focus
- Floating pill tab bar with blur: backdrop contrast ratio with content?
- Glass buttons: contrast ratio meets WCAG AA in both light and dark?
- Mesh gradients: reduce-motion fallback exists?
- Lottie animations: `accessibilityReduceMotion` halts them?

**Recommendation:** Before committing these choices to a build, run an accessibility pass — VoiceOver, Reduce Motion, Increase Contrast, Larger Text. Non-native patterns often ship with accessibility gaps that surface only in audit.

---

*Calm Precision — iOS Mobile Preferences v2 Addendum*
*Supersedes: iOS Mobile Preferences v1.0 for overlapping items*
*Derived from: A/B Self-Test v2 (4/15/2026 updated)*
*Status: 25 v1 decisions + 8 newly resolved + 12 coverage gaps flagged + 20 new auto-apply rules*


---

## ⚠️ DEPRECATED (as of v3 catalog restructure)

See notice in Calm_Precision_iOS_Preferences.md. This v2 addendum is superseded by the catalog files.

