# Calm Precision — iOS / macOS Native Charts

Data visualization companion to Calm Precision Native v1.1. Translates the Atomize charts architecture
(query intent → routing → composition) to SwiftUI + Swift Charts. Use when building any native view
that renders quantitative data.

**Stack:** SwiftUI · Swift Charts (iOS 16+, macOS 13+) · Combine · Observable macro (iOS 17+)
**Design DNA:** Same as web — a chart earns its place or it doesn't render.
**Scope:** The WHY (when charts add value), WHAT (chart type selection), WHERE (placement), WHEN (triggers), HOW (Swift Charts implementation).

---

## 0. DOCUMENT MAP

| Section | Covers | Role |
|---------|--------|------|
| §1 | Philosophy & Confidence Gate | WHY charts exist natively |
| §2 | Query Intent Classification | WHEN to trigger a chart |
| §3 | Chart Routing Engine | WHAT type to render |
| §4 | Data Aggregation Pipeline | WHERE data comes from |
| §5 | Response Composition | WHERE charts sit in native views |
| §6 | Swift Charts vs Alternatives | HOW the rendering layer works |
| §7 | Theme & Color System | HOW charts look natively |
| §8 | Chart Type Catalog (12 types) | HOW each chart is built |
| §9 | Shared Components & Patterns | HOW containers, tooltips, controls work |
| §10 | Platform Variants (iOS/macOS/watchOS) | HOW charts adapt across devices |
| §11 | Performance & Quality | HOW to keep it fast and correct |
| §12 | File Structure | HOW the codebase is organized |
| §13 | Testing Checklist | HOW to validate before shipping |

---

## 1. PHILOSOPHY: WHEN CHARTS EARN THEIR PLACE

### 1.1 The Core Principle

A chart appears in a native view only when it communicates something text alone cannot. Charts are analytical instruments, not decoration. Every chart must pass:

> "Does this visualization reveal a pattern, comparison, distribution, or trend that would take 3+ sentences to describe and still be less clear?"

If no, use text. On mobile especially, a bad chart costs more than no chart — it consumes scarce vertical space.

### 1.2 Charts Add Value When...

| Signal | Example Query | Why Visual Wins |
|--------|--------------|-----------------|
| **Temporal pattern** | "How has my focus time changed?" | Trend shape visible instantly in line chart |
| **Ranking or comparison** | "Which apps did I use most?" | Relative magnitudes grasped at a glance |
| **Proportional breakdown** | "What's my time split this week?" | Part-to-whole immediate in donut |
| **Correlation** | "Does sleep affect my focus score?" | Scatter reveals clusters text flattens |
| **Change attribution** | "Why did my step count drop?" | Waterfall shows contributors in one view |
| **Multi-dimensional scoring** | "How balanced is my week?" | Radar exposes gaps simultaneously |

### 1.3 Charts Do NOT Add Value When...

| Signal | Example | Why Text Wins |
|--------|---------|---------------|
| **Single data point** | "Steps today" | One number. Say it. |
| **Qualitative summary** | "How did I sleep?" | Themes need narrative |
| **Simple lookup** | "Longest session this week" | A name and a number |
| **Insufficient data** | <3 comparable points | Charts with 1–2 bars look broken |
| **Low confidence** | Sparse sensor coverage | A misleading chart is worse than no chart |

### 1.4 The Confidence Gate

Before rendering any chart, evaluate data sufficiency:

1. **≥3 comparable data points** (bars, line points, slices)
2. **Confidence classification of "medium" or "high"** from the data layer
3. **Source attribution** — every chart traceable to underlying data

If any fails, fall back to text. Never force a chart to fill space.

```swift
enum ChartConfidence {
    case high, medium, low
}

struct ChartGate {
    static func shouldRender<T>(_ data: [T], confidence: ChartConfidence) -> Bool {
        data.count >= 3 && confidence != .low
    }
}
```

### 1.5 CP Principle Mapping

| CP Principle | Native Chart Application |
|--------------|--------------------------|
| 1. Group, Don't Isolate | Multiple related charts share a Section, not individual Cards |
| 3. Three-Line Hierarchy | Chart title → description → attribution beneath every chart |
| 5. Text Over Decoration | No gridline decoration beyond what aids reading. No drop shadows. |
| 6. Content Over Chrome | Chart ≥70% of its container. Legends/axes minimal. |
| 9. Functional Integrity | No charts with mock data. No interactive marks that do nothing. |
| 10. Content Resilience | Every chart has empty/error/loading states |
| 12. Purposeful Motion | Entry animation only — no decorative pulsing |
| 13. Voice Calibration | Axis labels ≤3 words. Tooltips ≤8 words. |

---

## 2. QUERY INTENT CLASSIFICATION

The trigger layer decides whether a native view renders a chart. Most native apps trigger charts from structured user actions (tapping a stats tab, selecting a date range) rather than free-text queries, but the intent taxonomy applies either way.

### 2.1 Intent Taxonomy

| Intent | Signals | Chart Candidate? | Primary Types |
|--------|---------|------------------|---------------|
| **Trend** | "over time", date ranges, "trend" | YES | Line, Area, Sparkline |
| **Comparison** | "compare", "vs", "before/after" | YES | Grouped Bar, Horizontal Bar |
| **Ranking** | "top", "most", "leading" | YES | Horizontal Bar |
| **Distribution** | "breakdown", "share", "proportion" | YES | Donut, Treemap |
| **Correlation** | "relationship between", "affect" | YES | Scatter |
| **Attribution** | "why did", "what drove" | YES | Waterfall |
| **Pattern/Density** | "when do", "peak times" | YES | Heatmap |
| **Balance** | "how balanced", "coverage across" | YES | Radar |
| **Narrative** | "what happened", "summarize" | NO | Text only |
| **Lookup** | "who", "what is", single value | NO | Text only |

### 2.2 Native Intent Classifier

In native apps, intent is usually resolved by navigation context (the user tapped "Trends"), not NLP. But for apps with search or AI features, a local classifier works:

