// Minimal ESLint flat config — Next 16 + ESLint 9 has interop friction with the
// next-config presets via FlatCompat (circular plugin refs). For the hackathon
// pass we lint TypeScript with the typescript-eslint defaults only, plus a few
// project rules. Stricter Next plugin rules can ship in v1.1.

import tsParser from "@typescript-eslint/parser";
import tsPlugin from "@typescript-eslint/eslint-plugin";

export default [
  {
    ignores: [
      ".next/**",
      "node_modules/**",
      "public/sw.js",
      "public/workbox-*.js",
      "public/worker-*.js",
      "drizzle/**",
      "**/*.tsbuildinfo",
      "build/**",
      "dist/**",
      ".build-loop/**",
    ],
  },
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
        ecmaFeatures: { jsx: true },
      },
    },
    plugins: {
      "@typescript-eslint": tsPlugin,
    },
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "no-console": "off",
    },
  },
];
