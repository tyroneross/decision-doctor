// E2E persona test runner — runs as a vitest test so the `server-only` alias
// from vitest.config.ts kicks in. Generates findings/<personaId>.json + _aggregate.json.
//
// Run via: pnpm vitest run tests/e2e/run-personas.test.ts -t "personas"

import { describe, it, expect } from "vitest";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { runDecision } from "@/lib/engine/orchestrator";
import type { DecisionInput, TemplateId } from "@/shared/schema";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FAKE_TENANT = "00000000-0000-0000-0000-000000000001";
const FAKE_USER = "00000000-0000-0000-0000-0000000000a1";

interface Persona {
  id: string;
  name: string;
  templateId: string;
  scenario: string;
  intake: Record<string, unknown>;
  humanExpectedRecommendation: string;
  humanExpectedConfidence: string;
}

const scenarios: { personas: Persona[] } = JSON.parse(
  readFileSync(join(__dirname, "scenarios.json"), "utf8"),
);
const findingsDir = join(__dirname, "findings");
mkdirSync(findingsDir, { recursive: true });

describe("personas — capture engine output for scoring", () => {
  const aggregate: {
    generatedAt: string;
    total: number;
    results: Array<{
      id: string;
      template: string;
      latencyMs: number;
      confidence: number | null;
      recommendation: string | null;
      error: string | null;
    }>;
  } = {
    generatedAt: new Date().toISOString(),
    total: scenarios.personas.length,
    results: [],
  };

  for (const persona of scenarios.personas) {
    it(
      `${persona.id} ${persona.name} (${persona.templateId})`,
      async () => {
        const input: DecisionInput = {
          templateId: persona.templateId as TemplateId,
          source: { type: "user_form", capturedAt: new Date() },
          fields: persona.intake as Record<string, unknown>,
          context: { userId: FAKE_USER, tenantId: FAKE_TENANT },
        };

        const t0 = performance.now();
        let result: Awaited<ReturnType<typeof runDecision>> | null = null;
        let error: { message: string; stack?: string } | null = null;
        try {
          result = await runDecision(input);
        } catch (e) {
          const err = e as Error;
          error = { message: err.message, stack: err.stack?.slice(0, 800) };
        }
        const ms = Math.round(performance.now() - t0);

        const blob = {
          persona: {
            id: persona.id,
            name: persona.name,
            scenario: persona.scenario,
          },
          template: persona.templateId,
          expected: {
            recommendation: persona.humanExpectedRecommendation,
            confidenceRange: persona.humanExpectedConfidence,
          },
          latencyMs: ms,
          error,
          output: result?.output ?? null,
          llmCalls: result?.llmCalls ?? null,
        };

        writeFileSync(
          join(findingsDir, `${persona.id}.json`),
          JSON.stringify(blob, null, 2),
        );

        aggregate.results.push({
          id: persona.id,
          template: persona.templateId,
          latencyMs: ms,
          confidence: result?.output?.recommendation?.confidence ?? null,
          recommendation: result?.output?.recommendation?.option ?? null,
          error: error?.message ?? null,
        });

        // Soft assertion — we capture findings even on failure
        expect(error).toBeNull();
        expect(result).not.toBeNull();
      },
      90_000,
    );
  }

  it("writes aggregate", () => {
    writeFileSync(
      join(findingsDir, "_aggregate.json"),
      JSON.stringify(aggregate, null, 2),
    );
  });
});