```swift
// Shared/Charts/ChartIntent.swift

enum ChartIntent: String {
    case trend, comparison, ranking, distribution
    case correlation, attribution, pattern, balance, none
}

struct IntentResult {
    let intent: ChartIntent
    let confidence: ChartConfidence
    let suggestedTypes: [ChartType]
    let requiresTimeAxis: Bool
}

struct ChartIntentClassifier {
    private static let patterns: [(ChartIntent, [NSRegularExpression], [ChartType])] = {
        let compile: (String) -> NSRegularExpression = { pattern in
            try! NSRegularExpression(pattern: pattern, options: .caseInsensitive)
        }
        return [
            (.trend, [
                compile(#"\b(over time|trend|trajectory|changed?|growth)\b"#),
                compile(#"\b(daily|weekly|monthly|this (week|month|year))\b"#)
            ], [.line, .stackedArea, .sparkline]),
            (.comparison, [
                compile(#"\b(compare|vs\.?|versus|difference between)\b"#)
            ], [.groupedBar, .horizontalBar]),
            (.ranking, [
                compile(#"\b(top \d+|most|least|biggest|leading|ranked)\b"#)
            ], [.horizontalBar]),
            (.distribution, [
                compile(#"\b(breakdown|share|proportion|mix|split)\b"#)
            ], [.donut, .treemap]),
            (.correlation, [
                compile(#"\b(relationship between|correlat|affect)\b"#)
            ], [.scatter]),
            (.attribution, [
                compile(#"\b(why did|what (drove|caused)|contributors?)\b"#)
            ], [.waterfall]),
            (.pattern, [
                compile(#"\b(when do|frequency|peak (times?|hours?))\b"#)
            ], [.heatmap]),
            (.balance, [
                compile(#"\b(how balanced|coverage across|gaps?)\b"#)
            ], [.radar])
        ]
    }()

    static func classify(_ query: String) -> IntentResult {
        let range = NSRange(query.startIndex..., in: query)
        for (intent, regexes, types) in patterns {
            let matches = regexes.filter { $0.firstMatch(in: query, range: range) != nil }.count
            if matches >= 2 {
                return IntentResult(
                    intent: intent,
                    confidence: .high,
                    suggestedTypes: types,
                    requiresTimeAxis: intent == .trend
                )
            } else if matches == 1 {
                return IntentResult(
                    intent: intent,
                    confidence: .medium,
                    suggestedTypes: types,
                    requiresTimeAxis: intent == .trend
                )
            }
        }
        return IntentResult(intent: .none, confidence: .low, suggestedTypes: [], requiresTimeAxis: false)
    }
}
```

### 2.3 Navigation-Driven Intent (Most Common Native Case)

Most native apps map intent to navigation, not queries:

```swift
enum StatsTab: String, CaseIterable {
    case overview   // multi-chart: trend + distribution + ranking
    case trends     // trend intent
    case breakdown  // distribution intent
    case sources    // ranking intent

    var primaryIntent: ChartIntent {
        switch self {
        case .overview: return .trend  // primary, plus secondary
        case .trends: return .trend
        case .breakdown: return .distribution
        case .sources: return .ranking
        }
    }
}
```

---

## 3. CHART ROUTING ENGINE

Two-stage selection: intent suggests candidates (§2), data shape resolves final type.

### 3.1 Chart Type Enum

```swift
// Shared/Charts/ChartType.swift

enum ChartType: String, CaseIterable {
    case line
    case bar              // vertical
    case horizontalBar
    case groupedBar
    case stackedArea
    case donut
    case sparkline
    case radar            // iOS 17+ — via custom path or third-party
    case treemap          // iOS 17+ — via custom or chart library
    case heatmap          // custom grid
    case scatter
    case waterfall        // custom bar configuration
    case none
}
```

### 3.2 Data Profile & Resolver

```swift
// Shared/Charts/ChartResolver.swift

struct DataProfile {
    let rowCount: Int
    let numericKeys: [String]
    let categoricalKeys: [String]
    let hasTimeAxis: Bool
    let seriesCount: Int
    let maxValue: Double
    let hasHierarchy: Bool
    let isSequential: Bool
    let hasNegativeValues: Bool
    let hasTwoDimensions: Bool
}

struct ChartResolver {
    static func resolve(profile: DataProfile, suggestions: [ChartType] = []) -> ChartType {
        // Gate: insufficient data
        guard profile.rowCount >= 3, !profile.numericKeys.isEmpty else { return .none }

        // Priority 1: specialized structures
        if profile.hasHierarchy && profile.rowCount > 6 { return .treemap }
        if profile.hasTwoDimensions { return .heatmap }

        // Priority 2: honor intent if data supports it
        for suggested in suggestions where isCompatible(suggested, with: profile) {
            return suggested
        }

        // Priority 3: data-shape fallback
        if profile.hasNegativeValues && !profile.hasTimeAxis { return .waterfall }

        if profile.hasTimeAxis {
            if profile.seriesCount > 3 { return .stackedArea }
            if profile.seriesCount > 1 { return .line }
            if profile.rowCount > 20 { return .line }
            return .bar
        }

        if profile.numericKeys.count >= 2 && profile.rowCount > 5 { return .scatter }
        if profile.seriesCount == 2 { return .groupedBar }
        if profile.rowCount > 8 { return .horizontalBar }
        if profile.rowCount <= 6 && profile.numericKeys.count == 1 { return .donut }

        return .bar
    }

    private static func isCompatible(_ type: ChartType, with profile: DataProfile) -> Bool {
        switch type {
        case .line, .stackedArea, .sparkline:
            return profile.hasTimeAxis && profile.rowCount >= 3
        case .groupedBar:
            return profile.seriesCount >= 2
        case .horizontalBar, .bar:
            return profile.rowCount >= 3
        case .donut:
            return profile.rowCount >= 2 && profile.rowCount <= 8
        case .treemap:
            return profile.hasHierarchy || profile.rowCount > 6
        case .heatmap:
            return profile.hasTwoDimensions
        case .scatter:
            return profile.numericKeys.count >= 2 && profile.rowCount >= 5
        case .waterfall:
            return profile.hasNegativeValues || profile.rowCount <= 15
        case .radar:
            return profile.rowCount >= 3 && profile.rowCount <= 10
        case .none:
            return false
        }
    }
}
```

### 3.3 Chart Type Quick Reference

| Chart | Best For | Min Points | Max Practical | Time Axis | Native Renderer |
|-------|---------|-----------|---------------|-----------|-----------------|
| Line | Trends | 3 | 500 | Required | Swift Charts `LineMark` |
| Stacked Area | Composition over time | 3/series | 200/series | Required | `AreaMark` + `.foregroundStyle(by:)` |
| Bar (vertical) | Category values | 3 | 50 | Optional | `BarMark` |
| Horizontal Bar | Rankings, long labels | 3 | 30 | No | `BarMark` with swapped axes |
| Grouped Bar | Period comparison | 3 | 20 | Optional | `BarMark` + `.position(by:)` |
| Donut | Proportions | 2 | 8 | No | `SectorMark` (iOS 17+) |
| Sparkline | Inline trend | 5 | 60 | Implied | `LineMark` (minimal chrome) |
| Heatmap | Two-dim density | 9 | 500 cells | Optional | `RectangleMark` |
| Scatter | Correlation | 5 | 300 | No | `PointMark` |
| Waterfall | Attribution | 3 | 15 | No | `BarMark` (start/end pairs) |
| Radar | Multi-dim balance | 3 | 10 | No | Custom path (not in Swift Charts) |
| Treemap | Hierarchy | 6 | 100 | No | Custom layout (not in Swift Charts) |

---

## 4. DATA AGGREGATION PIPELINE

Native apps typically aggregate locally (SQLite, SwiftData) rather than via API endpoints. The aggregation layer sits between the data store and the chart view.

### 4.1 Aggregator Protocol

```swift
// Shared/Charts/ChartAggregator.swift

protocol ChartAggregator {
    associatedtype Output: Identifiable
    func fetch() async throws -> ChartDataResponse<Output>
}

struct ChartDataResponse<T> {
    let chartable: Bool
    let confidence: ChartConfidence
    let reason: String?
    let data: [T]
    let attribution: String
}
```

