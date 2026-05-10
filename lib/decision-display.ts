// Display-layer helpers — derive UI presentation from the engine's
// DecisionOutput shape. Pure, no IO. Used by:
//   - components/chat/Chat.tsx        (in-thread DecisionCard)
//   - components/recommendation/RecommendationView.tsx
//   - app/app/decisions/page.tsx      (list hero metric)
//
// Defensive: every accessor handles null/undefined JSON columns gracefully
// because the `Decision` row's JSON columns are typed `unknown` at the DB
// boundary.

import type { AiFeasibility, TemplateId } from "@/shared/schema";

// ─── Category mapping ───────────────────────────────────────────────────

export type DecisionCategory = "capacity" | "pricing" | "admin" | "skill" | "other";

export interface CategoryStyle {
  id: DecisionCategory;
  label: string;
  /** Tailwind text color class (foreground). */
  fg: string;
  /** Tailwind bg color class (chip background). */
  bg: string;
  /** Tailwind background color for the left edge stripe on cards. */
  stripe: string;
  /** Hex value for inline style fallbacks where Tailwind class purging is risky. */
  hex: string;
}

const CATEGORY_BY_TEMPLATE: Record<TemplateId | string, DecisionCategory> = {
  capacity: "capacity",
  pricing: "pricing",
  "admin-hire": "admin",
};

const CATEGORY_STYLES: Record<DecisionCategory, CategoryStyle> = {
  capacity: {
    id: "capacity",
    label: "Capacity",
    fg: "text-cat-cap-deep",
    bg: "bg-cat-cap-bg",
    stripe: "bg-cat-cap",
    hex: "#ff6b4a",
  },
  pricing: {
    id: "pricing",
    label: "Pricing",
    fg: "text-cat-price-deep",
    bg: "bg-cat-price-bg",
    stripe: "bg-cat-price",
    hex: "#e8a93a",
  },
  admin: {
    id: "admin",
    label: "Admin hire",
    fg: "text-cat-admin",
    bg: "bg-cat-admin-bg",
    stripe: "bg-cat-admin",
    hex: "#7a3aa8",
  },
  skill: {
    id: "skill",
    label: "Skill",
    fg: "text-cat-skill-deep",
    bg: "bg-cat-skill-bg",
    stripe: "bg-cat-skill",
    hex: "#0fb8a6",
  },
  other: {
    id: "other",
    label: "Other",
    fg: "text-cat-other",
    bg: "bg-cat-other-bg",
    stripe: "bg-cat-other",
    hex: "#5b6cff",
  },
};

export function categoryFor(templateId: string | null | undefined): CategoryStyle {
  if (!templateId) return CATEGORY_STYLES.other;
  const c = CATEGORY_BY_TEMPLATE[templateId] ?? "other";
  return CATEGORY_STYLES[c];
}

// ─── F-08 AI feasibility chips ──────────────────────────────────────────
//
// The 4-tier prescriptive chip. Tells the user HOW to ship a reducer, not
// just whether it's feasible. Tokens map to Sunrise palette already defined
// in tailwind.config.ts (cat-skill / plum / cat-cap / ink-500).

export interface FeasibilityStyle {
  /** Enum key from shared/schema.ts AiFeasibilitySchema. */
  key: AiFeasibility;
  /** Plain-language label, no jargon. */
  label: string;
  /** Single emoji icon prefix — non-color semantics (a11y). */
  icon: "🛠️" | "🧩" | "🤖" | "👤";
  /** Tailwind text class for the foreground tone. */
  fg: string;
  /** Tailwind bg class for chip background. */
  bg: string;
  /** Hint for the "next step" the chip implies. */
  ship: string;
}

const FEASIBILITY_STYLES: Record<AiFeasibility, FeasibilityStyle> = {
  skill: {
    key: "skill",
    label: "Skill",
    icon: "🛠️",
    fg: "text-cat-skill-deep",
    bg: "bg-cat-skill-bg",
    ship: "Ship today",
  },
  plugin: {
    key: "plugin",
    label: "Plugin",
    icon: "🧩",
    fg: "text-plum",
    bg: "bg-plum-bg",
    ship: "Ship this week",
  },
  agent: {
    key: "agent",
    label: "Agent",
    icon: "🤖",
    fg: "text-cat-cap-deep",
    bg: "bg-cat-cap-bg",
    ship: "Ship this quarter",
  },
  human: {
    key: "human",
    label: "Human review",
    icon: "👤",
    fg: "text-ink-500",
    bg: "bg-cream-2",
    ship: "Not for AI",
  },
};

