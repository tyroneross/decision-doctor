// Pain-path candidate task generator — E2 implementation.
//
// Produces 3-5 candidate AI tasks for a given pain path + challenge.
//
// Strategy:
//   1. Load the built-in library placeholder tasks for the pain path.
//   2. Call Groq to generate/adapt 3-5 tasks specific to the user's challenge
//      (combining library examples with the stated challenge and goal).
//   3. Always return ≥ 3 candidates (fallback to library stubs on LLM failure).
//
// TODO L2: integrate libraryRetrievalResults from the semantic search pipeline.
//          The `libraryRetrievalResults` parameter is the integration point.
//          When L2 ships, replace the placeholder stubs with real retrieved rows.

import "server-only";
import { callStage } from "@/lib/groq";
import type { PainPathId } from "@/lib/engine/types";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/** A library hit from the semantic search pipeline (L2 wires the real shape). */
export interface LibraryHit {
  id: string;
  title: string;
  body: string;
  painPath: PainPathId;
  aiCapability?: string;
  dataNeeded?: string;
  guardrails?: string;
  startingLevel?: string;
}

/** A candidate AI task for the scoring stage. */
export interface CandidateTask {
  id: string;
  taskName: string;
  taskDescription: string;
  aiCapability: string;
  dataNeeded: string;
  guardrails: string;
  startingLevel: "prompt" | "checklist" | "skill" | "plugin" | "agent";
  /** Origin tag — 'library' for retrieved, 'generated' for LLM-created. */
  source: "library" | "generated";
}

// ---------------------------------------------------------------------------
// Library placeholder stubs (P0 — pre-L2)
// ---------------------------------------------------------------------------

// These are curated fallback tasks per path. L2 will replace/augment this
// with real database retrieval results from lib/library/.