### 4.2 Example: Session Trend Aggregator (SwiftData)

```swift
// Shared/Charts/Aggregators/TrendAggregator.swift

import SwiftData

@MainActor
struct TrendAggregator: ChartAggregator {
    let context: ModelContext
    let days: Int

    struct TrendPoint: Identifiable {
        let id = UUID()
        let date: Date
        let sessionCount: Int
        let totalMinutes: Int
    }

    func fetch() async throws -> ChartDataResponse<TrendPoint> {
        let cutoff = Calendar.current.date(byAdding: .day, value: -days, to: Date())!
        let descriptor = FetchDescriptor<Session>(
            predicate: #Predicate { $0.startDate >= cutoff },
            sortBy: [SortDescriptor(\.startDate)]
        )

        let sessions = try context.fetch(descriptor)
        let grouped = Dictionary(grouping: sessions) {
            Calendar.current.startOfDay(for: $0.startDate)
        }

        let points = grouped.map { date, sessions in
            TrendPoint(
                date: date,
                sessionCount: sessions.count,
                totalMinutes: sessions.reduce(0) { $0 + $1.focusMinutes }
            )
        }.sorted { $0.date < $1.date }

        guard points.count >= 3 else {
            return ChartDataResponse(
                chartable: false,
                confidence: .low,
                reason: "Only \(points.count) days of data (minimum 3 required)",
                data: [],
                attribution: ""
            )
        }

        return ChartDataResponse(
            chartable: true,
            confidence: points.count >= 7 ? .high : .medium,
            reason: nil,
            data: points,
            attribution: "Based on \(sessions.count) sessions from the last \(days) days"
        )
    }
}
```

### 4.3 HealthKit Aggregator (Cross-Device)

```swift
// Shared/Charts/Aggregators/HealthTrendAggregator.swift

#if canImport(HealthKit)
import HealthKit

@MainActor
struct HealthTrendAggregator: ChartAggregator {
    let healthStore: HKHealthStore
    let quantityType: HKQuantityType
    let days: Int

    struct HealthPoint: Identifiable {
        let id = UUID()
        let date: Date
        let value: Double
    }

    func fetch() async throws -> ChartDataResponse<HealthPoint> {
        let cutoff = Calendar.current.date(byAdding: .day, value: -days, to: Date())!
        let predicate = HKQuery.predicateForSamples(withStart: cutoff, end: Date())

        let interval = DateComponents(day: 1)
        let query = HKStatisticsCollectionQuery(
            quantityType: quantityType,
            quantitySamplePredicate: predicate,
            options: .cumulativeSum,
            anchorDate: Calendar.current.startOfDay(for: cutoff),
            intervalComponents: interval
        )

        return try await withCheckedThrowingContinuation { continuation in
            query.initialResultsHandler = { _, results, error in
                if let error = error {
                    continuation.resume(throwing: error)
                    return
                }

                var points: [HealthPoint] = []
                results?.enumerateStatistics(from: cutoff, to: Date()) { stat, _ in
                    if let sum = stat.sumQuantity()?.doubleValue(for: .count()) {
                        points.append(HealthPoint(date: stat.startDate, value: sum))
                    }
                }

                let response = ChartDataResponse(
                    chartable: points.count >= 3,
                    confidence: points.count >= 7 ? .high : .medium,
                    reason: points.count < 3 ? "Insufficient health data" : nil,
                    data: points,
                    attribution: "HealthKit data from the last \(days) days"
                )
                continuation.resume(returning: response)
            }
            healthStore.execute(query)
        }
    }
}
#endif
```

### 4.4 Observable Chart ViewModel

```swift
// Shared/Charts/ChartViewModel.swift

import Observation

@Observable
@MainActor
final class ChartViewModel<A: ChartAggregator> {
    private(set) var state: ChartState<A.Output> = .idle

    enum ChartState<T> {
        case idle
        case loading
        case loaded(ChartDataResponse<T>)
        case failed(Error)
    }

    func load(using aggregator: A) async {
        state = .loading
        do {
            let response = try await aggregator.fetch()
            state = .loaded(response)
        } catch {
            state = .failed(error)
        }
    }
}
```

---

## 5. RESPONSE COMPOSITION: CHART + TEXT

### 5.1 Native Response Structure

Unlike web (where charts are part of a search response), native charts live inside stats views, detail views, or widgets. The composition pattern still holds:

```
┌──────────────────────────────────────┐
│ HEADLINE INSIGHT (1 sentence)        │  ← .font(.headline)
│ "Your focus time doubled this week." │
├──────────────────────────────────────┤
│                                      │
│          [CHART]                     │  ← min 200pt height
│                                      │
├──────────────────────────────────────┤
│ SUPPORTING CONTEXT (2-3 lines)       │  ← .font(.subheadline)
│ Nuance the chart doesn't convey.     │
├──────────────────────────────────────┤
│ ATTRIBUTION                          │  ← .font(.caption)
│ "47 sessions, Mar 1–Mar 15"          │
└──────────────────────────────────────┘
```

### 5.2 ChartCard Component

```swift
// Shared/Charts/ChartCard.swift

struct ChartCard<Content: View>: View {
    let headline: String?
    let title: String
    let description: String?
    let attribution: String?
    let state: LoadState
    @ViewBuilder let content: () -> Content

    enum LoadState {
        case loading, loaded, empty(String), error(String)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            // Headline insight (optional, shown above chart)
            if let headline {
                Text(headline)
                    .font(.headline)
                    .foregroundStyle(.primary)
                    .fixedSize(horizontal: false, vertical: true)
            }

            // Three-line hierarchy for chart title area
            VStack(alignment: .leading, spacing: 4) {
                Text(title)
                    .font(.subheadline.weight(.medium))
                    .foregroundStyle(.primary)
                if let description {
                    Text(description)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }

            // Chart body
            Group {
                switch state {
                case .loading:
                    ChartSkeletonView()
                        .frame(minHeight: 200)
                case .loaded:
                    content()
                        .frame(minHeight: 200)
                case .empty(let message):
                    ChartEmptyView(message: message)
                        .frame(minHeight: 200)
                case .error(let message):
                    ChartErrorView(message: message)
                        .frame(minHeight: 200)
                }
            }

            // Attribution (L4 — lowest contrast)
            if let attribution {
                Text(attribution)
                    .font(.caption2)
                    .foregroundStyle(.tertiary)
            }
        }
        .padding(16)
        .background(Color(.secondarySystemBackground))
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }
}
```

### 5.3 Multi-Chart Dashboard

For overview-style screens, cap at **3 charts per visible viewport**. More than 3 creates cognitive overload; the user should navigate to a dedicated view instead.

```swift
struct OverviewDashboard: View {
    @State private var trendVM = ChartViewModel<TrendAggregator>()
    @State private var distributionVM = ChartViewModel<DistributionAggregator>()
    @State private var rankingVM = ChartViewModel<RankingAggregator>()

    var body: some View {
        ScrollView {
            LazyVStack(spacing: 16) {
                // L1 — one anchor per view
                Text("This Week")
                    .font(.largeTitle.bold())
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.horizontal)

                // 3-chart overview
                trendCard
                distributionCard
                rankingCard
            }
            .padding(.vertical)
        }
    }

    private var trendCard: some View {
        ChartCard(
            headline: currentHeadline(trendVM.state),
            title: "Focus Time",
            description: "Daily minutes, last 7 days",
            attribution: "Based on completed sessions",
            state: .from(trendVM.state)
        ) {
            // chart content
        }
        .task { await trendVM.load(using: TrendAggregator(...)) }
    }
    // ... other cards
}
```

