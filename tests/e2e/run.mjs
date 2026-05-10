// E2E test runner — calls runDecision() directly via Node, no auth/HTTP/DB.
//
// Loads each persona from scenarios.json, invokes the engine, captures latency
// + token usage + the full DecisionOutput-shaped result, and writes one JSON
// blob per persona to tests/e2e/findings/<personaId>.json. Scoring happens in
// score.mjs. This script is fast (~1-3 min for all 5 personas in series) and
// network-bound on Groq, not on Vercel.
//
// Run from repo root: node tests/e2e/run.mjs

// Run via: pnpm tsx tests/e2e/run.mjs
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// Load .env.local before any module that imports lib/env.ts
const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..", "..");
const envText = readFileSync(join(REPO_ROOT, ".env.local"), "utf8");
for (const line of envText.split("\n")) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}

const { runDecision } = await import("../../lib/engine/orchestrator.ts");

const scenarios = JSON.parse(
  readFileSync(join(__dirname, "scenarios.json"), "utf8"),
);
const findingsDir = join(__dirname, "findings");
mkdirSync(findingsDir, { recursive: true });

const FAKE_TENANT = "00000000-0000-0000-0000-000000000001";
const FAKE_USER = "00000000-0000-0000-0000-0000000000a1";

const aggregate = {
  generatedAt: new Date().toISOString(),
  total: scenarios.personas.length,
  results: [],
};

for (const persona of scenarios.personas) {
  const input = {
    templateId: persona.templateId,
    source: { type: "user_form", capturedAt: new Date() },
    fields: persona.intake,
    context: {
      userId: FAKE_USER,
      tenantId: FAKE_TENANT,
    },
  };

  const t0 = performance.now();
  let result, error;
  try {
    result = await runDecision(input);
  } catch (e) {
    error = { message: e.message, stack: e.stack?.slice(0, 600) };
  }
  const ms = Math.round(performance.now() - t0);

  const blob = {
    persona: { id: persona.id, name: persona.name, scenario: persona.scenario },
    template: persona.templateId,
    expected: {
      recommendation: persona.humanExpectedRecommendation,
      confidenceRange: persona.humanExpectedConfidence,
    },
    latencyMs: ms,
    error: error ?? null,
    output: result?.output ?? null,
    llmCalls: result?.llmCalls ?? null,
  };

  writeFileSync(
    join(findingsDir, `${persona.id}.json`),
    JSON.stringify(blob, null, 2),
  );

  const status = error ? "❌" : "✅";
  const conf = result?.output?.recommendation?.confidence;
  const opt = result?.output?.recommendation?.option;
  console.log(
    `${status} ${persona.id} ${persona.name.padEnd(8)} ${persona.templateId.padEnd(11)} ${ms.toString().padStart(5)}ms  ` +
      (error ? `error: ${error.message}` : `→ "${opt}" (conf=${conf})`),
  );
  aggregate.results.push({
    id: persona.id,
    template: persona.templateId,
    latencyMs: ms,
    confidence: conf,
    recommendation: opt,
    error: error?.message ?? null,
  });
}

writeFileSync(
  join(findingsDir, "_aggregate.json"),
  JSON.stringify(aggregate, null, 2),
);
console.log(
  `\nFindings written to tests/e2e/findings/ — run \`node tests/e2e/score.mjs\` next.`,
);
