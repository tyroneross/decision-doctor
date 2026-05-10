// AI-leverage orchestrator (v2 — replaces the 5-stage MCDA path for the
// canonical user flow).
//
// Pipeline:
//   1. Deterministic filter — drop tools that violate HIPAA / budget / specialty
//   2. Deterministic score — (avg hr/wk saved per tool) weighted by user's
//      stated time-per-area, minus setup-day penalty, minus cost penalty
//   3. Deterministic stack-select — pick the top 2-4 tools that together fit
//      budget + cover distinct workflow areas (no two clinical-notes tools)
//   4. LLM call (ONE — rationale + per-tool prompt substitution) — assembles
//      the human-readable recommendation
//
// Total latency: ~1.5-2.5s (vs ~9s for the 5-LLM-call legacy path).
//
// Output shape: matches the existing DecisionOutput so the recommendation
// page renders without UI changes. recommendation.option = "Deploy this
// stack: <tool1> + <tool2> + <tool3>". alternatives = the tools that didn't
// make the stack with reason. workloadReducers = one per stack tool, fully
// hydrated with the user's actual numbers.

import "server-only";
import { callStage } from "@/lib/groq";
import {
  type DecisionInput,
  type DecisionOutput,
  DecisionOutputSchema,
} from "@/shared/schema";
import {
  AI_TOOLS,
  type AiTool,
  type Specialty,
  avgHrPerWeekSaved,
  avgMonthlyCost,
  fitsSpecialty,
  getToolById,
} from "./ai-tools";

export interface RunAiLeverageResult {
  output: DecisionOutput;
  metrics: {
    totalLatencyMs: number;
    deterministicMs: number;
    llmMs: number;
    totalTokensIn: number;
    totalTokensOut: number;
    survivors: number;
    stackSize: number;
  };
}

interface ScoredTool {
  tool: AiTool;
  // Deterministic score (higher = better). Composed of:
  //   userImpact = stated hr/wk in tool's workflow area (weights tool by where the user actually wastes time)
  //   savedHrs   = avg hr/wk this tool typically saves
  //   penalties  = -setupDays * 0.1, -avgCost * 0.005
  // Total roughly comparable across tools; only relative order matters.
  score: number;
  estimatedSavedHrs: number;  // capped by min(tool's avg, user's stated area hrs)
  estimatedMonthlyCost: number;
}

// ---------------------------------------------------------------------------
// 1. Filter — drop tools that violate hard constraints
// ---------------------------------------------------------------------------

function filterByConstraints(
  fields: Record<string, unknown>,
): { survivors: AiTool[]; eliminated: { tool: AiTool; reason: string }[] } {
  const phi = fields.phiPosture as string | undefined;
  const specialty = (fields.specialty as Specialty | undefined) ?? null;
  const budget = parseBudgetRange(fields.monthlyToolBudget);

  const survivors: AiTool[] = [];
  const eliminated: { tool: AiTool; reason: string }[] = [];

  for (const tool of AI_TOOLS) {
    // Specialty fit
    if (!fitsSpecialty(tool, specialty)) {
      eliminated.push({
        tool,
        reason: `Built for other specialties; not the right fit for ${specialtyLabel(specialty)}.`,
      });
      continue;
    }

    // HIPAA gate — refuse BAA-required tools when user said no_baa
    if (phi === "no_baa" && tool.hipaa === "baa_required") {
      eliminated.push({
        tool,
        reason: "Requires a Business Associate Agreement — you said you'd rather keep PHI off third-party tools.",
      });
      continue;
    }

    // Budget gate — exclude tools whose minimum cost exceeds the user's max budget
    const [, costMax] = tool.monthlyCostRange;
    if (budget.high > 0 && tool.monthlyCostRange[0] > budget.high) {
      eliminated.push({
        tool,
        reason: `Starts at $${tool.monthlyCostRange[0]}/mo — outside your stated budget of $${budget.low}-${budget.high}/mo.`,
      });
      continue;
    }

    survivors.push(tool);
  }

  return { survivors, eliminated };
}

// ---------------------------------------------------------------------------
// 2. Score — rank survivors by user-impact-weighted savings
// ---------------------------------------------------------------------------