---

## 6. SWIFT CHARTS VS ALTERNATIVES

### 6.1 Library Decisions (Do Not Deviate)

| Layer | Library | Role |
|-------|---------|------|
| **Primary renderer** | Swift Charts (iOS 16+, macOS 13+) | LineMark, BarMark, AreaMark, PointMark, RectangleMark, RuleMark, SectorMark (iOS 17+) |
| **Animation** | SwiftUI `.animation(_:value:)` | Entry animations only. No decorative motion. |
| **Data flow** | `@Observable` (iOS 17+) or `@StateObject` (iOS 16) | ViewModels for chart state |
| **Custom charts** | `Canvas` + `Path` | Radar, Treemap, custom visualizations |

**Why Swift Charts:** First-party, accessibility-integrated (VoiceOver chart narration is automatic), respects Dynamic Type and Dark Mode, zero dependencies, consistent with Apple design language.

**Do NOT use:** Charts (Daniel Gindi, deprecated), SwiftUICharts (bundle bloat), DGCharts (UIKit bridge — fights SwiftUI lifecycle).

### 6.2 Minimum OS Targets

| Feature | iOS | macOS | watchOS |
|---------|-----|-------|---------|
| LineMark, BarMark, AreaMark | 16.0 | 13.0 | 9.0 |
| PointMark, RectangleMark | 16.0 | 13.0 | 9.0 |
| SectorMark (donut/pie) | 17.0 | 14.0 | 10.0 |
| Chart3D (3D) | 26.0 | 26.0 | N/A |

If supporting iOS 16, use `BarMark` + custom layout for pie/donut approximation.

### 6.3 Setup

```swift
import Charts
import SwiftUI

// Minimum deployment target in Package.swift or project settings:
// iOS 16.0, macOS 13.0, watchOS 9.0
```

---

## 7. THEME & COLOR SYSTEM

### 7.1 Semantic Color Tokens

Mirror the web token structure but use system semantics:

```swift
// Shared/Charts/ChartColors.swift

extension Color {
    // Primary series
    static let chartPrimary = Color.blue          // chart-1 equivalent
    static let chartSecondary = Color.teal        // chart-2
    static let chartAccent = Color.orange         // chart-3
    static let chartCategorical = Color.purple    // chart-4
    static let chartRose = Color.pink             // chart-5
    static let chartPositive = Color.green        // chart-6
    static let chartNegative = Color.red          // chart-7
    static let chartHighlight = Color.yellow      // chart-8

    // Series palette for categorical data
    static let seriesPalette: [Color] = [
        .chartPrimary, .chartSecondary, .chartAccent, .chartCategorical,
        .chartRose, .chartPositive, .chartHighlight, .chartNegative
    ]
}

enum ChartTone {
    case up, down, neutral

    var color: Color {
        switch self {
        case .up: return .chartPositive
        case .down: return .chartNegative
        case .neutral: return .secondary
        }
    }
}
```

### 7.2 watchOS Circadian Override

Per Calm Precision Native v1.1 §6, watchOS uses warm wavelengths:

```swift
#if os(watchOS)
extension Color {
    static let chartPrimaryWatch = Color(red: 1.0, green: 0.6, blue: 0.2)    // warm amber
    static let chartSecondaryWatch = Color(red: 0.9, green: 0.65, blue: 0.3) // golden
    static let chartPositiveWatch = Color(red: 0.4, green: 0.75, blue: 0.5)  // sage
}
#endif
```

### 7.3 Color Usage Rules

1. **Single series** → `.chartPrimary` always
2. **Two series** → `.chartPrimary` + `.chartCategorical` (blue + purple)
3. **Good/bad** → `.chartPositive` + `.chartNegative`. Never reverse.
4. **3+ series** → walk `Color.seriesPalette` in order
5. **De-emphasis** → `.opacity(0.5)`, never a lighter color
6. **Gridlines** → `.chartYAxis { AxisGridLine().foregroundStyle(.quaternary) }` — never solid
7. **Borders** → ChartCard provides the card; never border the chart itself

---

## 8. CHART TYPE CATALOG

### 8.0 Base Pattern

Every chart follows this structure:

```swift
struct ExampleChart: View {
    let data: [DataPoint]  // accept data as prop, never fetch inside

    var body: some View {
        Chart(data) { point in
            LineMark(
                x: .value("Date", point.date),
                y: .value("Value", point.value)
            )
            .foregroundStyle(Color.chartPrimary)
        }
        .chartXAxis { /* minimal config */ }
        .chartYAxis { /* minimal config */ }
        .frame(minHeight: 200)  // NEVER omit — chart collapses without it
        .accessibilityChartDescriptor(self)  // VoiceOver support
    }
}
```

**Critical rules for every chart:**
1. `.frame(minHeight: ...)` — 200pt (compact), 280pt (standard), 360pt (feature)
2. Data passed in via init — charts are pure presentational
3. Colors from `Color.chartPrimary` etc., never hardcoded
4. Accessibility descriptor on every chart
5. No `.padding()` on the Chart itself — ChartCard handles it

### 8.1 Line Chart (Trend)

```swift
struct TrendLineChart: View {
    let data: [TrendPoint]

    struct TrendPoint: Identifiable {
        let id = UUID()
        let date: Date
        let value: Double
        let series: String  // for multi-series
    }

    var body: some View {
        Chart(data) { point in
            LineMark(
                x: .value("Date", point.date),
                y: .value("Value", point.value)
            )
            .foregroundStyle(by: .value("Series", point.series))
            .interpolationMethod(.monotone)
            .lineStyle(StrokeStyle(lineWidth: 2))
        }
        .chartForegroundStyleScale(range: Color.seriesPalette)
        .chartXAxis {
            AxisMarks(values: .stride(by: .day, count: max(1, data.count / 7))) { _ in
                AxisValueLabel(format: .dateTime.month(.abbreviated).day())
                    .font(.caption2)
                AxisGridLine().foregroundStyle(.quaternary)
            }
        }
        .chartYAxis {
            AxisMarks(position: .leading) { _ in
                AxisValueLabel().font(.caption2)
                AxisGridLine().foregroundStyle(.quaternary)
            }
        }
        .frame(minHeight: 240)
    }
}
```

**Design notes:** `.monotone` for smooth curves; `.linear` for precise data. `lineWidth: 2` matches 2px web stroke. No dots at scale (Swift Charts default).

### 8.2 Stacked Area Chart

