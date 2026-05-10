# Calm Precision — iOS / macOS / watchOS v1.1 Patch

Additions and refinements to Calm Precision Native v1.0. Brings the native spec in line with
Calm Precision 6.4.1 web guidance (Voice Calibration, Error/Empty state routing, Page Hierarchy).

**Status:** Additive patch. v1.0 sections remain valid. Apply these changes alongside v1.0.

---

## WHAT CHANGED FROM v1.0

| Area | v1.0 | v1.1 |
|------|------|------|
| Core principles | 13 principles, native mapping only | 13 principles + Voice/Error/Page extensions |
| Content strategy | Covered lightly in §13 (Error & Empty) | Dedicated §§A, B, C with native patterns |
| Page layout | Not systematized | New §C — page-level hierarchy (L1/L2/L3/L4) |
| Voice patterns | Mentioned in Principle 13 only | New §A — full native voice ladder |
| Error routing | Single pattern in §13 | New §B — routing by error type |
| Auto-apply rules | 20 rules | 25 rules (5 new for content strategy) |
| Self-audit | 30 questions | 36 questions (6 new) |
| Charts | Referenced as Shared/Views/Charts | See separate `Calm_Precision_iOS_Charts.md` |

---

## §A. VOICE CALIBRATION (NATIVE)

Extends Principle 13. Native UI copy follows the same voice ladder as web, translated to SwiftUI idioms.

### A.1 Voice Quick Reference

| Element | Pattern | Max | Native Example |
|---------|---------|-----|----------------|
| Button label | Verb + Object | ≤3 words | `Button("Start Focus")` |
| Destructive button | Verb + Object + consequence | ≤5 words | `Button("Delete 3 Sessions", role: .destructive)` |
| Placeholder | Instruction + context | ≤4 words | `TextField("Search sessions", text: $query)` |
| Toolbar icon label | Noun or verb | 1 word | `.accessibilityLabel("Share")` |
| Loading message | Action + count | ≤5 words | `ProgressView("Syncing 47 sessions…")` |
| Success message | What happened + delta | ≤8 words | "Session saved to iCloud" |
| Error (inline) | Wrong + fix | ≤12 words | "File too large. Max 25MB." |
| Tooltip/hint | "What does this do?" | ≤8 words | "Toggle focus mode" |

### A.2 Tone Ladder

| Tone | When | Native Example |
|------|------|----------------|
| Neutral | Default, forms, data display | "No sessions this week." |
| Encouraging | First-time, onboarding, empty states | "Your focus journey starts here." |
| Urgent | Errors, destructive actions, time limits | "Delete 3 sessions? This can't be undone." |
| Celebratory | Completion, milestones | "25 minutes focused. Nice work." |

### A.3 Native Copy Patterns

**Button Labels:**
```swift
// ✓ DO
Button("Start Focus", action: start)
Button("Save", action: save)
Button("Delete", role: .destructive, action: delete)

// ✗ DON'T
Button("Click here to begin your focus session", action: start)
Button("OK", action: save)  // What does OK do?
Button("Yes", role: .destructive, action: delete)  // Yes to what?
```

**Placeholders:**
```swift
// ✓ DO — instruction
TextField("Search sessions", text: $query)
TextField("Enter email", text: $email)

// ✗ DON'T — description
TextField("Your search query goes here", text: $query)
TextField("Type your email address...", text: $email)
```

**Loading Messages:**
```swift
// ✓ DO — specific action + count
ProgressView("Syncing 47 sessions…")
ProgressView("Analyzing this week's data")

// ✗ DON'T — generic
ProgressView("Loading...")
ProgressView()  // silent, user doesn't know what's happening
```

**Success Confirmations:**
```swift
// ✓ DO — state what changed
Text("Session saved to iCloud")
Text("Exported 12 sessions as CSV")

// ✗ DON'T — vague
Text("Success!")
Text("Done")
```

**VoiceOver Labels:**
Icon-only buttons get descriptive labels, not generic:
```swift
// ✓ DO
Button(action: share) { Image(systemName: "square.and.arrow.up") }
    .accessibilityLabel("Share session summary")

// ✗ DON'T
Button(action: share) { Image(systemName: "square.and.arrow.up") }
    .accessibilityLabel("Share")  // Share what?
```

### A.4 Native Voice Checklist