function scoreTools(survivors: AiTool[], fields: Record<string, unknown>): ScoredTool[] {
  // Map workflow areas → user-stated hrs (the "where time actually goes" weight)
  const areaImpact: Record<string, number> = {
    clinical_notes: numField(fields.clinicalNotesHrs),
    patient_comms: numField(fields.patientCommsHrs),
    scheduling: numField(fields.patientCommsHrs) * 0.4, // scheduling is a sub-bucket of comms
    billing: numField(fields.billingAdminHrs),
    admin_ops: numField(fields.billingAdminHrs) * 0.6,
    personal_ai: 1, // small constant — these are nice-to-have everywhere
    human_help: numField(fields.billingAdminHrs) * 0.5,
  };

  return survivors
    .map((tool) => {
      const userImpact = areaImpact[tool.area] ?? 0;
      const toolSaved = avgHrPerWeekSaved(tool);
      // Estimated saved = min(what the tool typically saves, what the user actually spends)
      const estimatedSavedHrs = Math.min(toolSaved, userImpact);
      const setupPenalty = tool.setupDays * 0.1;
      const cost = avgMonthlyCost(tool);
      const costPenalty = cost * 0.005;
      const score = estimatedSavedHrs - setupPenalty - costPenalty;
      return {
        tool,
        score,
        estimatedSavedHrs,
        estimatedMonthlyCost: cost,
      };
    })
    .sort((a, b) => b.score - a.score);
}

// ---------------------------------------------------------------------------
// 3. Stack-select — pick top 2-4 tools that fit budget + cover distinct areas
// ---------------------------------------------------------------------------

function selectStack(scored: ScoredTool[], fields: Record<string, unknown>): {
  stack: ScoredTool[];
  runnersUp: ScoredTool[];
} {
  const budget = parseBudgetRange(fields.monthlyToolBudget);
  const stack: ScoredTool[] = [];
  const runnersUp: ScoredTool[] = [];
  const usedAreas = new Set<string>();
  let totalCost = 0;

  for (const candidate of scored) {
    // Stop after 4 picks — never overwhelm the user
    if (stack.length >= 4) {
      runnersUp.push(candidate);
      continue;
    }
    // Skip if this area already has a pick (no two clinical-notes tools, etc.)
    if (usedAreas.has(candidate.tool.area)) {
      runnersUp.push(candidate);
      continue;
    }
    // Skip if adding it would exceed budget
    if (budget.high > 0 && totalCost + candidate.estimatedMonthlyCost > budget.high * 1.1) {
      // Allow 10% over budget (for the highest-impact tool only) before we cut
      runnersUp.push(candidate);
      continue;
    }
    // Skip if score is too low to bother (saves less than 0.5 hr/wk after penalties)
    if (candidate.score < 0.5) {
      runnersUp.push(candidate);
      continue;
    }
    stack.push(candidate);
    usedAreas.add(candidate.tool.area);
    totalCost += candidate.estimatedMonthlyCost;
  }

  return { stack, runnersUp };
}

// ---------------------------------------------------------------------------
// 4. LLM call — rationale + per-tool prompt substitution
// ---------------------------------------------------------------------------

async function generateRationale(
  stack: ScoredTool[],
  fields: Record<string, unknown>,
): Promise<{ rationale: string; tokensIn: number; tokensOut: number; latencyMs: number }> {
  const t0 = Date.now();
  const totalSaved = stack.reduce((s, t) => s + t.estimatedSavedHrs, 0);

  const sys = `You are writing a short rationale for a solo healthcare practitioner explaining why a specific stack of AI tools is the right first deployment for their week. You ONLY return JSON.

CRITICAL RULES:
1. Plain English. NEVER use words like "MCDA", "TOPSIS", "stage", "candidate", "score", "weight".
2. Reference the user's stated time numbers (clinicalNotesHrs, patientCommsHrs, billingAdminHrs) by name and value — don't make up numbers.
3. Reference each tool by its display name (passed in <stack>).
4. Acknowledge HIPAA when relevant (BAA required for clinical-touching tools).
5. NEVER assume a specific specialty — refer to "your practice" generically.
6. 2-3 sentences MAX for rationale. No bullet lists. No exclamation points.

Return JSON: {"rationale": "<2-3 sentence plain-English rationale>"}`;

  const user = `<intake>${JSON.stringify(fields)}</intake>
<stack>${JSON.stringify(stack.map((s) => ({ name: s.tool.name, area: s.tool.area, savedHrs: s.estimatedSavedHrs })))}</stack>
<total_saved_hrs_per_week>${totalSaved.toFixed(1)}</total_saved_hrs_per_week>

Write the rationale.`;

  try {
    const { answer, tokensIn, tokensOut } = await callStage({
      systemPrompt: sys,
      userPrompt: user,
      responseSchema: {},
      temperature: 0.2,
    });
    const parsed = safeJson(answer);
    const rationale =
      typeof parsed.rationale === "string" && parsed.rationale.length > 0
        ? sanitize(parsed.rationale)
        : defaultRationale(stack, totalSaved);
    return { rationale, tokensIn, tokensOut, latencyMs: Date.now() - t0 };
  } catch {
    return {
      rationale: defaultRationale(stack, totalSaved),
      tokensIn: 0,
      tokensOut: 0,
      latencyMs: Date.now() - t0,
    };
  }
}