```swift
struct StackedAreaChart: View {
    let data: [StackedPoint]

    struct StackedPoint: Identifiable {
        let id = UUID()
        let date: Date
        let category: String
        let value: Double
    }

    var body: some View {
        Chart(data) { point in
            AreaMark(
                x: .value("Date", point.date),
                y: .value("Value", point.value)
            )
            .foregroundStyle(by: .value("Category", point.category))
            .interpolationMethod(.monotone)
            .opacity(0.85)
        }
        .chartForegroundStyleScale(range: Color.seriesPalette)
        .chartLegend(position: .bottom, alignment: .leading)
        .frame(minHeight: 240)
    }
}
```

### 8.3 Vertical Bar Chart

```swift
struct VerticalBarChart: View {
    let data: [CategoryValue]

    struct CategoryValue: Identifiable {
        let id = UUID()
        let category: String
        let value: Double
    }

    var body: some View {
        Chart(data) { item in
            BarMark(
                x: .value("Category", item.category),
                y: .value("Value", item.value)
            )
            .foregroundStyle(Color.chartPrimary)
            .cornerRadius(4)
        }
        .chartXAxis {
            AxisMarks { _ in
                AxisValueLabel().font(.caption2)
            }
        }
        .chartYAxis {
            AxisMarks(position: .leading) { _ in
                AxisValueLabel().font(.caption2)
                AxisGridLine().foregroundStyle(.quaternary)
            }
        }
        .frame(minHeight: 200)
    }
}
```

### 8.4 Horizontal Bar Chart (Ranking)

```swift
struct HorizontalBarChart: View {
    let data: [RankedItem]
    let maxItems: Int

    struct RankedItem: Identifiable {
        let id = UUID()
        let name: String
        let value: Double
    }

    var sorted: [RankedItem] {
        Array(data.sorted { $0.value > $1.value }.prefix(maxItems))
    }

    var body: some View {
        Chart(sorted) { item in
            BarMark(
                x: .value("Value", item.value),
                y: .value("Name", item.name)
            )
            .foregroundStyle(Color.chartPrimary)
            .cornerRadius(4)
            .annotation(position: .trailing) {
                Text("\(Int(item.value))")
                    .font(.caption2.monospacedDigit())
                    .foregroundStyle(.secondary)
            }
        }
        .chartXAxis(.hidden)  // labels on bars, axis is noise
        .chartYAxis {
            AxisMarks(position: .leading) { _ in
                AxisValueLabel()
                    .font(.caption)
            }
        }
        .frame(minHeight: CGFloat(sorted.count) * 32 + 40)
    }
}
```

### 8.5 Grouped Bar Chart (Comparison)

```swift
struct GroupedBarChart: View {
    let data: [ComparisonPoint]

    struct ComparisonPoint: Identifiable {
        let id = UUID()
        let category: String
        let period: String  // "Current" or "Previous"
        let value: Double
    }

    var body: some View {
        Chart(data) { item in
            BarMark(
                x: .value("Category", item.category),
                y: .value("Value", item.value)
            )
            .foregroundStyle(by: .value("Period", item.period))
            .position(by: .value("Period", item.period))
            .cornerRadius(4)
        }
        .chartForegroundStyleScale([
            "Current": Color.chartPrimary,
            "Previous": Color.chartCategorical.opacity(0.5)
        ])
        .chartLegend(position: .top, alignment: .leading)
        .frame(minHeight: 240)
    }
}
```

### 8.6 Donut Chart (iOS 17+)

```swift
struct DonutChart: View {
    let data: [SliceData]
    let centerValue: String
    let centerLabel: String

    struct SliceData: Identifiable {
        let id = UUID()
        let name: String
        let value: Double
    }

    var body: some View {
        Chart(data) { slice in
            SectorMark(
                angle: .value("Value", slice.value),
                innerRadius: .ratio(0.65),
                angularInset: 2
            )
            .foregroundStyle(by: .value("Name", slice.name))
            .cornerRadius(4)
        }
        .chartForegroundStyleScale(range: Color.seriesPalette)
        .chartLegend(position: .trailing, alignment: .center)
        .chartBackground { chartProxy in
            GeometryReader { geometry in
                if let plotFrame = chartProxy.plotFrame {
                    let frame = geometry[plotFrame]
                    VStack(spacing: 2) {
                        Text(centerValue)
                            .font(.title2.bold().monospacedDigit())
                            .foregroundStyle(.primary)
                        Text(centerLabel)
                            .font(.caption2)
                            .foregroundStyle(.secondary)
                    }
                    .position(x: frame.midX, y: frame.midY)
                }
            }
        }
        .frame(minHeight: 240)
    }
}
```

### 8.7 Sparkline (Inline Trend)

```swift
struct Sparkline: View {
    let values: [Double]
    var tone: ChartTone = .neutral

    private var points: [(Int, Double)] {
        values.enumerated().map { ($0, $1) }
    }

    var body: some View {
        Chart {
            ForEach(points, id: \.0) { index, value in
                LineMark(
                    x: .value("Index", index),
                    y: .value("Value", value)
                )
                AreaMark(
                    x: .value("Index", index),
                    y: .value("Value", value)
                )
                .opacity(0.2)
            }
            .foregroundStyle(tone.color)
            .interpolationMethod(.monotone)
        }
        .chartXAxis(.hidden)
        .chartYAxis(.hidden)
        .chartPlotStyle { plot in
            plot.background(Color.clear)
        }
        .frame(height: 32)
    }
}
```

### 8.8 Heatmap (Rectangle Marks)

```swift
struct HeatmapChart: View {
    let data: [HeatmapCell]

    struct HeatmapCell: Identifiable {
        let id = UUID()
        let x: String
        let y: String
        let value: Double
    }

    private var maxValue: Double { data.map(\.value).max() ?? 1 }

    var body: some View {
        Chart(data) { cell in
            RectangleMark(
                x: .value("X", cell.x),
                y: .value("Y", cell.y)
            )
            .foregroundStyle(intensity(cell.value))
        }
        .chartXAxis {
            AxisMarks(position: .bottom) { _ in
                AxisValueLabel().font(.caption2)
            }
        }
        .chartYAxis {
            AxisMarks(position: .leading) { _ in
                AxisValueLabel().font(.caption2)
            }
        }
        .frame(minHeight: 240)
    }

    private func intensity(_ value: Double) -> Color {
        let normalized = value / maxValue
        return Color.chartPrimary.opacity(0.15 + normalized * 0.85)
    }
}
```

### 8.9 Scatter Plot

```swift
struct ScatterChart: View {
    let data: [ScatterPoint]
    let xLabel: String
    let yLabel: String

    struct ScatterPoint: Identifiable {
        let id = UUID()
        let x: Double
        let y: Double
        let category: String?
    }

    var body: some View {
        Chart(data) { point in
            PointMark(
                x: .value(xLabel, point.x),
                y: .value(yLabel, point.y)
            )
            .foregroundStyle(by: .value("Category", point.category ?? "All"))
            .symbolSize(60)
            .opacity(0.7)
        }
        .chartForegroundStyleScale(range: Color.seriesPalette)
        .chartXAxis {
            AxisMarks { _ in
                AxisValueLabel().font(.caption2)
                AxisGridLine().foregroundStyle(.quaternary)
            }
        }
        .chartYAxis {
            AxisMarks(position: .leading) { _ in
                AxisValueLabel().font(.caption2)
                AxisGridLine().foregroundStyle(.quaternary)
            }
        }
        .frame(minHeight: 280)
    }
}
```

