import nextVitals from "eslint-config-next/core-web-vitals";

const config = [
  ...nextVitals,
  {
    ignores: [
      ".build-loop/**",
      ".next/**",
      "coverage/**",
      "node_modules/**",
      "public/sw.js",
      "public/workbox-*.js",
      "tsconfig.tsbuildinfo",
    ],
  },
  {
    files: ["app/**/*.tsx", "components/**/*.tsx"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "MemberExpression[object.object.name='process'][object.property.name='env'][property.name=/^GROQ_/]",
          message:
            "GROQ_* env vars must not be referenced in client components. Use server routes instead.",
        },
      ],
    },
  },
];

export default config;