- [ ] Every `Button` label is Verb + Object, ≤3 words
- [ ] Destructive buttons specify what's being destroyed
- [ ] `ProgressView` has a label that names the action
- [ ] All `accessibilityLabel` values describe the specific action, not the icon
- [ ] No "OK", "Yes", "No", "Submit" buttons — use specific verbs
- [ ] Loading messages include count or target when data is being processed
- [ ] Success confirmations state what changed, not just "Done"

---

## §B. ERROR & EMPTY STATE ROUTING (NATIVE)

Extends Principle 10 (Content Resilience). v1.0 introduced a basic error pattern; v1.1 adds routing by error type and context-matched empty states.

### B.1 Error Type Routing

| Error Type | Pattern | Native Implementation |
|------------|---------|----------------------|
| User error (typo, wrong format) | Inline fix near input. Neutral tone. | `.foregroundStyle(.red)` text below field |
| System error (timeout, server) | "Not your fault" + retry. | Full `ContentUnavailableView` with retry button |
| Permission error (auth, capability) | Upgrade/login CTA. Neutral. | Sheet with explanation + action |
| Data error (empty API, malformed) | Graceful fallback + retry. | Fallback UI + subtle error indicator |

### B.2 Error Routing Decision Tree

```
Something went wrong?
├── User input wrong? (bad email, file too large)
│   → Inline correction. Red text. Fix instruction.
├── Network/server failure?
│   → "Not your fault" language. Retry button. No technical details.
├── Permission denied?
│   → Explain what's needed. Link to settings or upgrade.
└── Data missing or malformed?
    → Show what's available. Indicate limitation. Offer refresh.
```

### B.3 Native Error Components

**User Error (Inline):**
```swift
struct ValidatedField: View {
    @Binding var text: String
    let label: String
    let error: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            TextField(label, text: $text)
                .textFieldStyle(.roundedBorder)
            if let error {
                Text(error)
                    .font(.caption)
                    .foregroundStyle(.red)
            }
        }
    }
}

// Usage — specific, actionable
ValidatedField(
    text: $email,
    label: "Email",
    error: isInvalid ? "Email needs an @ symbol" : nil
)
```

**System Error (Full View):**
```swift
struct SystemErrorView: View {
    let what: String   // "Couldn't load your sessions"
    let why: String?   // "Your connection dropped"
    let retry: () -> Void

    var body: some View {
        ContentUnavailableView {
            Label(what, systemImage: "wifi.slash")
        } description: {
            if let why {
                Text(why)
            }
        } actions: {
            Button("Try Again", action: retry)
                .buttonStyle(.borderedProminent)
        }
    }
}
```

**Permission Error:**
```swift
struct PermissionPromptView: View {
    let capability: String   // "Health Data"
    let reason: String       // "to track your focus heart rate"
    let action: () -> Void

    var body: some View {
        ContentUnavailableView {
            Label("\(capability) Access Needed", systemImage: "lock.circle")
        } description: {
            Text("FlowDoro needs \(capability) \(reason).")
        } actions: {
            Button("Grant Access", action: action)
                .buttonStyle(.borderedProminent)
        }
    }
}
```

**Data Error (Graceful Fallback):**
```swift
struct SessionRowWithFallback: View {
    let session: Session?
    let error: String?

    var body: some View {
        HStack {
            if let session {
                VStack(alignment: .leading) {
                    Text(session.mode).font(.headline)
                    Text("\(session.focusMinutes)m").font(.subheadline)
                }
            } else {
                Text("—").foregroundStyle(.tertiary)
            }
            Spacer()
            if error != nil {
                Image(systemName: "exclamationmark.triangle.fill")
                    .foregroundStyle(.orange)
                    .font(.caption)
            }
        }
    }
}
```

### B.4 Empty State Context Matching

| Context | Tone | Example Copy | CTA |
|---------|------|--------------|-----|
| First time | Encouraging | "Your focus journey starts here." | "Start First Session" |
| Search | Neutral | "No sessions match 'morining'. Check spelling?" | "Clear Search" |
| Filter | Neutral | "No sessions from this week match these filters." | "Clear Filters" (shows total count) |
| All done | Celebratory | "All caught up. Take a break." | "Start Next Session" |
| Permission not granted | Neutral | "Health data hidden. Grant access to see trends." | "Enable in Settings" |

### B.5 Native Empty State Patterns