### 8.10 Waterfall (Custom Bar)

```swift
struct WaterfallChart: View {
    let data: [WaterfallSegment]
    let startValue: Double

    struct WaterfallSegment: Identifiable {
        let id = UUID()
        let name: String
        let value: Double
        let isTotal: Bool
    }

    private var computed: [(segment: WaterfallSegment, start: Double, end: Double)] {
        var running = startValue
        return data.map { seg in
            let start = seg.isTotal ? 0 : running
            let end = seg.isTotal ? seg.value : running + seg.value
            running = seg.isTotal ? seg.value : end
            return (seg, min(start, end), max(start, end))
        }
    }

    var body: some View {
        Chart(computed, id: \.segment.id) { item in
            BarMark(
                x: .value("Name", item.segment.name),
                yStart: .value("Start", item.start),
                yEnd: .value("End", item.end)
            )
            .foregroundStyle(color(for: item.segment))
            .cornerRadius(4)
        }
        .chartXAxis {
            AxisMarks { _ in
                AxisValueLabel().font(.caption2)
            }
        }
        .chartYAxis {
            AxisMarks(position: .leading) { _ in
                AxisValueLabel().font(.caption2)
                AxisGridLine().foregroundStyle(.quaternary)
            }
        }
        .frame(minHeight: 280)
    }

    private func color(for seg: WaterfallSegment) -> Color {
        if seg.isTotal { return .chartPrimary }
        return seg.value >= 0 ? .chartPositive : .chartNegative
    }
}
```

### 8.11 Radar (Custom Canvas)

Swift Charts has no native radar. Use `Canvas` + `Path`:

```swift
struct RadarChart: View {
    let data: [RadarPoint]
    let maxValue: Double

    struct RadarPoint: Identifiable {
        let id = UUID()
        let dimension: String
        let value: Double
    }

    var body: some View {
        Canvas { context, size in
            let center = CGPoint(x: size.width / 2, y: size.height / 2)
            let radius = min(size.width, size.height) / 2 - 32
            let count = data.count
            let angleStep = (2 * .pi) / Double(count)

            // Grid rings
            for level in 1...4 {
                let levelRadius = radius * CGFloat(level) / 4
                var path = Path()
                for (i, _) in data.enumerated() {
                    let angle = angleStep * Double(i) - .pi / 2
                    let point = CGPoint(
                        x: center.x + levelRadius * cos(angle),
                        y: center.y + levelRadius * sin(angle)
                    )
                    if i == 0 { path.move(to: point) } else { path.addLine(to: point) }
                }
                path.closeSubpath()
                context.stroke(path, with: .color(.quaternary), lineWidth: 0.5)
            }

            // Data polygon
            var dataPath = Path()
            for (i, point) in data.enumerated() {
                let angle = angleStep * Double(i) - .pi / 2
                let r = radius * CGFloat(point.value / maxValue)
                let p = CGPoint(x: center.x + r * cos(angle), y: center.y + r * sin(angle))
                if i == 0 { dataPath.move(to: p) } else { dataPath.addLine(to: p) }
            }
            dataPath.closeSubpath()
            context.fill(dataPath, with: .color(.chartPrimary.opacity(0.3)))
            context.stroke(dataPath, with: .color(.chartPrimary), lineWidth: 2)

            // Axis labels
            for (i, point) in data.enumerated() {
                let angle = angleStep * Double(i) - .pi / 2
                let labelRadius = radius + 16
                let labelPoint = CGPoint(
                    x: center.x + labelRadius * cos(angle),
                    y: center.y + labelRadius * sin(angle)
                )
                let text = Text(point.dimension).font(.caption2).foregroundStyle(.secondary)
                context.draw(text, at: labelPoint, anchor: .center)
            }
        }
        .frame(minHeight: 280)
    }
}
```

### 8.12 Treemap (Custom Layout)

Swift Charts has no native treemap. Use a squarified layout algorithm with `GeometryReader`. For brevity, this spec assumes teams use a library like `SwiftUI-Treemap` or implement the algorithm inline. Key interface:

```swift
struct TreemapChart: View {
    let nodes: [TreemapNode]

    struct TreemapNode: Identifiable {
        let id = UUID()
        let name: String
        let value: Double
        let children: [TreemapNode]?
    }

    var body: some View {
        GeometryReader { geo in
            TreemapLayout(nodes: nodes, in: geo.frame(in: .local))
        }
        .frame(minHeight: 360)
    }
}
```

---

## 9. SHARED COMPONENTS & PATTERNS

### 9.1 Chart Skeleton (Loading)

```swift
struct ChartSkeletonView: View {
    @State private var shimmer = false

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            // Three "bars" simulating chart content
            HStack(alignment: .bottom, spacing: 12) {
                ForEach(0..<6, id: \.self) { i in
                    RoundedRectangle(cornerRadius: 4)
                        .fill(Color.secondary.opacity(0.2))
                        .frame(width: 24, height: CGFloat.random(in: 60...160))
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottomLeading)
        }
        .padding()
        .opacity(shimmer ? 0.5 : 1.0)
        .onAppear {
            withAnimation(.easeInOut(duration: 1.5).repeatForever(autoreverses: true)) {
                shimmer = true
            }
        }
    }
}
```

### 9.2 Chart Empty State

Follows Calm Precision P10 content strategy:

```swift
struct ChartEmptyView: View {
    let message: String
    var actionLabel: String?
    var action: (() -> Void)?

    var body: some View {
        VStack(spacing: 8) {
            Image(systemName: "chart.xyaxis.line")
                .font(.title2)
                .foregroundStyle(.tertiary)
            Text(message)
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
            if let actionLabel, let action {
                Button(actionLabel, action: action)
                    .font(.caption.weight(.medium))
                    .buttonStyle(.bordered)
                    .controlSize(.small)
            }
        }
        .padding()
        .frame(maxWidth: .infinity)
    }
}
```

### 9.3 Chart Error State

What → Why → Fix pattern (CP 6.4.1 P10):

```swift
struct ChartErrorView: View {
    let what: String
    let why: String?
    let retry: (() -> Void)?

    init(message: String, why: String? = nil, retry: (() -> Void)? = nil) {
        self.what = message
        self.why = why
        self.retry = retry
    }

    var body: some View {
        VStack(spacing: 8) {
            Image(systemName: "exclamationmark.triangle")
                .font(.title2)
                .foregroundStyle(.orange)
            Text(what)
                .font(.subheadline.weight(.medium))
                .foregroundStyle(.primary)
            if let why {
                Text(why)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
            }
            if let retry {
                Button("Try Again", action: retry)
                    .font(.caption.weight(.medium))
                    .buttonStyle(.bordered)
                    .controlSize(.small)
            }
        }
        .padding()
        .frame(maxWidth: .infinity)
    }
}
```

### 9.4 Time Range Selector

