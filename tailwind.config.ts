import type { Config } from "tailwindcss";

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
          DEFAULT: "#0f172a",
          subtle: "#475569",
          muted: "#64748b",
        },
        canvas: {
          DEFAULT: "#fafaf9",
          raised: "#ffffff",
        },
        accent: {
          DEFAULT: "#0f172a",
        },
        confidence: {
          high: "#16a34a",
          mid: "#f59e0b",
          low: "#dc2626",
        },
      },
    },
  },
  plugins: [require("@tailwindcss/forms"), require("@tailwindcss/typography")],
};

export default config;