const LIBRARY_STUBS: Record<PainPathId, CandidateTask[]> = {
  referrals: [
    {
      id: "referrals-draft-outreach",
      taskName: "Draft referral outreach messages",
      taskDescription:
        "Use an AI prompt to draft personalized outreach messages to specialist contacts or potential referral sources.",
      aiCapability: "drafting",
      dataNeeded: "Contact names, specialty, prior relationship notes (no PHI).",
      guardrails: "Do not include patient names or clinical details. Review before sending.",
      startingLevel: "prompt",
      source: "library",
    },
    {
      id: "referrals-prioritize-sources",
      taskName: "Prioritize referral sources",
      taskDescription:
        "Use a structured checklist to track, score, and prioritize referral sources by volume, recency, and specialty fit.",
      aiCapability: "classification",
      dataNeeded: "List of referral sources and approximate volumes.",
      guardrails: "Business data only — no patient-level PHI in tracking.",
      startingLevel: "checklist",
      source: "library",
    },
    {
      id: "referrals-follow-up-cadence",
      taskName: "Automate referral follow-up cadence",
      taskDescription:
        "Create a follow-up reminder system for maintaining contact with active and lapsed referral sources.",
      aiCapability: "scheduling",
      dataNeeded: "Contact list and last-contact dates.",
      guardrails: "No clinical content in outreach. Avoid making clinical claims.",
      startingLevel: "checklist",
      source: "library",
    },
  ],
  research: [
    {
      id: "research-weekly-digest",
      taskName: "Build a weekly research digest",
      taskDescription:
        "Use an AI prompt to summarize and rank recent journal articles or clinical guidelines by specialty relevance.",
      aiCapability: "summarization",
      dataNeeded: "Article titles and abstracts (publicly available).",
      guardrails: "Flag any AI interpretation of clinical evidence as requiring expert review.",
      startingLevel: "prompt",
      source: "library",
    },
    {
      id: "research-evidence-caveats",
      taskName: "Surface evidence caveats and limitations",
      taskDescription:
        "Use an AI prompt to identify study limitations, population mismatches, and applicability caveats for a given article.",
      aiCapability: "extraction",
      dataNeeded: "Study abstract or methods section text.",
      guardrails: "AI cannot replace clinical judgment. All interpretations require clinician review.",
      startingLevel: "prompt",
      source: "library",
    },
    {
      id: "research-review-queue",
      taskName: "Create a reading review queue",
      taskDescription:
        "Maintain a structured reading checklist that scores and schedules articles by clinical relevance and review deadline.",
      aiCapability: "classification",
      dataNeeded: "Article list with dates and topics.",
      guardrails: "No patient data used. Relevance scoring is advisory only.",
      startingLevel: "checklist",
      source: "library",
    },
  ],
  admin: [
    {
      id: "admin-inbox-triage",
      taskName: "Triage inbox with AI-drafted responses",
      taskDescription:
        "Use a paste-ready AI prompt to categorize and draft responses to common administrative messages.",
      aiCapability: "drafting",
      dataNeeded: "Sample message categories — no PHI.",
      guardrails: "Remove patient names, diagnoses, and any clinical content before using the prompt.",
      startingLevel: "prompt",
      source: "library",
    },
    {
      id: "admin-documentation-templates",
      taskName: "Create documentation templates",
      taskDescription:
        "Use AI to draft reusable templates for prior auth requests, referral letters, and administrative forms.",
      aiCapability: "drafting",
      dataNeeded: "Payer name, service category, typical justification language (no PHI).",
      guardrails: "Templates are drafts. Clinician completes patient-specific fields and reviews before submission.",
      startingLevel: "prompt",
      source: "library",
    },
    {
      id: "admin-workflow-sop",
      taskName: "Document administrative SOPs",
      taskDescription:
        "Use AI to produce a structured standard operating procedure for a recurring admin task.",
      aiCapability: "structuring",
      dataNeeded: "Step-by-step description of current process.",
      guardrails: "No PHI in SOP. Mark any clinical decision steps as requiring practitioner review.",
      startingLevel: "checklist",
      source: "library",
    },
  ],
  capacity_growth: [
    {
      id: "capacity-schedule-analysis",
      taskName: "Analyze schedule for capacity gaps",
      taskDescription:
        "Use a structured AI prompt to identify underutilized appointment slots and model scenarios for adding visit types.",
      aiCapability: "analysis",
      dataNeeded: "Anonymized schedule data: days, appointment types, fill rates (no patient names).",
      guardrails: "Projections are estimates only. No financial commitments without expert review.",
      startingLevel: "prompt",
      source: "library",
    },
    {
      id: "capacity-pricing-support",
      taskName: "Get pricing decision support",
      taskDescription:
        "Use an AI prompt to structure a pricing analysis comparing your fees, overhead, and market rates.",
      aiCapability: "analysis",
      dataNeeded: "Current fee schedule, overhead estimates, market rate references.",
      guardrails: "Output is informational. Pricing changes require professional accounting/legal review.",
      startingLevel: "prompt",
      source: "library",
    },
    {
      id: "capacity-growth-planning",
      taskName: "Draft a growth action plan",
      taskDescription:
        "Use AI to outline a structured action plan for growing capacity: service additions, outreach, or operational changes.",
      aiCapability: "planning",
      dataNeeded: "Current capacity metrics, growth goal, available resources.",
      guardrails: "Plans are advisory. Financial and legal implications need professional review.",
      startingLevel: "checklist",
      source: "library",
    },
  ],
  follow_up: [
    {
      id: "follow-up-email-drafts",
      taskName: "Draft patient follow-up emails",
      taskDescription:
        "Use a paste-ready AI prompt to draft personalized post-visit follow-up emails.",
      aiCapability: "drafting",
      dataNeeded: "Visit type and general next steps — no PHI in the prompt.",
      guardrails: "Remove all patient identifiers. Clinician reviews before sending.",
      startingLevel: "prompt",
      source: "library",
    },
    {
      id: "follow-up-reminder-checklist",
      taskName: "Build a follow-up reminder checklist",
      taskDescription:
        "Create a structured checklist categorizing patients by follow-up type, urgency, and due date.",
      aiCapability: "classification",
      dataNeeded: "Aggregate follow-up categories — patient names stay in EHR, not in AI tools.",
      guardrails: "No PHI in the checklist template. Patient-specific data stays in EHR.",
      startingLevel: "checklist",
      source: "library",
    },
    {
      id: "follow-up-unresolved-tracking",
      taskName: "Track unresolved patient tasks",
      taskDescription:
        "Use a structured tracking template to flag and prioritize unresolved care actions and callbacks.",
      aiCapability: "monitoring",
      dataNeeded: "Aggregate task categories — patient-specific data in EHR only.",
      guardrails: "No PHI in the tracker. Clinical escalations require practitioner judgment.",
      startingLevel: "checklist",
      source: "library",
    },
  ],
  custom: [
    {
      id: "custom-challenge-mapping",
      taskName: "Map your challenge to candidate AI tasks",
      taskDescription:
        "Use an AI prompt to break your specific challenge into discrete sub-tasks and identify where AI can help.",
      aiCapability: "analysis",
      dataNeeded: "Plain-language description of your challenge and current workaround.",
      guardrails: "No PHI in prompts. All AI suggestions are advisory and need practitioner review.",
      startingLevel: "prompt",
      source: "library",
    },
    {
      id: "custom-workflow-documentation",
      taskName: "Document your current workflow",
      taskDescription:
        "Use AI to structure and document your current process so you can identify bottlenecks and automation opportunities.",
      aiCapability: "structuring",
      dataNeeded: "Step-by-step description of the current workflow.",
      guardrails: "No patient data in workflow descriptions.",
      startingLevel: "prompt",
      source: "library",
    },
    {
      id: "custom-starter-prompt",
      taskName: "Build a starter AI prompt for your task",
      taskDescription:
        "Craft a reusable prompt that addresses your specific challenge and can be tested in ChatGPT or Claude today.",
      aiCapability: "drafting",
      dataNeeded: "Description of the task and the outcome you want.",
      guardrails: "No PHI in prompts. Test on synthetic examples before using with real tasks.",
      startingLevel: "prompt",
      source: "library",
    },
  ],
};