```swift
struct TimeRangeSelector: View {
    @Binding var selected: TimeRange

    enum TimeRange: String, CaseIterable {
        case week = "7D", month = "30D", quarter = "90D"
        var days: Int {
            switch self {
            case .week: return 7
            case .month: return 30
            case .quarter: return 90
            }
        }
    }

    var body: some View {
        Picker("Time Range", selection: $selected) {
            ForEach(TimeRange.allCases, id: \.self) { range in
                Text(range.rawValue).tag(range)
            }
        }
        .pickerStyle(.segmented)
        .controlSize(.small)
    }
}
```

### 9.5 Animated Number

```swift
struct AnimatedNumber: View, Animatable {
    var value: Double
    let format: (Double) -> String

    var animatableData: Double {
        get { value }
        set { value = newValue }
    }

    var body: some View {
        Text(format(value))
            .monospacedDigit()
            .contentTransition(.numericText())
    }
}

// Usage
AnimatedNumber(value: totalMinutes) { "\(Int($0))m" }
    .font(.largeTitle.bold())
    .animation(.easeOut(duration: 0.8), value: totalMinutes)
```

### 9.6 Universal Chart View

Routes to the right chart based on resolved type:

```swift
struct UniversalChart<T: Identifiable>: View {
    let data: [T]
    let profile: DataProfile
    let suggestions: [ChartType]
    let xKeyPath: KeyPath<T, String>
    let yKeyPath: KeyPath<T, Double>

    var body: some View {
        let type = ChartResolver.resolve(profile: profile, suggestions: suggestions)

        switch type {
        case .line:
            // render line chart from data
            EmptyView()
        case .bar:
            VerticalBarChart(data: data.map { VerticalBarChart.CategoryValue(category: $0[keyPath: xKeyPath], value: $0[keyPath: yKeyPath]) })
        case .horizontalBar:
            HorizontalBarChart(data: data.map { HorizontalBarChart.RankedItem(name: $0[keyPath: xKeyPath], value: $0[keyPath: yKeyPath]) }, maxItems: 10)
        // ... other cases
        case .none:
            ChartEmptyView(message: "Insufficient data for visualization")
        default:
            ChartEmptyView(message: "Chart type not yet supported")
        }
    }
}
```

---

## 10. PLATFORM VARIANTS

### 10.1 iOS (Primary Target)

- Default chart heights: 200pt (compact), 280pt (standard), 360pt (feature)
- Use `.chartLegend(position: .bottom)` for mobile (legends to the side waste width)
- Tap-to-inspect via `.chartXSelection` (iOS 17+)
- Respect Dynamic Type — all axis labels use `.font(.caption2)` not hardcoded sizes

### 10.2 macOS

- Chart heights can grow — `min: 200, ideal: 360, max: 600`
- `.chartLegend(position: .trailing)` works well with wider viewports
- Enable hover inspection via `.onContinuousHover`
- Keyboard navigation: `.focusable()` + arrow-key traversal of marks

### 10.3 watchOS

- **Sparklines only** for most views — full charts are too dense for the small screen
- If a full chart is needed: max height 80pt, single series, no legend, no axes
- Use the circadian warm palette (§7.2)
- Prefer showing a headline number with a sparkline beneath over a full chart

```swift
#if os(watchOS)
struct WatchStatCard: View {
    let value: String
    let label: String
    let trend: [Double]

    var body: some View {
        VStack(spacing: 4) {
            Text(value)
                .font(.system(size: 28, weight: .medium, design: .rounded))
                .foregroundStyle(Color.chartPrimaryWatch)
            Text(label)
                .font(.caption2)
                .foregroundStyle(.secondary)
            Sparkline(values: trend, tone: .neutral)
                .frame(height: 24)
        }
    }
}
#endif
```

### 10.4 Widgets & Live Activities

Charts in widgets must render statically (no animation, no interaction):

```swift
struct FocusWidgetView: View {
    let entry: FocusEntry

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("Focus")
                .font(.caption.weight(.medium))
                .foregroundStyle(.secondary)
            Text("\(entry.totalMinutes)m")
                .font(.title2.bold().monospacedDigit())
            Chart(entry.weekData) { point in
                BarMark(
                    x: .value("Day", point.day),
                    y: .value("Minutes", point.minutes)
                )
                .foregroundStyle(Color.chartPrimary)
                .cornerRadius(2)
            }
            .chartXAxis(.hidden)
            .chartYAxis(.hidden)
            .frame(height: 40)
        }
        .padding(12)
    }
}
```

---

## 11. PERFORMANCE & QUALITY

### 11.1 Data Point Limits

| Chart | Max Before Degradation | Mitigation |
|-------|----------------------|------------|
| Line | 500 | Downsample: every Nth point |
| Bar | 50 | Paginate or scroll |
| Stacked Area | 200 / series | Aggregate or reduce series |
| Donut | 8 slices | Group remainder as "Other" |
| Sparkline | 60 | Rolling window |
| Scatter | 300 | Sample or cluster |
| Heatmap | 500 cells | Aggregate into wider bins |
| Waterfall | 15 | Group minor contributors |

### 11.2 Rendering Performance

- **Avoid recomputing profiles** — use `@Observable` or `.onChange` with cached values
- **Use `LazyVStack`** in scroll views with multiple charts
- **Defer off-screen charts** — don't load data for charts below the fold until visible

```swift
ScrollView {
    LazyVStack(spacing: 16) {
        ForEach(cards) { card in
            ChartCard(...) { chartContent(card) }
                .onAppear { viewModel.loadIfNeeded(card.id) }
        }
    }
}
```

### 11.3 Typography

| Element | Size | Style | Color |
|---------|------|-------|-------|
| Chart title (in card) | `.subheadline.weight(.medium)` | semibold | `.primary` |
| Chart description | `.caption` | regular | `.secondary` |
| Axis labels | `.caption2` | regular | `.secondary` (via AxisValueLabel default) |
| Data annotations | `.caption2.monospacedDigit()` | regular | `.secondary` |
| KPI numbers | `.title2.bold().monospacedDigit()` | bold | `.primary` |
| Attribution | `.caption2` | regular | `.tertiary` |

### 11.4 Animation Rules

- **Entry only.** Swift Charts animates by default on `.animation(_:value:)` applied to the Chart.
- **Duration:** 300–500ms.
- **Easing:** `.easeOut` only. No spring, no bounce.
- **Sparklines:** `.transaction { $0.animation = nil }` — inline elements don't animate.
- **Respect reduce motion:** `@Environment(\.accessibilityReduceMotion)` → disable animation.

```swift
@Environment(\.accessibilityReduceMotion) var reduceMotion

Chart(data) { /* ... */ }
    .animation(reduceMotion ? nil : .easeOut(duration: 0.4), value: data.count)
```

### 11.5 Accessibility

- Every chart MUST have `.accessibilityChartDescriptor(self)` — conform to `AXChartDescriptorRepresentable`
- Alternative: `.accessibilityLabel("Trend chart showing focus minutes")` + `.accessibilityValue("47 minutes today, up 12 from yesterday")`
- Don't rely on color alone to convey meaning — use pattern, shape, or labels

