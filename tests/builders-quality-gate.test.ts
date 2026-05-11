/**
 * tests/builders-quality-gate.test.ts — U4 quality gate unit tests.
 *
 * Tests:
 *   1. Skill with first-person description is blocked.
 *   2. Valid skill passes.
 *   3. Skill with body >500 lines is blocked.
 *   4. Skill missing NOT-DO section is blocked.
 *   5. Skill missing Success Criteria is blocked.
 *   6. Plugin with invalid JSON in pluginJson is blocked.
 *   7. Plugin with .claude-plugin/ path in componentsManifest is blocked.
 *   8. Valid plugin passes.
 *   9. Prompt missing outputFormat is blocked.
 *   10. Prompt missing safetyNotes is blocked.
 *   11. Valid prompt passes.
 *   12. PHI in skill body triggers blocker (uses real phi-guard).
 */

import { describe, it, expect } from "vitest";
import { validateArtifact } from "@/lib/builders/quality-gate";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeValidSkill(overrides: Record<string, unknown> = {}) {
  return {
    name: "draft-patient-emails",
    description:
      "This skill assists solo healthcare practitioners with drafting follow-up patient emails after appointments.",
    skillMdBody: `---
name: draft-patient-emails
description: This skill assists solo healthcare practitioners with drafting follow-up patient emails after appointments.
---

## Overview

This skill helps practitioners draft personalized, professional patient follow-up emails.

## Instructions

1. Collect the visit summary (no patient names or MRN).
2. Identify the follow-up action required.
3. Use the provided template to draft the email.
4. Review the draft before sending.
5. Log completion.

## NOT-DO

- Do not include patient names, diagnoses, or MRN numbers in any generated content.
- Do not send email drafts without practitioner review and approval.

## Success Criteria

- Draft is generated without PHI.
- Practitioner can review in under 2 minutes.
`,
    frontmatter: `---\nname: draft-patient-emails\ndescription: This skill assists...\n---`,
    status: "draft",
    ...overrides,
  };
}

function makeValidPlugin(overrides: Record<string, unknown> = {}) {
  return {
    name: "patient-followup-plugin",
    description:
      "This plugin enables solo healthcare practitioners to automate patient follow-up workflows.",
    pluginJson: JSON.stringify({
      name: "patient-followup-plugin",
      description:
        "This plugin enables solo healthcare practitioners to automate patient follow-up workflows.",
      version: "0.1.0",
      skills: [
        {
          name: "draft-emails",
          path: "skills/draft-emails/SKILL.md",
        },
      ],
    }),
    componentsManifest: "plugin.json\nCLAUDE.md\nskills/draft-emails/SKILL.md",
    status: "draft",
    ...overrides,
  };
}

