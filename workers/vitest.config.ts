import { defineConfig } from "vitest/config";
import { config as loadEnv } from "dotenv";
import path from "node:path";

loadEnv({ path: path.resolve(process.cwd(), ".env") });

export default defineConfig({
  // Disable CSS handling so vite doesn't search the repo root for PostCSS
  // config (the root has tailwind/postcss for the UI side; backend tests
  // never touch CSS).
  css: { postcss: { plugins: [] } },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    testTimeout: 15_000,
    hookTimeout: 15_000,
    globals: false,
    pool: "forks",
  },
});