```swift
extension TrendLineChart: AXChartDescriptorRepresentable {
    func makeChartDescriptor() -> AXChartDescriptor {
        let xAxis = AXNumericDataAxisDescriptor(
            title: "Date",
            range: 0...Double(data.count),
            gridlinePositions: []
        ) { "Day \(Int($0) + 1)" }

        let yAxis = AXNumericDataAxisDescriptor(
            title: "Minutes",
            range: 0...(data.map(\.value).max() ?? 100),
            gridlinePositions: []
        ) { "\(Int($0)) minutes" }

        let series = AXDataSeriesDescriptor(
            name: "Focus Time",
            isContinuous: true,
            dataPoints: data.enumerated().map { i, point in
                AXDataPoint(x: Double(i), y: point.value)
            }
        )

        return AXChartDescriptor(
            title: "Focus time over the last 7 days",
            summary: "Daily focus minutes",
            xAxis: xAxis,
            yAxis: yAxis,
            additionalAxes: [],
            series: [series]
        )
    }
}
```

---

## 12. FILE STRUCTURE

```
Shared/
├── Charts/
│   ├── ChartType.swift                # enum + registry
│   ├── ChartResolver.swift            # data → type routing
│   ├── ChartIntent.swift              # query intent classifier
│   ├── ChartViewModel.swift           # @Observable state container
│   ├── ChartColors.swift              # palette tokens
│   ├── ChartCard.swift                # universal container
│   ├── Components/
│   │   ├── ChartSkeletonView.swift
│   │   ├── ChartEmptyView.swift
│   │   ├── ChartErrorView.swift
│   │   ├── TimeRangeSelector.swift
│   │   ├── AnimatedNumber.swift
│   │   └── Sparkline.swift
│   ├── Types/
│   │   ├── TrendLineChart.swift       # §8.1
│   │   ├── StackedAreaChart.swift     # §8.2
│   │   ├── VerticalBarChart.swift     # §8.3
│   │   ├── HorizontalBarChart.swift   # §8.4
│   │   ├── GroupedBarChart.swift      # §8.5
│   │   ├── DonutChart.swift           # §8.6
│   │   ├── HeatmapChart.swift         # §8.8
│   │   ├── ScatterChart.swift         # §8.9
│   │   ├── WaterfallChart.swift       # §8.10
│   │   ├── RadarChart.swift           # §8.11
│   │   └── TreemapChart.swift         # §8.12
│   └── Aggregators/
│       ├── ChartAggregator.swift      # protocol
│       ├── TrendAggregator.swift
│       ├── HealthTrendAggregator.swift
│       ├── RankingAggregator.swift
│       ├── DistributionAggregator.swift
│       └── AttributionAggregator.swift

iOS/
└── Charts/
    └── Widget/
        └── FocusWidgetView.swift       # Widget-specific chart

watchOS/
└── Charts/
    └── WatchStatCard.swift             # Sparkline-centric pattern

macOS/
└── Charts/
    └── ChartInspector.swift            # hover-to-inspect view
```

---

## 13. TESTING CHECKLIST

**Before shipping any chart:**

- [ ] Renders with empty data (shows empty state, not broken chart)
- [ ] Renders with 1–2 points (confidence gate catches this, falls back to text)
- [ ] Renders with 100+ points (no frame drops)
- [ ] Dark Mode colors legible and distinct
- [ ] Light Mode colors legible and distinct
- [ ] Dynamic Type at xxxLarge doesn't break layout
- [ ] VoiceOver announces chart summary + data points
- [ ] Reduce Motion disables entry animation
- [ ] iPhone SE (smallest width, 320pt) doesn't clip
- [ ] iPad landscape uses horizontal space (legend trailing)
- [ ] macOS window resize handles gracefully
- [ ] watchOS uses sparkline variant, not full chart
- [ ] Loading skeleton shows during fetch
- [ ] Error state shows on failure with retry
- [ ] Attribution appears beneath every chart
- [ ] `.frame(minHeight:)` set on all Chart views
- [ ] Confidence gate enforced — no charts with <3 data points

**Before shipping chart integration into a view:**

- [ ] Intent classifier correctly routes 20+ test queries
- [ ] Intent classifier returns `.none` for non-visual queries
- [ ] Multi-chart dashboards cap at 3 per viewport
- [ ] Headline insight appears above every chart
- [ ] Three-line hierarchy (headline → title/desc → attribution) present
- [ ] L1 page anchor exists and is uncontested
- [ ] L3 content (charts + text) ≥60% of viewport
- [ ] Charts hide gracefully when data fetch fails
- [ ] Widgets render charts statically (no animation)

---

## 14. COMMON MISTAKES

| Mistake | Fix |
|---------|-----|
| Chart renders at 0 height | Add `.frame(minHeight: 200)` to the Chart |
| Colors don't adapt Dark Mode | Use `.chartPrimary` etc., never hardcoded hex |
| Chart animates on every tap | Scope `.animation(_:value:)` to specific data changes |
| Accessibility fails audit | Add `.accessibilityChartDescriptor(self)` |
| watchOS chart unreadable | Use `Sparkline` instead of full chart |
| Legend overflows on iPhone | `.chartLegend(position: .bottom)` on compact width |
| Donut center label misaligned | Use `chartProxy.plotFrame` + `GeometryReader` (§8.6) |
| Bar labels cut off | Reduce count or add `.annotation(position: .trailing)` |
| Stacked areas invisible | Each AreaMark needs unique color via `foregroundStyle(by:)` |
| Chart without context | Missing headline — use ChartCard with headline param |
| Confidence gate skipped | Data layer must return `ChartDataResponse` with `chartable` flag |
| Wrong chart type | Resolver and intent disagree — resolver wins; log discrepancy |
| Mock data shipped | Functional integrity violation — use `ChartEmptyView` instead |

---

## 15. AUTO-APPLY RULES

1. Every chart lives inside a `ChartCard` — never standalone
2. Every ChartCard has: headline (optional) + title + description + chart + attribution
3. Every chart has `.frame(minHeight: 200)` minimum
4. Every chart has `.accessibilityChartDescriptor(self)` or equivalent label
5. Colors from `Color.chartPrimary` etc. — never hardcoded
6. Confidence gate enforced at data layer — no charts with <3 points
7. watchOS uses `Sparkline` — not full charts
8. Widget charts are static — no animation, no interaction
9. Entry animations only — no pulsing, no decoration
10. Respect `accessibilityReduceMotion` on all animations
11. `@Observable` for iOS 17+, `ObservableObject` for iOS 16
12. Axis labels `.caption2` — never hardcoded sizes
13. Data passed via init — charts are pure presentational
14. Aggregators return `ChartDataResponse` with chartable + confidence + attribution
15. Max 3 charts per viewport on dashboards
16. Headline insight above chart — not below
17. Status colors: positive = green, negative = red, never reverse
18. Sparklines don't animate (`transaction { $0.animation = nil }`)
19. Treemap and Radar use Canvas — not Chart
20. iOS 17+ features (SectorMark) guarded with `if #available`

---

*Calm Precision — Native Charts v1.0*
*Companion to Calm Precision Native v1.1*
*Derived from Atomize AI chart architecture + Swift Charts best practices + CP 6.4.1 content strategy*