```swift
// First-time empty state
ContentUnavailableView {
    Label("No Sessions Yet", systemImage: "timer")
} description: {
    Text("Complete your first focus session to start building your history.")
} actions: {
    Button("Start Focus", action: startSession)
        .buttonStyle(.borderedProminent)
}

// Filtered-empty state
ContentUnavailableView {
    Label("No Matches", systemImage: "line.3.horizontal.decrease.circle")
} description: {
    Text("No sessions match these filters. \(totalCount) sessions exist in total.")
} actions: {
    Button("Clear Filters", action: clearFilters)
}

// Search empty state with suggestion
ContentUnavailableView.search(text: query)
// Or custom:
ContentUnavailableView {
    Label("No Results", systemImage: "magnifyingglass")
} description: {
    Text("No sessions match '\(query)'. Try a shorter keyword or check spelling.")
}

// All-done celebration
ContentUnavailableView {
    Label("All Caught Up", systemImage: "checkmark.circle.fill")
        .foregroundStyle(.green)
} description: {
    Text("You've reviewed everything for today. Take a well-earned break.")
} actions: {
    Button("Plan Tomorrow", action: plan)
        .buttonStyle(.bordered)
}
```

### B.6 Error/Empty Checklist

- [ ] Every error states what happened, why (if known), and what to do
- [ ] No "Something went wrong" or "Error" as headline — be specific
- [ ] System errors use "not your fault" language where appropriate
- [ ] Permission errors explain the capability AND the reason
- [ ] User errors appear inline, near the offending input
- [ ] Empty states match context (first-time, search, filter, complete)
- [ ] First-time empty states have encouraging tone + setup CTA
- [ ] Filtered empty states offer to clear filters + show total count
- [ ] Retry buttons use `Button("Try Again", ...)`, not "Retry" alone

---

## §C. PAGE-LEVEL VISUAL HIERARCHY (NATIVE)

Extends Principle 3 (Three-Line Hierarchy) with page-level structure. v1.0 covered component-level hierarchy but not how multiple components relate on a single screen.

### C.1 The Four Attention Levels

| Level | Role | Native Characteristics | Examples |
|-------|------|----------------------|----------|
| L1 Anchor | One per screen. First thing the eye hits. | `.font(.largeTitle.bold())`, top of content | Screen title, hero metric, primary headline |
| L2 Orient | Navigation and controls. Where the user is. | `.toolbar`, `.navigationTitle`, segmented controls | Tab bar, toolbar items, section pickers |
| L3 Primary Content | Reason the user came. ≥60% of viewport. | List/Scroll/LazyVStack filling `.frame(maxHeight: .infinity)` | Feed, timer, session rows, form fields |
| L4 Supporting | Aids L3. Hideable on mobile. | `.font(.caption).foregroundStyle(.secondary)`, sidebar or bottom | Metadata, related links, help text |

### C.2 Platform-Specific Hierarchy

**iOS:**
```swift
NavigationStack {
    ScrollView {
        // L1 Anchor — one per screen
        VStack(alignment: .leading, spacing: 4) {
            Text("This Week")
                .font(.largeTitle.bold())
            Text("March 10 – March 16")
                .font(.subheadline)
                .foregroundStyle(.secondary)
        }
        .padding(.horizontal)
        .frame(maxWidth: .infinity, alignment: .leading)

        // L3 Primary Content (≥60% viewport)
        LazyVStack(spacing: 12) {
            ForEach(sessions) { session in
                SessionRow(session: session)
            }
        }
        .padding(.horizontal)
    }
    .navigationTitle("")  // Hide default — we have our own L1
    .toolbar {
        // L2 Orient
        ToolbarItem(placement: .topBarTrailing) {
            Button(action: settings) { Image(systemName: "gearshape") }
        }
    }
}
```

**iPad/macOS (L4 visible):**
```swift
NavigationSplitView {
    // L2 sidebar
    SidebarView()
} detail: {
    HStack(spacing: 0) {
        // L1 + L3 primary column
        VStack(alignment: .leading) {
            Text("This Week").font(.largeTitle.bold())
            SessionList()
        }
        .frame(maxWidth: .infinity)

        // L4 supporting column (iPad/Mac only)
        DetailInspector()
            .frame(width: 280)
            .background(Color(.secondarySystemBackground))
    }
}
```

