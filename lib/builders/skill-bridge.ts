// lib/builders/skill-bridge.ts — U4 server-side skill builder bridge.
//
// Generates a SKILL.md body conforming to the Claude Code skill spec:
//   - Third-person description (routing field)
//   - ≤500 lines body
//   - NOT-DO section required
//   - Success criteria defined
//   - Deterministic steps via inline scripts where appropriate
//
// External plugins (skill-builder Claude Code skill) are design references only.
// This is the server-side re-implementation per architecture decision doc.

import "server-only";
import { callStage } from "@/lib/groq";
import type { SkillBuilderSeed } from "@/lib/engine/types";

// ---------------------------------------------------------------------------
// Output type (matches library_skills row shape for insert)
// ---------------------------------------------------------------------------

export interface SkillArtifact {
  name: string;
  description: string;
  skillMdBody: string;
  frontmatter: string;
  status: "draft";
}

// ---------------------------------------------------------------------------
// System prompt
// ---------------------------------------------------------------------------

const SKILL_BUILDER_SYSTEM = `You are a Claude Code skill author building installable skills for solo healthcare practitioners.

A Claude Code skill lives at skills/<skill-name>/SKILL.md.

CRITICAL RULES (violating any causes the quality gate to FAIL):
1. The "name" field: kebab-case, ≤64 chars, never use reserved words "anthropic" or "claude".
2. The "description" field: THIRD PERSON (e.g. "This skill helps practitioners..."), ≤1024 chars, non-empty. NEVER first-person ("I can...").
3. The SKILL.md body: ≤500 lines total (including frontmatter).
4. Include an explicit ## NOT-DO section listing at least 2 things the skill must never do.
5. Include an explicit ## Success Criteria section.
6. References one level deep only (no nested references).

Return ONLY a JSON object, no prose, no markdown fences:
{
  "name": "<kebab-case skill name, ≤64 chars>",
  "description": "<third-person routing description, ≤1024 chars>",
  "frontmatter": "---\\nname: <name>\\ndescription: <description>\\n---",
  "skillMdBody": "<full SKILL.md content including frontmatter, ## Overview, ## Instructions, ## NOT-DO, ## Success Criteria sections — ≤500 lines>"
}

The skillMdBody MUST include all of:
- Frontmatter (---\\nname/description\\n---)
- ## Overview (1 paragraph, third-person)
- ## Instructions (numbered steps, ≤20 steps)
- ## NOT-DO (bullet list of ≥2 prohibitions)
- ## Success Criteria (bullet list of ≥2 measurable outcomes)

Keep total line count ≤500. Use inline bash snippets for deterministic steps.`;

// ---------------------------------------------------------------------------
// Parser
// ---------------------------------------------------------------------------

function parseSkillArtifact(answer: string): SkillArtifact | null {
  const cleaned = answer
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/i, "");
  try {
    const parsed = JSON.parse(cleaned);
    if (
      typeof parsed !== "object" ||
      !parsed ||
      typeof parsed.name !== "string" ||
      typeof parsed.description !== "string" ||
      typeof parsed.skillMdBody !== "string" ||
      typeof parsed.frontmatter !== "string"
    ) {
      return null;
    }
    return {
      name: (parsed.name as string).slice(0, 64),
      description: (parsed.description as string).slice(0, 1024),
      skillMdBody: parsed.skillMdBody as string,
      frontmatter: parsed.frontmatter as string,
      status: "draft",
    };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Stub fallback
// ---------------------------------------------------------------------------

function makeStubSkill(seed: SkillBuilderSeed): SkillArtifact {
  const nameSlug = seed.taskTitle
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 64);

  const description = `This skill assists solo healthcare practitioners with ${seed.taskTitle.toLowerCase()}. Use when the practitioner needs to automate or streamline ${seed.taskTitle.toLowerCase()} tasks in their practice workflow.`;

  const frontmatter = `---\nname: ${nameSlug}\ndescription: ${description}\n---`;

  const body = `${frontmatter}

## Overview

This skill helps solo healthcare practitioners automate ${seed.taskTitle.toLowerCase()} as part of their ${seed.painPath.replace(/_/g, " ")} workflow.

*Note: This is a draft scaffold. Review and customize before installing.*

## Instructions

1. Review the task context: ${seed.taskDescription ?? seed.taskTitle}
2. Identify the specific inputs needed for this task.
3. Run the core logic (see inline script below if applicable).
4. Review the output before sharing with patients or staff.
5. Log completion in your practice management system if required.

\`\`\`bash
# Example: validate input before processing
echo "Processing task: ${seed.taskTitle}"
echo "Pain path: ${seed.painPath}"
\`\`\`

## NOT-DO

- Do not include patient names, diagnoses, or medical record numbers in any output.
- Do not act on clinical decisions without practitioner review and approval.
- Do not store sensitive data in skill output files.

## Success Criteria

- Task completes without exposing PHI in generated output.
- Practitioner can review and approve output in under 2 minutes.
- Skill runs idempotently (safe to re-run with same inputs).`;

  return {
    name: nameSlug,
    description,
    skillMdBody: body,
    frontmatter,
    status: "draft",
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Generate a SKILL.md body from a SkillBuilderSeed.
 * Returns a SkillArtifact with status='draft'.
 * Falls back to a stub if LLM call fails.
 */
export async function generateSkill(seed: SkillBuilderSeed): Promise<SkillArtifact> {
  const userPrompt = JSON.stringify({
    taskTitle: seed.taskTitle,
    taskDescription: seed.taskDescription,
    painPath: seed.painPath,
    scoringRationale: seed.scoringRationale,
    scaffoldTarget: seed.scaffoldTarget,
    targetUser: "solo healthcare practitioner",
  });

  let answer: string;
  try {
    const result = await callStage({
      systemPrompt: SKILL_BUILDER_SYSTEM,
      userPrompt,
      responseSchema: {},
      temperature: 0.15,
    });
    answer = result.answer;
  } catch (err) {
    console.warn("[skill-bridge] Groq call failed, returning stub:", err);
    return makeStubSkill(seed);
  }

  const parsed = parseSkillArtifact(answer);
  if (!parsed) {
    console.warn("[skill-bridge] Failed to parse LLM response, returning stub");
    return makeStubSkill(seed);
  }

  return parsed;
}
