import { defineConfig } from "vitest/config";
import { config as dotenvConfig } from "dotenv";
import path from "node:path";

dotenvConfig({ path: ".env.local" });

export default defineConfig({
  test: {
    environment: "node",
    globals: false,
    include: ["tests/**/*.test.ts"],
    setupFiles: ["tests/setup.ts"],
    testTimeout: 60_000,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
});
