#!/usr/bin/env tsx
/**
 * scripts/patch-smb-eval.ts — rewrite SMB_EVAL_QUERIES in
 * tests/smb-query-eval.test.ts using the LLM-curated picks from
 * scripts/output/smb-eval-curated.json.
 *
 * Idempotent: replaces the existing const block between the markers.
 * Picks with 0 entries become expected_coverage: 'gap'.
 */

import { readFileSync, writeFileSync } from "node:fs";

interface CurationEntry {
  category: string;
  q: string;
  picks: string[];
  rationale: string;
  candidate_count: number;
}

const TEST_FILE = "tests/smb-query-eval.test.ts";
const CURATION_FILE = "scripts/output/smb-eval-curated.json";

const START_MARKER = "const SMB_EVAL_QUERIES: SmbEvalQuery[] = [";
const END_MARKER = "];";

function escapeTs(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function formatEntry(e: CurationEntry): string {
  const lines: string[] = [];
  lines.push("  {");
  lines.push(`    category: "${escapeTs(e.category)}",`);
  lines.push(`    q: "${escapeTs(e.q)}",`);
  if (e.picks.length === 0) {
    lines.push(`    relevant: [],`);
    lines.push(`    expected_coverage: "gap",`);
    const rat = e.rationale ? ` ${e.rationale.replace(/\n/g, " ").slice(0, 100)}` : "";
    lines.push(`    // LLM-curated: no corpus/library content genuinely answers this query.${rat}`);
  } else {
    lines.push(`    relevant: [`);
    for (const t of e.picks) lines.push(`      "${escapeTs(t)}",`);
    lines.push(`    ],`);
    if (e.rationale) {
      lines.push(`    // LLM-curated: ${e.rationale.replace(/\n/g, " ").slice(0, 100)}`);
    }
  }
  lines.push("  },");
  return lines.join("\n");
}

function main() {
  const test = readFileSync(TEST_FILE, "utf8");
  const curation = JSON.parse(readFileSync(CURATION_FILE, "utf8")) as CurationEntry[];

  const startIdx = test.indexOf(START_MARKER);
  if (startIdx < 0) throw new Error(`Start marker not found in ${TEST_FILE}`);
  const afterStart = startIdx + START_MARKER.length;
  // Find the closing `];` at the same indent level. We look for the END_MARKER
  // appearing on its own line.
  const endRel = test.slice(afterStart).indexOf("\n];");
  if (endRel < 0) throw new Error("End marker not found");
  const endIdx = afterStart + endRel + 1; // include the newline; then "];" follows

  const groupHeaders: Record<string, string> = {
    "compare-tools": "  // ── 1. compare-tools ─────────────────────────────────────────────────────",
    "prompt-writing": "  // ── 2. prompt-writing ────────────────────────────────────────────────────",
    "skill-design": "  // ── 3. skill-design ──────────────────────────────────────────────────────",
    "plugin-design": "  // ── 4. plugin-design ─────────────────────────────────────────────────────",
    "workflow-automation": "  // ── 5. workflow-automation ───────────────────────────────────────────────",
    "decision-frameworks": "  // ── 6. decision-frameworks ───────────────────────────────────────────────",
    "ai-adoption-solo-healthcare": "  // ── 7. ai-adoption-solo-healthcare (Track A) ─────────────────────────────",
  };

  let lastCategory = "";
  const body: string[] = [];
  body.push(""); // blank line after opening bracket
  body.push("  // LLM-curated by scripts/curate-smb-eval.ts (2026-05-12).");
  body.push("  // For each query, candidates were pulled via BM25 OR-quorum on corpus +");
  body.push("  // ILIKE on library/kb titles, then Groq picked the genuinely-relevant");
  body.push("  // titles. Empty picks → expected_coverage: 'gap' (not counted in recall).");
  body.push("");
  for (const e of curation) {
    if (e.category !== lastCategory) {
      body.push("");
      body.push(groupHeaders[e.category] ?? `  // ── ${e.category} ──`);
      lastCategory = e.category;
    }
    body.push(formatEntry(e));
  }

  const newArrayBody = body.join("\n") + "\n";
  const out = test.slice(0, afterStart) + newArrayBody + test.slice(endIdx);
  writeFileSync(TEST_FILE, out);

  const gap = curation.filter((c) => c.picks.length === 0).length;
  console.log(`Patched ${TEST_FILE}`);
  console.log(`  queries:        ${curation.length}`);
  console.log(`  with picks:     ${curation.length - gap}`);
  console.log(`  gap-flagged:    ${gap}`);
}

main();
