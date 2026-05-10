// Scalability — fan 10 + 25 concurrent runDecision() calls and capture
// p50/p95/p99 latency + error rate. Captured to tests/e2e/findings/_scale.json.
//
// Run via: pnpm vitest run tests/e2e/concurrent.test.ts

import { describe, it, expect } from "vitest";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { runDecision } from "@/lib/engine/orchestrator";
import type { DecisionInput, TemplateId } from "@/shared/schema";

const __dirname = dirname(fileURLToPath(import.meta.url));
const findingsDir = join(__dirname, "findings");
mkdirSync(findingsDir, { recursive: true });

const FAKE_TENANT = "00000000-0000-0000-0000-000000000001";

function makeInput(seed: number): DecisionInput {
  // Vary fields slightly per seed so requests aren't identical (avoids any
  // accidental upstream caching skewing the measurement).
  return {
    templateId: "capacity" as TemplateId,
    source: { type: "user_form", capturedAt: new Date() },
    fields: {
      weeklyClinicalHours: 30 + (seed % 5),
      currentWeeklyPatients: 18 + (seed % 4),
      waitlistLength: seed % 3,
      avgRevenuePerVisitUSD: 170 + (seed % 30),
      energyLevel: ["depleted", "steady", "energized"][seed % 3],
      practiceStage: "growing",
      horizonMonths: 12,
    },
    context: {
      userId: `00000000-0000-0000-0000-${String(10000 + seed).padStart(12, "0")}`,
      tenantId: FAKE_TENANT,
    },
  };
}

async function runWave(n: number) {
  const t0 = performance.now();
  const settled = await Promise.allSettled(
    Array.from({ length: n }, (_, i) => {
      const start = performance.now();
      return runDecision(makeInput(i)).then(
        (r) => ({ ok: true as const, ms: performance.now() - start, conf: r.output.recommendation.confidence }),
        (e: Error) => ({ ok: false as const, ms: performance.now() - start, error: e.message }),
      );
    }),
  );
  const wallMs = Math.round(performance.now() - t0);
  const results = settled.map((s) => (s.status === "fulfilled" ? s.value : { ok: false as const, ms: 0, error: "promise rejected" }));
  const ok = results.filter((r) => r.ok);
  const err = results.filter((r) => !r.ok);
  const sorted = ok.map((r) => r.ms).sort((a, b) => a - b);
  const pct = (p: number) => sorted[Math.floor(sorted.length * p)] ?? null;
  return {
    n,
    wallMs,
    successCount: ok.length,
    errorCount: err.length,
    errorRate: err.length / n,
    p50ms: Math.round(pct(0.5) ?? 0),
    p95ms: Math.round(pct(0.95) ?? 0),
    p99ms: Math.round(pct(0.99) ?? 0),
    minMs: Math.round(sorted[0] ?? 0),
    maxMs: Math.round(sorted[sorted.length - 1] ?? 0),
    sampleErrors: err.slice(0, 3).map((e) => e.error).filter(Boolean),
  };
}

describe("scalability", () => {
  const summary: Record<string, unknown> = { generatedAt: new Date().toISOString() };

  it(
    "wave of 10 concurrent",
    async () => {
      summary.wave10 = await runWave(10);
      console.log("WAVE 10:", summary.wave10);
    },
    180_000,
  );

  it(
    "wave of 25 concurrent",
    async () => {
      summary.wave25 = await runWave(25);
      console.log("WAVE 25:", summary.wave25);
    },
    300_000,
  );

  it("write summary", () => {
    writeFileSync(
      join(findingsDir, "_scale.json"),
      JSON.stringify(summary, null, 2),
    );
    expect((summary.wave10 as { errorRate: number }).errorRate).toBeLessThan(0.1);
  });
});
