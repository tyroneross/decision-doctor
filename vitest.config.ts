// PRD §18.1 — vitest config for F-criteria tests (T-08, T-09, T-10) and unit tests.
// Loads .env.local before running so DATABASE_URL et al are available to integration tests.
import { defineConfig } from "vitest/config";
import { config as loadEnv } from "dotenv";
import path from "node:path";

loadEnv({ path: path.resolve(process.cwd(), ".env.local") });

export default defineConfig({
  test: {
    environment: "node",
    include: [
      "tests/**/*.test.ts",
      "lib/engine/__tests__/**/*.test.ts",
      "lib/engine/workflow/__tests__/**/*.test.ts",
      "lib/chat/__tests__/**/*.test.ts",
    ],
    testTimeout: 15_000, // integration tests against Neon may take a few seconds
    hookTimeout: 15_000,
    globals: false,
    pool: "forks", // required: Neon WebSocket pool + AsyncLocalStorage don't survive worker threads
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
      // server-only ships only an ESM stub that throws if imported in client; in tests we
      // run as Node so we alias it to an empty module. Same pattern Next.js uses internally.
      "server-only": path.resolve(__dirname, "tests/_shims/server-only.ts"),
    },
  },
});