function defaultRationale(stack: ScoredTool[], totalSaved: number): string {
  if (stack.length === 0) {
    return "Your stated time is already pretty optimized — there's nothing in the catalog that would save you a meaningful number of hours given your constraints.";
  }
  return `This stack targets the workflow areas where you said your time goes (${stack
    .map((s) => s.tool.area.replace(/_/g, " "))
    .join(", ")}) and should free roughly ${totalSaved.toFixed(0)} hours per week within the first month of deploying.`;
}

// ---------------------------------------------------------------------------
// 5. Assemble — build DecisionOutput
// ---------------------------------------------------------------------------

function assembleOutput(opts: {
  decisionId: string;
  now: Date;
  stack: ScoredTool[];
  runnersUp: ScoredTool[];
  eliminated: { tool: AiTool; reason: string }[];
  fields: Record<string, unknown>;
  rationale: string;
}): DecisionOutput {
  const { decisionId, now, stack, runnersUp, eliminated, fields, rationale } = opts;

  const totalSaved = stack.reduce((s, t) => s + t.estimatedSavedHrs, 0);
  const totalCost = stack.reduce((s, t) => s + t.estimatedMonthlyCost, 0);
  const totalSetupDays = Math.max(...stack.map((s) => s.tool.setupDays), 0);

  const stackName =
    stack.length === 0
      ? "No high-impact AI deployments matched your constraints"
      : `Deploy this stack: ${stack.map((s) => s.tool.name.split(/\s+\(/)[0]).join(" + ")}`;

  // Confidence: based on how much of the user's stated time the stack covers.
  // If the stack saves ≥60% of stated time, high; 30-60% mid; <30% low.
  const totalUserHrs =
    numField(fields.clinicalNotesHrs) +
    numField(fields.patientCommsHrs) +
    numField(fields.billingAdminHrs);
  const coverage = totalUserHrs > 0 ? totalSaved / totalUserHrs : 0;
  const confidence = Math.min(95, Math.max(50, Math.round(50 + coverage * 50)));

  const recommendation = {
    option: stackName,
    confidence,
    rationale: `${rationale} Estimated savings: ~${totalSaved.toFixed(0)} hours per week, ~$${totalCost.toFixed(0)}/month total tool cost, with the longest single tool taking ~${totalSetupDays} days to set up.`,
  };

  // Alternatives: top runners-up + eliminated tools (capped at 5 total).
  // Reasons are DIFFERENTIATED per the actual cause — never the same boilerplate
  // string twice. (Sam persona retest 2026-05-10: 3 different runners-up all
  // said "outranked + would overlap"; a sceptical buyer reads that as Mad-Libs.)
  const stackAreas = new Set(stack.map((s) => s.tool.area));
  const alternatives = [
    ...runnersUp.slice(0, 3).map((r) => {
      let reason: string;
      if (r.score < 0.5) {
        reason = "Doesn't move the needle enough on the time you said you spend in this area.";
      } else if (stackAreas.has(r.tool.area)) {
        const overlapping = stack.find((s) => s.tool.area === r.tool.area);
        reason = `Overlaps with ${overlapping?.tool.name.split(/\s+\(/)[0] ?? "an already-picked tool"} — both target the same workflow area.`;
      } else if (r.estimatedMonthlyCost > 0) {
        reason = `Solid pick (~${r.estimatedSavedHrs.toFixed(0)} hr/wk for ~$${r.estimatedMonthlyCost.toFixed(0)}/mo) but ranked just below the top picks on hours-saved-per-dollar.`;
      } else {
        reason = "Ranked just below the top picks on overall fit.";
      }
      return {
        option: r.tool.name,
        eliminatedAtStage: 4 as const,
        reason,
      };
    }),
    ...eliminated.slice(0, 2).map((e) => ({
      option: e.tool.name,
      eliminatedAtStage: 2 as const,
      reason: e.reason,
    })),
  ];
  // Always include at least 2 alternatives (Zod requires .min(2)).
  while (alternatives.length < 2) {
    alternatives.push({
      option: "Wait and audit your week again in 30 days",
      eliminatedAtStage: 4 as const,
      reason: "If the recommended stack saves less than you hoped, re-running this with refined numbers usually surfaces a better second option.",
    });
  }

  // Robust alternative — the safest single tool to deploy if the full stack feels too much
  const robustAlternative = stack.length > 0
    ? {
        option: stack[0]!.tool.name,
        why: "If deploying 3-4 tools at once feels like too much, start with this one — it's the highest-impact single move and easiest to undo.",
      }
    : {
        option: "No clearly different fallback",
        why: "Your stated time + budget didn't surface a high-confidence pick. Try widening the budget or willingness to sign BAAs and re-run.",
      };

  // workloadReducers — one per stack tool, fully hydrated
  const workloadReducers = stack.length > 0
    ? stack.map((s) => ({
        type: "playbook" as const,
        title: `Deploy ${s.tool.name.split(/\s+\(/)[0]}`,
        description: `Saves ~${s.estimatedSavedHrs.toFixed(0)} hr/wk · ~$${s.estimatedMonthlyCost.toFixed(0)}/mo · ${s.tool.setupDays} days to set up.${
          s.tool.warnings && s.tool.warnings.length > 0
            ? " " + s.tool.warnings[0]
            : ""
        }`,
        artifact: {
          playbookSteps: s.tool.setupSteps,
          ...(s.tool.url ? { pluginUrl: s.tool.url } : {}),
        },
        automationLevel: (s.tool.area === "human_help" ? "user_executes" : "ai_assisted") as "user_executes" | "ai_assisted",
        coverage: "full_task" as const,
        permission_tier: "T0" as const,
      }))
    : [
        {
          type: "playbook" as const,
          title: "Widen the search",
          description: "Re-run with a higher budget or willingness to sign BAAs.",
          artifact: { playbookSteps: ["Open the chat again", "Increase the budget range", "Toggle BAA willingness to 'selective' or 'yes'"] },
          automationLevel: "user_executes" as const,
          coverage: "task_setup" as const,
          permission_tier: "T0" as const,
        },
        {
          type: "playbook" as const,
          title: "Audit a different week",
          description: "Run the chat again next week with the actual hours you spent.",
          artifact: { playbookSteps: ["Track your hours for one week", "Re-run the chat with the real numbers"] },
          automationLevel: "user_executes" as const,
          coverage: "task_setup" as const,
          permission_tier: "T0" as const,
        },
        {
          type: "prompt" as const,
          title: "Ask Claude / ChatGPT what to try",
          description: "Sometimes a peer-consult-style sanity check from a generic LLM is enough to get unstuck.",
          artifact: {
            promptText: `I'm a solo healthcare practitioner. My week looks like this: ${numField(fields.clinicalNotesHrs)} hr clinical notes, ${numField(fields.patientCommsHrs)} hr patient comms, ${numField(fields.billingAdminHrs)} hr billing/admin. Budget for new tools: roughly $${parseBudgetRange(fields.monthlyToolBudget).high}/mo. What 1-2 small things would you try first?`,
          },
          automationLevel: "ai_assisted" as const,
          coverage: "partial_task" as const,
          permission_tier: "T0" as const,
        },
      ];

  return {
    decisionId,
    decidedAt: now,
    recommendation,
    alternatives: alternatives.slice(0, 5),
    robustAlternative,
    methodTrace: [
      {
        stage: 1,
        name: "values",
        output: { intake: fields, totalUserHrs, coverage },
      },
      {
        stage: 2,
        name: "constraints",
        output: { eliminated: eliminated.map((e) => ({ id: e.tool.id, reason: e.reason })) },
      },
      {
        stage: 3,
        name: "weights",
        output: { areaImpact: areaImpactForTrace(fields) },
      },
      {
        stage: 4,
        name: "outranking",
        output: { ranked: [...stack, ...runnersUp].map((s) => ({ id: s.tool.id, score: Number(s.score.toFixed(2)), savedHrs: s.estimatedSavedHrs })) },
      },
      {
        stage: 5,
        name: "ranking",
        output: { stack: stack.map((s) => s.tool.id), totalSaved, totalCost, totalSetupDays },
      },
    ],
    workloadReducers,
    destinations: [{ type: "user_ui", delivered: true, deliveredAt: now }],
  };
}