function makeValidPrompt(overrides: Record<string, unknown> = {}) {
  return {
    title: "Draft patient follow-up email",
    instructions: `You are a helpful assistant for a solo medical practice.

Draft a brief, warm follow-up email for a patient I saw today for [VISIT_REASON].
Include a reminder about [NEXT_STEP]. Keep it under 80 words, professional but personable.
Do not include any patient identifiers.`,
    requiredInputs: ["VISIT_REASON", "NEXT_STEP"],
    outputFormat:
      "A short email (≤80 words) suitable for sending to a patient after a visit.",
    safetyNotes:
      "Do not include patient names, diagnoses, or medical record numbers in any prompt input or output.",
    reviewRequirements:
      "Practitioner must review and approve the email draft before sending.",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Skill tests
// ---------------------------------------------------------------------------

describe("validateArtifact — skill", () => {
  it("blocks a skill with first-person description", async () => {
    const result = await validateArtifact(
      "skill",
      makeValidSkill({ description: "I can help you draft patient emails." }),
    );
    expect(result.passed).toBe(false);
    if (!result.passed) {
      expect(
        result.blockers.some((b) => b.toLowerCase().includes("third-person") || b.toLowerCase().includes("first")),
      ).toBe(true);
    }
  });

  it("passes a valid skill artifact", async () => {
    const result = await validateArtifact("skill", makeValidSkill());
    expect(result.passed).toBe(true);
  });

  it("blocks a skill with body over 500 lines", async () => {
    const longBody = Array.from({ length: 510 }, (_, i) => `line ${i + 1}`).join("\n");
    const result = await validateArtifact(
      "skill",
      makeValidSkill({ skillMdBody: longBody }),
    );
    expect(result.passed).toBe(false);
    if (!result.passed) {
      expect(result.blockers.some((b) => b.includes("500"))).toBe(true);
    }
  });

  it("blocks a skill missing NOT-DO section", async () => {
    const bodyWithoutNotDo = `---
name: test-skill
description: This skill tests missing sections.
---

## Overview

Overview content.

## Instructions

1. Step one.
2. Step two.

## Success Criteria

- Criterion one.
`;
    const result = await validateArtifact(
      "skill",
      makeValidSkill({ skillMdBody: bodyWithoutNotDo }),
    );
    expect(result.passed).toBe(false);
    if (!result.passed) {
      expect(result.blockers.some((b) => b.includes("NOT-DO"))).toBe(true);
    }
  });

  it("blocks a skill missing Success Criteria section", async () => {
    const bodyWithoutCriteria = `---
name: test-skill
description: This skill tests missing sections.
---

## Overview

Overview content.

## Instructions

1. Step one.
2. Step two.

## NOT-DO

- Do not do X.
- Do not do Y.
`;
    const result = await validateArtifact(
      "skill",
      makeValidSkill({ skillMdBody: bodyWithoutCriteria }),
    );
    expect(result.passed).toBe(false);
    if (!result.passed) {
      expect(result.blockers.some((b) => b.includes("Success Criteria"))).toBe(true);
    }
  });

  it("blocks a skill with PHI in body (SSN pattern)", async () => {
    const bodyWithPhi = makeValidSkill().skillMdBody + "\n\nPatient SSN: 123-45-6789";
    const result = await validateArtifact(
      "skill",
      makeValidSkill({ skillMdBody: bodyWithPhi as string }),
    );
    expect(result.passed).toBe(false);
    if (!result.passed) {
      expect(result.blockers.some((b) => b.toLowerCase().includes("phi"))).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// Plugin tests
// ---------------------------------------------------------------------------

describe("validateArtifact — plugin", () => {
  it("blocks a plugin with invalid JSON in pluginJson", async () => {
    const result = await validateArtifact(
      "plugin",
      makeValidPlugin({ pluginJson: "not-valid-json" }),
    );
    expect(result.passed).toBe(false);
    if (!result.passed) {
      expect(result.blockers.some((b) => b.includes("valid JSON"))).toBe(true);
    }
  });

  it("blocks a plugin with .claude-plugin/ path in componentsManifest", async () => {
    const result = await validateArtifact(
      "plugin",
      makeValidPlugin({
        componentsManifest:
          "plugin.json\n.claude-plugin/skills/draft-emails/SKILL.md",
      }),
    );
    expect(result.passed).toBe(false);
    if (!result.passed) {
      expect(result.blockers.some((b) => b.includes(".claude-plugin"))).toBe(true);
    }
  });

  it("passes a valid plugin artifact", async () => {
    const result = await validateArtifact("plugin", makeValidPlugin());
    expect(result.passed).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Prompt tests
// ---------------------------------------------------------------------------

describe("validateArtifact — prompt", () => {
  it("blocks a prompt missing outputFormat", async () => {
    const result = await validateArtifact(
      "prompt",
      makeValidPrompt({ outputFormat: "" }),
    );
    expect(result.passed).toBe(false);
    if (!result.passed) {
      expect(result.blockers.some((b) => b.includes("outputFormat"))).toBe(true);
    }
  });

  it("blocks a prompt missing safetyNotes", async () => {
    const result = await validateArtifact(
      "prompt",
      makeValidPrompt({ safetyNotes: "" }),
    );
    expect(result.passed).toBe(false);
    if (!result.passed) {
      expect(result.blockers.some((b) => b.includes("safetyNotes"))).toBe(true);
    }
  });

  it("passes a valid prompt artifact", async () => {
    const result = await validateArtifact("prompt", makeValidPrompt());
    expect(result.passed).toBe(true);
  });
});
