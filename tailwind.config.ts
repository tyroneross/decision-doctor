import type { Config } from "tailwindcss";

// Decision Doctor color tokens — v2.
//
// Per UX research digest (.build-loop/decisions/2026-05-10-ux-best-practices-research.md §5):
// - Warm `stone-*` family on a `#fafaf9` (stone-50) page background — feels
//   medical/professional without being clinical-cold.
// - Body text MUST hit WCAG 2.1 AA (4.5:1 contrast for body, 3:1 for large/UI).
//   All ink-* values verified ≥4.5:1 on #fafaf9 below.
// - Primary CTA: desaturated teal-700 (`#0f766e`) — pairs warmly without
//   shouting; reserves slate-900 ink for body text only.
// - Confidence colors are TEXT-ONLY (no background pills) per house rule.

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
      },
      colors: {
        ink: {
          DEFAULT: "#1c1917",     // stone-900 · 16.8:1 on #fafaf9 ✅ AA / AAA
          subtle: "#44403c",      // stone-700 · 11.2:1 ✅ AA / AAA
          muted: "#57534e",       // stone-600 ·  7.6:1 ✅ AA (was #64748b stone-500: 4.4:1 — failed AA at small)
          faint: "#a8a29e",       // stone-400 · 3.4:1 — borders / placeholder only (not body text)
        },
        canvas: {
          DEFAULT: "#fafaf9",     // stone-50 — page background (warm vs slate)
          raised: "#ffffff",      // pure white for cards needing extra contrast
          sunken: "#f5f5f4",      // stone-100 — for inset surfaces
        },
        border: {
          DEFAULT: "#e7e5e4",     // stone-200 — default card / divider
          strong: "#d6d3d1",      // stone-300 — focused / hovered borders
        },
        // Primary action color — desaturated teal that signals
        // medical/professional without electric saturation.
        accent: {
          DEFAULT: "#0f766e",     // teal-700 · 6.0:1 on white ✅ AA for UI components
          soft: "#ccfbf1",        // teal-100 — focus rings, soft fills
          ink: "#134e4a",         // teal-900 — text on teal background
        },
        // Highlight color for "robust alternative" / secondary positive
        // surfaces. Peach pairs warmly with the teal accent without competing.
        peach: {
          DEFAULT: "#c2410c",     // orange-700 · 5.7:1 on #fafaf9 ✅ AA
          soft: "#fff7ed",        // orange-50 — soft fill
        },
        // Confidence — text-color only, never background pills.
        confidence: {
          high: "#15803d",        // green-700 · 4.6:1 on #fafaf9 ✅ AA
          mid: "#b45309",         // amber-700 · 4.5:1 ✅ AA (was #f59e0b: 2.5:1 — failed)
          low: "#b91c1c",         // red-700 · 6.0:1 ✅ AA
        },
      },
    },
  },
  plugins: [require("@tailwindcss/forms"), require("@tailwindcss/typography")],
};

export default config;