// ---------------------------------------------------------------------------
// Public entry
// ---------------------------------------------------------------------------

export async function runAiLeverageDecision(
  input: DecisionInput,
  opts: { decisionId: string; now?: Date } = { decisionId: "" },
): Promise<RunAiLeverageResult> {
  const t0 = Date.now();
  const fields = input.fields;
  const decisionId = opts.decisionId || crypto.randomUUID();
  const now = opts.now ?? new Date();

  // 1. Filter
  const { survivors, eliminated } = filterByConstraints(fields);

  // 2. Score
  const scored = scoreTools(survivors, fields);

  // 3. Select stack
  const { stack, runnersUp } = selectStack(scored, fields);

  const deterministicMs = Date.now() - t0;

  // 4. LLM rationale (the only LLM call)
  const llm = await generateRationale(stack, fields);

  // 5. Assemble
  const output = assembleOutput({
    decisionId,
    now,
    stack,
    runnersUp,
    eliminated,
    fields,
    rationale: llm.rationale,
  });

  // Validate against the canonical schema
  const parsed = DecisionOutputSchema.safeParse(output);
  if (!parsed.success) {
    throw new Error(
      "AI-leverage engine output failed schema validation: " + JSON.stringify(parsed.error.flatten()),
    );
  }

  return {
    output: parsed.data,
    metrics: {
      totalLatencyMs: Date.now() - t0,
      deterministicMs,
      llmMs: llm.latencyMs,
      totalTokensIn: llm.tokensIn,
      totalTokensOut: llm.tokensOut,
      survivors: survivors.length,
      stackSize: stack.length,
    },
  };
}

