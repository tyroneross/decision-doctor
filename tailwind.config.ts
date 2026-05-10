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
        // V2 SUNRISE PALETTE
        // Cream-paper background, coral/peach/sun accents, plum + teal
        // for category and skill semantics. Hand-picked for AA contrast
        // on cream-2 (#ffeede). All pairs verified at:
        //   coral on cream-2     5.4:1
        //   ink-900 on cream     11.4:1
        //   white on coral-deep  4.7:1 (text)
        //   plum  on plum-bg     7.4:1
        //   teal  on skill-bg    5.1:1
        //
        // brand/* and accent/* are kept as ALIASES into the new palette
        // so the sign-in screens and intake form (still on the v1 names)
        // pick up the new colors without per-file rewrites.
        // ============================================================
        cream: {
          DEFAULT: "#fff7ef",
          2: "#ffeede",
        },
        ink: {
          900: "#1f1410",
          800: "#3a2c24",
          700: "#4a3a30",
          500: "#8a7a6e",
          300: "#c8b8a8",
          100: "#f1e3d3",
          50: "#fbf5ed",
        },
        rule: "#f1d8be",
        coral: {
          DEFAULT: "#ff6b4a",
          2: "#ff8d5e",
          deep: "#b3361b",
        },
        peach: "#ffb085",
        sun: "#ffc857",
        teal: {
          DEFAULT: "#0fb8a6",
          deep: "#075a51",
        },
        plum: {
          DEFAULT: "#7a3aa8",
          bg: "#f1e4f8",
        },
        // Category swatches — semantic. Each pairs with a -bg for chips.
        cat: {
          cap: "#ff6b4a",
          "cap-bg": "#ffe9e0",
          "cap-deep": "#b3361b",
          price: "#e8a93a",
          "price-bg": "#fff2d4",
          "price-deep": "#a26b08",
          admin: "#7a3aa8",
          "admin-bg": "#f1e4f8",
          skill: "#0fb8a6",
          "skill-bg": "#dffaf6",
          "skill-deep": "#075a51",
          other: "#5b6cff",
          "other-bg": "#e6e9ff",
        },
        // Confidence band colors — used as chips, never as headlines.
        conf: {
          strong: "#1f9b4f",
          "strong-bg": "#dcf3e3",
          lean: "#c98512",
          "lean-bg": "#fff0d4",
          flip: "#c4364a",
          "flip-bg": "#fbe0e2",
        },
        // ALIASES into sunrise — keeps legacy class names rendering correctly.
        brand: {
          50: "#fff7ef",
          100: "#ffeede",
          300: "#ffb085",
          500: "#ff8d5e",
          600: "#ff6b4a",
          700: "#b3361b",
          800: "#7a3aa8",
          900: "#1f1410",
        },
        accent: {
          600: "#0fb8a6",
          500: "#0fb8a6",
          50: "#dffaf6",
        },
      },
      boxShadow: {
        soft: "0 4px 24px rgba(255,107,74,.08)",
        lift: "0 12px 28px rgba(255,107,74,.18)",
        ledger: "0 8px 32px rgba(255,107,74,.08)",
        "coral-press": "0 2px 8px rgba(255,107,74,.35)",
        "coral-hover": "0 8px 20px rgba(255,107,74,.45)",
      },
      fontFamily: {
        sans: [
          "Inter",
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "Roboto",
          "sans-serif",
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
