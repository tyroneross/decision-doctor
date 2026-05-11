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