// ---------------------------------------------------------------------------
// LLM candidate generation
// ---------------------------------------------------------------------------

const CANDIDATE_GEN_SYSTEM_PROMPT = `You are the candidate task generator for Aida, an AI assistant helping solo healthcare practitioners spend less time on admin and more time on patients.

Given a pain path, challenge description, and goal, generate 3-5 specific candidate AI tasks the practitioner could try.

Each candidate task should be:
- Concrete and actionable (the practitioner knows exactly what to do).
- Matched to AI capabilities: drafting, summarization, classification, extraction, analysis, structuring, monitoring, scheduling, or planning.
- Healthcare-safe: no PHI in prompts, outputs require clinician review for clinical content.
- Achievable by a solo practitioner without staff, EHR vendor contracts, or significant capital.

OUTPUT (JSON object only — no prose, no fences):
{
  "tasks": [
    {
      "id": "<slug, lowercase-hyphenated, unique>",
      "taskName": "<≤80 char task name>",
      "taskDescription": "<1-2 sentence description of what the task involves>",
      "aiCapability": "<one of: drafting | summarization | classification | extraction | analysis | structuring | monitoring | scheduling | planning>",
      "dataNeeded": "<what safe, non-PHI data is needed>",
      "guardrails": "<1-2 sentence safety or review note>",
      "startingLevel": "<one of: prompt | checklist | skill | plugin | agent>"
    }
  ]
}

Rules:
- Return 3-5 tasks. More is better only if genuinely distinct.
- First task should be the most immediately actionable (lowest friction).
- startingLevel must be one of: prompt, checklist, skill, plugin, agent.
- JSON only. No commentary.`;

interface LlmCandidateTask {
  id?: unknown;
  taskName?: unknown;
  taskDescription?: unknown;
  aiCapability?: unknown;
  dataNeeded?: unknown;
  guardrails?: unknown;
  startingLevel?: unknown;
}

const VALID_STARTING_LEVELS = new Set(["prompt", "checklist", "skill", "plugin", "agent"]);

function isValidStartingLevel(v: unknown): v is CandidateTask["startingLevel"] {
  return typeof v === "string" && VALID_STARTING_LEVELS.has(v);
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 64);
}