// Detect whether a template should use the AI-leverage path vs legacy MCDA.
// Used by /api/chat + /api/decisions to dispatch to the right orchestrator.
export function isAiLeverageTemplate(candidates: string[]): boolean {
  if (candidates.length === 0) return false;
  return getToolById(candidates[0]!) !== undefined;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function numField(v: unknown): number {
  if (typeof v === "number") return v;
  if (typeof v === "string") {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

function parseBudgetRange(v: unknown): { low: number; high: number } {
  if (Array.isArray(v) && v.length === 2) {
    return { low: numField(v[0]), high: numField(v[1]) };
  }
  if (typeof v === "number") {
    return { low: v, high: v };
  }
  return { low: 0, high: 0 };
}

function areaImpactForTrace(fields: Record<string, unknown>): Record<string, number> {
  return {
    clinical_notes: numField(fields.clinicalNotesHrs),
    patient_comms: numField(fields.patientCommsHrs),
    billing_admin: numField(fields.billingAdminHrs),
    monthly_budget: parseBudgetRange(fields.monthlyToolBudget).high,
  };
}

function specialtyLabel(s: Specialty | null): string {
  if (!s) return "your practice";
  const map: Record<Specialty, string> = {
    psychiatry: "psychiatry",
    therapy: "therapy practice",
    primary_care: "primary care",
    pediatrics: "pediatrics",
    physical_therapy: "physical therapy",
    nutrition: "nutrition / dietetics",
    any: "your practice",
  };
  return map[s];
}

function sanitize(s: string): string {
  return s
    .replace(/\s*\(\s*[0-9]+(?:\.[0-9]+)?\s*\)/g, "")
    .replace(/\bweight(?:ed)?\s+(?:score\s+)?[0-9]+(?:\.[0-9]+)?/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

function safeJson(s: string): Record<string, unknown> {
  try {
    return JSON.parse(s) as Record<string, unknown>;
  } catch {
    const m = s.match(/\{[\s\S]*\}/);
    if (m) try { return JSON.parse(m[0]) as Record<string, unknown>; } catch { /* */ }
    return {};
  }
}