/**
 * Get the chip style for an aiFeasibility tier. Falls back to "human" for
 * unknown / missing values (defensive: legacy reducers without the field
 * render as needing human review rather than a fake AI tier).
 */
export function feasibilityFor(
  tier: AiFeasibility | null | undefined,
): FeasibilityStyle {
  if (!tier) return FEASIBILITY_STYLES.human;
  return FEASIBILITY_STYLES[tier] ?? FEASIBILITY_STYLES.human;
}

// ─── Confidence bands ───────────────────────────────────────────────────

export interface ConfidenceBand {
  /** "strong" | "lean" | "flip" — slot key in the conf-* color set. */
  key: "strong" | "lean" | "flip";
  /** Plain-language label, no jargon. */
  label: string;
  /** Single-character icon prefix — adds non-color semantics (CP audit #8). */
  icon: "✓" | "~" | "?";
  /** Tailwind text class for the foreground tone. */
  fg: string;
  /** Tailwind bg class for chip background. */
  bg: string;
}

export function confidenceBand(confidence: number | null | undefined): ConfidenceBand {
  const c = typeof confidence === "number" ? confidence : 0;
  if (c >= 75) {
    return {
      key: "strong",
      label: "Strong call",
      icon: "✓",
      fg: "text-conf-strong",
      bg: "bg-conf-strong-bg",
    };
  }
  if (c >= 50) {
    return {
      key: "lean",
      label: "Lean toward",
      icon: "~",
      fg: "text-conf-lean",
      bg: "bg-conf-lean-bg",
    };
  }
  return {
    key: "flip",
    label: "Coin flip",
    icon: "?",
    fg: "text-conf-flip",
    bg: "bg-conf-flip-bg",
  };
}

// ─── Reducer / time-back metrics ─────────────────────────────────────────

interface ReducerLike {
  title?: string;
  description?: string;
  estTimeSavingHrsPerWeek?: number;
}

/** Sum estimated weekly hours saved across an array of reducers. */
export function totalHoursSaved(reducers: unknown): number {
  if (!Array.isArray(reducers)) return 0;
  return reducers.reduce<number>((sum, r) => {
    if (r && typeof r === "object" && "estTimeSavingHrsPerWeek" in r) {
      const v = (r as ReducerLike).estTimeSavingHrsPerWeek;
      return sum + (typeof v === "number" && Number.isFinite(v) ? v : 0);
    }
    return sum;
  }, 0);
}

/**
 * Pretty-format an hours-per-week number. 1 → "1 hr", 6 → "6 hrs", 0.5 → "30 min",
 * 0 → "—". Intentionally human, not "0.50".
 */
export function formatHrs(n: number | null | undefined): string {
  if (typeof n !== "number" || !Number.isFinite(n) || n <= 0) return "—";
  if (n < 1) return `${Math.round(n * 60)} min`;
  if (Math.abs(n - Math.round(n)) < 0.05) {
    const i = Math.round(n);
    return `${i} hr${i === 1 ? "" : "s"}`;
  }
  return `${n.toFixed(1)} hrs`;
}

/**
 * Streak length in weeks: count of consecutive ISO weeks (going backwards
 * from now) where ≥1 decision was created. 0 if nothing this week.
 * Pass an array of decision createdAt timestamps; order doesn't matter.
 */
export function streakWeeks(timestamps: Array<Date | string>): number {
  if (!Array.isArray(timestamps) || timestamps.length === 0) return 0;
  const weekKey = (d: Date) => {
    // Normalize to the Monday of the ISO week (UTC).
    const x = new Date(
      Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()),
    );
    const day = x.getUTCDay() || 7; // Sun = 0 → 7
    if (day !== 1) x.setUTCDate(x.getUTCDate() - (day - 1));
    return x.toISOString().slice(0, 10);
  };
  const have = new Set<string>();
  for (const t of timestamps) {
    const dt = t instanceof Date ? t : new Date(t);
    if (!Number.isNaN(dt.getTime())) have.add(weekKey(dt));
  }
  let streak = 0;
  const cursor = new Date();
  while (have.has(weekKey(cursor))) {
    streak++;
    cursor.setUTCDate(cursor.getUTCDate() - 7);
  }
  return streak;
}

/** Friendly "X days ago" / "today" / explicit-date for older. */
export function relativeDay(d: Date | string | null | undefined): string {
  if (!d) return "";
  const date = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(date.getTime())) return "";
  const diff = Date.now() - date.getTime();
  const days = Math.floor(diff / (24 * 60 * 60 * 1000));
  if (days < 1) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;
  if (days < 30) return `${Math.floor(days / 7)} wk${Math.floor(days / 7) === 1 ? "" : "s"} ago`;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
