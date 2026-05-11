// lib/builders/prompt-bridge.ts — U4 server-side prompt builder bridge.
//
// Takes a PromptBuilderSeed (from Stage 8 builderHandoff) and generates a
// clean, copy-pastable prompt template for solo healthcare practitioners.
//
// External plugins (prompt-builder skill) are design references only — this
// is the server-side re-implementation per the architecture decision doc.
//
// Per decision_engine_gated_promotion.md: server constructs seeds; client never.

import "server-only";
import { callStage } from "@/lib/groq";
import type { PromptBuilderSeed, ChecklistBuilderSeed } from "@/lib/engine/types";

// ---------------------------------------------------------------------------
// Output type (matches library_prompts row shape for insert)
// ---------------------------------------------------------------------------

export interface PromptArtifact {
  title: string;
  instructions: string;
  requiredInputs: string[];
  outputFormat: string;
  safetyNotes: string;
  reviewRequirements: string;
}

// ---------------------------------------------------------------------------
// System prompt
// ---------------------------------------------------------------------------

const PROMPT_ENGINEER_SYSTEM = `You are a senior prompt engineer building AI prompts for solo healthcare practitioners. Your job is to write clear, copy-pastable prompt templates — not documentation.

A good prompt template:
- Opens with a ROLE line (e.g. "You are a helpful assistant for a solo medical practice.").
- Uses [PLACEHOLDERS] in ALL_CAPS_BRACKETS for user-supplied inputs (patient context, visit type, etc.).
- Has an explicit output format section: "Respond with: ..." or "Return exactly: ...".
- Ends with a safety fence: "Do not include any patient names, diagnoses, or medical record numbers. Your output will be reviewed by a licensed practitioner before use."
- Is ≤ 250 words in the instruction body.

Return ONLY a JSON object, no prose, no markdown fences:
{
  "title": "<50-word title, action-oriented>",
  "instructions": "<full prompt template — this is what the user pastes into ChatGPT or Claude>",
  "requiredInputs": ["<list of [PLACEHOLDER] names the user must supply>"],
  "outputFormat": "<one paragraph describing exactly what the model should return>",
  "safetyNotes": "<1-2 sentences on what NOT to include — always required for healthcare>",
  "reviewRequirements": "<one sentence on required human review step before the output is used>"
}

NEVER emit a first-person description ("I can help..."). Write as if you are authoring a reusable template, not speaking to the user.`;

// ---------------------------------------------------------------------------
// Checklist-as-prompt fallback system prompt
// ---------------------------------------------------------------------------

const CHECKLIST_SYSTEM = `You are a clinical workflow consultant building step-by-step checklists for solo healthcare practitioners. The checklist will be pasted into a notes app or Google Doc and followed manually.

A good checklist:
- Has a title that names the workflow (e.g. "Pre-appointment patient prep checklist").
- Contains 4-7 numbered steps, each ≤ 15 words.
- Each step includes a brief context note in parentheses if useful.
- Ends with a "Review & sign-off" step.
- No patient names, diagnoses, or MRN numbers anywhere.

Return ONLY a JSON object:
{
  "title": "<workflow title>",
  "instructions": "<the full checklist as a numbered markdown list>",
  "requiredInputs": ["<any placeholders the user fills in each time>"],
  "outputFormat": "A numbered markdown checklist with 4-7 steps",
  "safetyNotes": "Do not pre-fill patient-specific information. Review all clinical decisions with appropriate professional judgment.",
  "reviewRequirements": "Practitioner must verify each completed step before proceeding to the next patient."
}`;

// ---------------------------------------------------------------------------
// LLM generation
// ---------------------------------------------------------------------------

function parsePromptArtifact(answer: string): PromptArtifact | null {
  const cleaned = answer
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/i, "");
  try {
    const parsed = JSON.parse(cleaned);
    if (
      typeof parsed !== "object" ||
      !parsed ||
      typeof parsed.title !== "string" ||
      typeof parsed.instructions !== "string" ||
      typeof parsed.outputFormat !== "string" ||
      typeof parsed.safetyNotes !== "string" ||
      typeof parsed.reviewRequirements !== "string"
    ) {
      return null;
    }
    return {
      title: (parsed.title as string).slice(0, 500),
      instructions: parsed.instructions as string,
      requiredInputs: Array.isArray(parsed.requiredInputs)
        ? (parsed.requiredInputs as unknown[]).map(String)
        : [],
      outputFormat: parsed.outputFormat as string,
      safetyNotes: parsed.safetyNotes as string,
      reviewRequirements: parsed.reviewRequirements as string,
    };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Generate a prompt artifact from a PromptBuilderSeed or ChecklistBuilderSeed.
 * Checklists are represented as a PromptArtifact (stored in library_prompts).
 */
export async function generatePrompt(
  seed: PromptBuilderSeed | ChecklistBuilderSeed,
): Promise<PromptArtifact> {
  const isChecklist = seed.builderKind === "checklist";
  const systemPrompt = isChecklist ? CHECKLIST_SYSTEM : PROMPT_ENGINEER_SYSTEM;

  const userPrompt = JSON.stringify({
    taskTitle: seed.taskTitle,
    taskDescription: seed.taskDescription,
    painPath: seed.painPath,
    scoringRationale: seed.scoringRationale,
    targetAudience: "builderKind" in seed && "targetAudience" in seed
      ? (seed as PromptBuilderSeed).targetAudience
      : "solo healthcare practitioner",
    outputSpec: "builderKind" in seed && "outputSpec" in seed
      ? (seed as PromptBuilderSeed).outputSpec
      : isChecklist ? "step-by-step checklist" : "paste-ready prompt",
  });

  let answer: string;
  try {
    const result = await callStage({
      systemPrompt,
      userPrompt,
      responseSchema: {},
      temperature: 0.2,
    });
    answer = result.answer;
  } catch (err) {
    // Graceful degradation: return a stub artifact so the quality gate
    // can evaluate and return structured diagnostics to the UI.
    console.warn("[prompt-bridge] Groq call failed, returning stub:", err);
    return {
      title: `Prompt for: ${seed.taskTitle}`,
      instructions: `[Builder failed to generate — please write your own prompt for: ${seed.taskTitle}]`,
      requiredInputs: [],
      outputFormat: "Not generated",
      safetyNotes: "Do not include patient names, diagnoses, or medical record numbers.",
      reviewRequirements: "Practitioner review required before clinical use.",
    };
  }

  const parsed = parsePromptArtifact(answer);
  if (!parsed) {
    // Return stub on parse failure.
    return {
      title: `Prompt for: ${seed.taskTitle}`,
      instructions: answer.slice(0, 5000),
      requiredInputs: [],
      outputFormat: "Review and format the output above.",
      safetyNotes: "Do not include patient names, diagnoses, or medical record numbers.",
      reviewRequirements: "Practitioner review required before clinical use.",
    };
  }

  return parsed;
}
