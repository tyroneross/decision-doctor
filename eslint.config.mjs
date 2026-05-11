// Flat-config replacement for the deprecated `next lint` command.
// Next.js 16 removed `next lint`; ESLint 9 requires flat config.
// eslint-config-next ships the rule preset; we apply it here and scope
// the lint surface to the source tree (not generated / build dirs).

import next from "eslint-config-next";

/** @type {import("eslint").Linter.Config[]} */
export default [
  ...next,
  {
    ignores: [
      ".next/**",
      ".vercel/**",
      "node_modules/**",
      "drizzle/**",
      "workers/**",
      ".build-loop/**",
      ".ibr/**",
      ".mockup-gallery/**",
      ".navgator/**",
      "tests/e2e/findings/**",
      "next-env.d.ts",
      "**/*.config.*",
    ],
  },
];