function normalizeLlmTask(
  t: LlmCandidateTask,
  idx: number,
  painPath: PainPathId,
): CandidateTask | null {
  if (typeof t.taskName !== "string" || typeof t.taskDescription !== "string") return null;
  return {
    id: typeof t.id === "string" && t.id.length > 0
      ? t.id.slice(0, 64)
      : slugify(`${painPath}-${t.taskName}-${idx}`),
    taskName: t.taskName.slice(0, 80),
    taskDescription: t.taskDescription.slice(0, 300),
    aiCapability: typeof t.aiCapability === "string" ? t.aiCapability.slice(0, 64) : "drafting",
    dataNeeded: typeof t.dataNeeded === "string" ? t.dataNeeded.slice(0, 200) : "Relevant non-PHI context.",
    guardrails: typeof t.guardrails === "string" ? t.guardrails.slice(0, 280) : "No PHI in prompts. Review AI output before use.",
    startingLevel: isValidStartingLevel(t.startingLevel) ? t.startingLevel : "prompt",
    source: "generated",
  };
}

async function generateWithLlm(
  painPath: PainPathId,
  challenge: string,
  goal: string,
  libraryExamples: CandidateTask[],
): Promise<CandidateTask[]> {
  const userPrompt = JSON.stringify({
    painPath,
    challenge,
    goal,
    libraryExamples: libraryExamples.slice(0, 3).map((e) => ({
      taskName: e.taskName,
      taskDescription: e.taskDescription,
      startingLevel: e.startingLevel,
    })),
  });

  let answer: string;
  try {
    const result = await callStage({
      systemPrompt: CANDIDATE_GEN_SYSTEM_PROMPT,
      userPrompt,
      responseSchema: {},
      temperature: 0.35,
    });
    answer = result.answer;
  } catch {
    return [];
  }

  const parsed = parseJson(answer);
  if (!parsed || !Array.isArray(parsed.tasks)) return [];

  const tasks: CandidateTask[] = [];
  for (let i = 0; i < (parsed.tasks as unknown[]).length && tasks.length < 5; i++) {
    const raw = (parsed.tasks as unknown[])[i];
    if (typeof raw !== "object" || raw === null) continue;
    const normalized = normalizeLlmTask(raw as LlmCandidateTask, i, painPath);
    if (normalized) tasks.push(normalized);
  }

  return tasks;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Generate 3-5 candidate AI tasks for a given pain path and challenge.
 *
 * Flow:
 *   1. Load built-in library stubs for the path (P0 placeholder).
 *      TODO L2: integrate libraryRetrievalResults from semantic search.
 *   2. Call Groq to generate tailored tasks combining library context + challenge.
 *   3. Merge: LLM-generated tasks first, library stubs as fill if fewer than 3.
 *   4. Guarantee ≥ 3 candidates always.
 */
export async function generateCandidateTasks(input: {
  painPath: PainPathId;
  challenge: string;
  goal: string;
  // TODO L2: integrate libraryRetrievalResults — replace placeholder stubs
  libraryRetrievalResults?: LibraryHit[];
}): Promise<CandidateTask[]> {
  const { painPath, challenge, goal } = input;

  // Library placeholder stubs for this path.
  const libraryStubs = LIBRARY_STUBS[painPath] ?? LIBRARY_STUBS.custom;

  // LLM-generated tasks.
  const generated = await generateWithLlm(painPath, challenge, goal, libraryStubs);

  // Merge: LLM tasks first; fill from library stubs if needed.
  const merged: CandidateTask[] = [...generated];

  // Deduplicate by id (LLM may echo library stubs with the same id).
  const seenIds = new Set(merged.map((t) => t.id));
  for (const stub of libraryStubs) {
    if (merged.length >= 5) break;
    if (!seenIds.has(stub.id)) {
      merged.push(stub);
      seenIds.add(stub.id);
    }
  }

  // Guarantee ≥ 3.
  if (merged.length < 3) {
    // Pad with any remaining stubs regardless of dedup.
    for (const stub of libraryStubs) {
      if (merged.length >= 3) break;
      if (!merged.find((t) => t.id === stub.id)) {
        merged.push(stub);
      }
    }
  }

  return merged.slice(0, 5);
}

// ---------------------------------------------------------------------------
// Utility
// ---------------------------------------------------------------------------

function parseJson(text: string): Record<string, unknown> | null {
  if (!text) return null;
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/i, "");
  try {
    const parsed = JSON.parse(cleaned);
    return typeof parsed === "object" && parsed !== null
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]);
    } catch {
      return null;
    }
  }
}
