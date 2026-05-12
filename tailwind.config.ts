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
        // ============================================================
        // UI Guidelines v0.1 — Terracotta on bone, ink-only.
        // CSS-var-backed; theme F is default. Themes A and B override
        // the same vars in app/globals.css under [data-theme="A"] /
        // [data-theme="B"] blocks.
        //
        // Color carries NO semantic meaning by default.
        //   --ok   reserved for hours-saved + audit "keep"
        //   --warn reserved for audit "retire"
        // Everything else is ink + mute on bone.
        // ============================================================
        bg: "var(--bg)",
        paper: "var(--paper)",
        ink: "var(--ink)",
        text: "var(--text)",
        mute: "var(--mute)",
        line: "var(--line)",
        ok: "var(--ok)",
        warn: "var(--warn)",
      },
      boxShadow: {
        // Canonical surface shadow — single subtle card shadow on paper.
        // No other shadow utilities; UI Guidelines v0.1 ships exactly one.
        card: "0 1px 2px rgba(31, 20, 16, 0.04), 0 1px 1px rgba(31, 20, 16, 0.02)",
      },
      fontSize: {
        // ============================================================
        // Heading type scale — UI Guidelines v0.1
        // 4-tier ladder: display / h1 / h2 / h3.
        // Tuple form carries lineHeight + fontWeight in one class.
        // Mobile size lives in the base token; `-lg` variant is the
        // desktop bump, applied via `sm:text-{token}-lg` at call sites.
        // h3 has no responsive bump (16px on both).
        // body / secondary / meta unchanged — keep Tailwind defaults
        // (text-base / text-sm / text-xs). Display ceiling is 28px;
        // anything above reads as marketing, not product tool.
        // Citations: ~/dev/research/topics/design/design.type-scale.product-app-mobile-first.md
        // ============================================================
        display: ["22px", { lineHeight: "1.15", fontWeight: "600" }],
        "display-lg": ["24px", { lineHeight: "1.15", fontWeight: "600" }],
        h1: ["22px", { lineHeight: "1.2", fontWeight: "600" }],
        "h1-lg": ["24px", { lineHeight: "1.2", fontWeight: "600" }],
        h2: ["18px", { lineHeight: "1.3", fontWeight: "600" }],
        "h2-lg": ["20px", { lineHeight: "1.3", fontWeight: "600" }],
        h3: ["16px", { lineHeight: "1.4", fontWeight: "600" }],
      },
      fontFamily: {
        sans: [
          "var(--font-inter)",
          "Inter",
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "Roboto",
          "sans-serif",
        ],
        mono: [
          "var(--font-plex-mono)",
          "IBM Plex Mono",
          "ui-monospace",
          "SFMono-Regular",
          "Menlo",
          "monospace",
        ],
      },
      keyframes: {
        "fade-up": {
          from: { opacity: "0", transform: "translateY(4px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
      },
      animation: {
        "fade-up": "fade-up 200ms cubic-bezier(0.2, 0.8, 0.2, 1) both",
        shimmer: "shimmer 1.6s linear infinite",
      },
    },
  },
  plugins: [forms, typography],
};

export default config;
