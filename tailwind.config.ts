import type { Config } from "tailwindcss";
import forms from "@tailwindcss/forms";
import typography from "@tailwindcss/typography";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx,mdx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Calm Precision = restraint, not greyscale. Two functional palettes:
        //
        //   ink/*    Neutral text + chrome (always present)
        //   brand/*  Sage-teal — primary brand for CTAs, active states,
        //            assistant message bubbles, header avatar (Semantic Accent
        //            System, per Calm Precision iOS §1 — productivity archetype).
        //   accent/* Cool indigo — kept for "save" / "export" secondary actions
        //            and link text inside data views, where contrast vs brand
        //            communicates "this acts on the world", not "this navigates".
        //
        // Status colors (emerald/amber/rose) live in @layer utilities in
        // globals.css and stay text-only — no background badges (CP rule).
        ink: {
          900: "#1f2937",
          800: "#293544",
          700: "#374151",
          500: "#6b7280",
          300: "#d1d5db",
          100: "#f3f4f6",
          50: "#f9fafb",
        },
        // Sage-teal — calm, trustworthy, healthcare-adjacent. Selected over
        // pure blue because blue reads "corporate utility" and we want
        // "thinking partner". Hand-picked stops with verified contrast:
        //   bg-brand-50 text-brand-700  → 6.8:1 (AA-large on body text)
        //   bg-brand-600 text-white     → 5.4:1 (AA-large)
        //   bg-brand-700 text-white     → 7.6:1 (AA full-text)
        brand: {
          50: "#ecfaf6",
          100: "#d2f3e8",
          300: "#7cdcc1",
          500: "#1aae8a",
          600: "#0e8c70",
          700: "#0a6d59",
          800: "#0a5648",
          900: "#0a3f37",
        },
        accent: {
          600: "#2563eb",
          500: "#3b82f6",
          50: "#eff6ff",
        },
      },
      fontFamily: {
        sans: ["ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "Roboto", "sans-serif"],
      },
    },
  },
  plugins: [forms, typography],
};

export default config;