**watchOS (L4 collapsed):**
```swift
NavigationStack {
    VStack(spacing: 12) {
        // L1 Anchor — smaller on watch but still anchor
        Text("This Week")
            .font(.headline.weight(.semibold))

        // L3 Primary only — no L4 on watch
        List(sessions) { session in
            WatchSessionRow(session: session)
        }
    }
}
```

### C.3 Hierarchy Validation Rules

1. **Exactly one L1 per screen.** Multiple L1s = no anchor = scanning chaos.
2. **L2 must be visually subordinate to L1.** If nav dominates page title, hierarchy is broken.
3. **L3 gets ≥60% of viewport on iPhone.** If chrome (L2 + L4) exceeds 40%, content is suffocated.
4. **L4 must hide gracefully on mobile.** If it can't hide without breaking the page, it's actually L3 — promote it.

### C.4 Hierarchy Decision Tree

```
Laying out a full screen?
├── Identify L1 Anchor
│   ├── Exactly one? → Good
│   └── Multiple competing? → Demote all but one
├── Check L2 (nav/controls)
│   ├── Visually smaller than L1? → Good
│   └── Dominates page title? → Reduce nav weight (smaller icons, less color)
├── Check L3 (primary content)
│   ├── ≥60% mobile viewport? → Good
│   └── Chrome > 40%? → Reduce chrome (collapse toolbar items, simplify nav)
└── Check L4 (supporting)
    ├── Hides on compact width without breaking? → Good, it's L4
    └── Can't hide? → It's actually L3, promote
```

### C.5 Common Hierarchy Violations

| Violation | Fix |
|-----------|-----|
| Navigation title + custom H1 both large | Hide `.navigationTitle("")`, keep only custom L1 |
| Tab bar with 5+ tabs competing with page title | Use `.tabViewStyle(.page)` or convert some tabs to drill-down |
| Sidebar inspector on iPhone | Hide on compact, show in sheet instead |
| Three metric cards all same size at top | Elevate one as hero (L1), others become L3 |
| Toolbar buttons same color as nav title | Tone down toolbar tint |

---

## §D. UPDATED AUTO-APPLY RULES (v1.1)

Original v1.0 rules 1–20 remain. **New rules 21–30:**

| # | Rule |
|---|------|
| 21 | Every button label follows Verb + Object, ≤3 words |
| 22 | Destructive buttons specify what's being destroyed (e.g., "Delete 3 Sessions") |
| 23 | `ProgressView` always has a descriptive label — never silent |
| 24 | `accessibilityLabel` on icon-only buttons describes the action, not the icon |
| 25 | Every error follows what → why → fix pattern |
| 26 | Errors route by type: user (inline), system (full + retry), permission (CTA), data (fallback) |
| 27 | Empty states match context: first-time / search / filter / complete |
| 28 | Exactly one L1 anchor per screen |
| 29 | L3 primary content gets ≥60% viewport on iPhone |
| 30 | L4 supporting content hides gracefully on compact width |

---

## §E. UPDATED SELF-AUDIT (v1.1)

Original v1.0 self-audit questions 1–30 remain. **New questions 31–36:**

### Content Strategy
31. Are button labels Verb + Object, ≤3 words?
32. Do loading messages specify what's happening?
33. Are error messages three-part (what → why → fix)?
34. Are empty states context-matched with appropriate tone and CTA?

### Page Hierarchy
35. Is there exactly one L1 anchor per screen?
36. Does L3 primary content get ≥60% of mobile viewport?

---

## §F. MIGRATION CHECKLIST (v1.0 → v1.1)

If you have an existing app built to v1.0, audit for these:

- [ ] Scan all `Button` labels — any >3 words? Any "OK"/"Submit"/"Save"? Rewrite as Verb + Object.
- [ ] Scan all `ProgressView` — any silent? Add descriptive labels.
- [ ] Scan all error messages — any "Something went wrong"? Rewrite with what → why → fix.
- [ ] Scan empty states — are they context-matched? First-time vs filter vs complete?
- [ ] Audit every screen — exactly one L1? L3 ≥60% viewport?
- [ ] Check icon-only buttons — do `accessibilityLabel` values describe the action?
- [ ] Check destructive buttons — do they name what's being destroyed?

---

*Calm Precision — Native v1.1 Patch*
*Applies to: Calm Precision Native v1.0*
*Source: Calm Precision 6.4.1 (web) content strategy sections*
