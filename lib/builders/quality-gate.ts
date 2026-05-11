// lib/builders/quality-gate.ts — U4 quality gate for generated artifacts.
//
// Validates emitted artifacts against the AI Plugin Architecture rubric in
// docs/AI Plugin Architecture  Skills, Scripts, Hooks, MCP Servers & Scaffolding.md
//
// QualityGateResult is returned to the caller so failed gates surface
// structured diagnostics to the UI (not a generic 500).
//
// PHI guard: calls detectPHI() from lib/phi-guard.ts (shipped in S1).
// Wrapped in try/catch so this module compiles even if S1 hasn't landed.
//
// TODO: Iteration 2 — add LLM-based plagiarism/hallucination check for
//   skill bodies that reference tools not in the known library.

// ---------------------------------------------------------------------------
// Output type
// ---------------------------------------------------------------------------

export type QualityGateResult =
  | { passed: true }
  | { passed: false; blockers: string[]; warnings: string[] };

// ---------------------------------------------------------------------------
// Reserved words (skill/plugin names must avoid these)
// ---------------------------------------------------------------------------

const RESERVED_WORDS = new Set(["anthropic", "claude"]);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const KEBAB_CASE_RE = /^[a-z][a-z0-9-]*[a-z0-9]$|^[a-z]$/;

function isKebabCase(s: string): boolean {
  return KEBAB_CASE_RE.test(s);
}

function hasReservedWord(name: string): boolean {
  const tokens = name.split("-");
  return tokens.some((t) => RESERVED_WORDS.has(t));
}

/**
 * Count lines in a string (handles \r\n, \r, \n).
 */
function lineCount(s: string): number {
  return s.split(/\r?\n|\r/).length;
}

/**
 * Check if the description is in third person.
 * Flags known first-person openers. Not exhaustive — catches the most common
 * anti-pattern documented in the AI Plugin Architecture doc.
 */
function isFirstPerson(desc: string): boolean {
  return /^(i\s|i'm\s|i can\s|i will\s|i help\s)/i.test(desc.trim());
}

/**
 * PHI detection — wrapped so this module works before S1 lands.
 * Returns false (no PHI detected) if the import fails.
 */
async function checkPHI(
  text: string,
): Promise<{ hasPHI: boolean; reasons: string[] }> {
  try {
    // TODO: Iteration 1 — remove try/catch once S1 is confirmed landed in this branch.
    const { detectPHI } = await import("@/lib/phi-guard");
    return detectPHI(text);
  } catch (err) {
    console.warn(
      "[quality-gate] lib/phi-guard not available (S1 not yet landed). PHI check skipped.",
      err,
    );
    return { hasPHI: false, reasons: [] };
  }
}

// ---------------------------------------------------------------------------
// Skill validation
// ---------------------------------------------------------------------------

async function validateSkillArtifact(
  artifact: Record<string, unknown>,
): Promise<QualityGateResult> {
  const blockers: string[] = [];
  const warnings: string[] = [];

  const name = typeof artifact.name === "string" ? artifact.name : "";
  const description = typeof artifact.description === "string" ? artifact.description : "";
  const body = typeof artifact.skillMdBody === "string" ? artifact.skillMdBody : "";

  // Name: kebab-case, ≤64 chars, no reserved words.
  if (!name) {
    blockers.push("Skill name is required.");
  } else {
    if (name.length > 64) blockers.push(`Skill name exceeds 64 chars (got ${name.length}).`);
    if (!isKebabCase(name)) blockers.push(`Skill name must be kebab-case (got "${name}").`);
    if (hasReservedWord(name))
      blockers.push(`Skill name contains a reserved word ("anthropic" or "claude").`);
  }

  // Description: third-person, ≤1024 chars, non-empty.
  if (!description) {
    blockers.push("Skill description is required.");
  } else {
    if (description.length > 1024)
      blockers.push(`Description exceeds 1024 chars (got ${description.length}).`);
    if (isFirstPerson(description))
      blockers.push(
        `Description must be third-person (starts with "I" — routing will fail).`,
      );
  }

  // Body: ≤500 lines.
  if (!body) {
    blockers.push("skillMdBody is required.");
  } else {
    const lines = lineCount(body);
    if (lines > 500)
      blockers.push(`SKILL.md body exceeds 500 lines (got ${lines}). Split heavy content into referenced files.`);

    // NOT-DO section required.
    if (!/##\s*(NOT.DO|Don.t|Do NOT)/i.test(body))
      blockers.push(`SKILL.md must include an explicit ## NOT-DO section.`);

    // Success criteria required.
    if (!/##\s*Success\s+Criteria/i.test(body))
      blockers.push(`SKILL.md must include a ## Success Criteria section.`);

    // References one level deep check (warn, not block — hard to enforce structurally).
    if ((body.match(/^#+\s+References/gm) ?? []).length > 1)
      warnings.push("Multiple References sections detected — keep references one level deep.");
  }

  // PHI check on body + description.
  const textToCheck = `${description}\n${body}`;
  const phiResult = await checkPHI(textToCheck);
  if (phiResult.hasPHI) {
    blockers.push(
      `PHI detected in skill artifact: ${phiResult.reasons.join(", ")}. Remove before saving.`,
    );
  }

  if (blockers.length > 0) return { passed: false, blockers, warnings };
  return { passed: true };
}

// ---------------------------------------------------------------------------
// Plugin validation
// ---------------------------------------------------------------------------

async function validatePluginArtifact(
  artifact: Record<string, unknown>,
): Promise<QualityGateResult> {
  const blockers: string[] = [];
  const warnings: string[] = [];

  const name = typeof artifact.name === "string" ? artifact.name : "";
  const pluginJson = typeof artifact.pluginJson === "string" ? artifact.pluginJson : "";
  const componentsManifest =
    typeof artifact.componentsManifest === "string" ? artifact.componentsManifest : "";

  // plugin.json: must be valid JSON with "name" field.
  if (!pluginJson) {
    blockers.push("pluginJson is required.");
  } else {
    try {
      const parsed = JSON.parse(pluginJson) as Record<string, unknown>;
      if (typeof parsed.name !== "string" || !parsed.name)
        blockers.push(`plugin.json must have a non-empty "name" field.`);
      else if (!isKebabCase(parsed.name as string))
        blockers.push(`plugin.json "name" must be kebab-case (got "${parsed.name}").`);
      else if (hasReservedWord(parsed.name as string))
        blockers.push(`plugin.json "name" contains a reserved word ("anthropic" or "claude").`);
    } catch {
      blockers.push("pluginJson is not valid JSON.");
    }
  }

  // Top-level name field check.
  if (name && !isKebabCase(name))
    blockers.push(`Plugin name must be kebab-case (got "${name}").`);
  if (name && hasReservedWord(name))
    blockers.push(`Plugin name contains a reserved word ("anthropic" or "claude").`);

  // componentsManifest: paths must NOT reference .claude-plugin/ prefix.
  if (componentsManifest) {
    const lines = componentsManifest.split(/\r?\n|\r/).filter(Boolean);
    const badPaths = lines.filter((l) => l.includes(".claude-plugin/"));
    if (badPaths.length > 0)
      blockers.push(
        `componentsManifest references paths inside ".claude-plugin/" — components must be at plugin root: ${badPaths.join(", ")}`,
      );
  }

  // PHI check.
  const textToCheck = `${pluginJson}\n${componentsManifest}`;
  const phiResult = await checkPHI(textToCheck);
  if (phiResult.hasPHI) {
    blockers.push(
      `PHI detected in plugin artifact: ${phiResult.reasons.join(", ")}. Remove before saving.`,
    );
  }

  if (blockers.length > 0) return { passed: false, blockers, warnings };
  return { passed: true };
}

// ---------------------------------------------------------------------------
// Prompt validation
// ---------------------------------------------------------------------------

async function validatePromptArtifact(
  artifact: Record<string, unknown>,
): Promise<QualityGateResult> {
  const blockers: string[] = [];
  const warnings: string[] = [];

  const instructions = typeof artifact.instructions === "string" ? artifact.instructions : "";
  const outputFormat = typeof artifact.outputFormat === "string" ? artifact.outputFormat : "";
  const safetyNotes = typeof artifact.safetyNotes === "string" ? artifact.safetyNotes : "";

  // instructions: non-empty, ≥3 lines.
  if (!instructions) {
    blockers.push("Prompt instructions are required.");
  } else {
    const lines = instructions.split(/\r?\n|\r/).filter((l) => l.trim().length > 0);
    if (lines.length < 3)
      blockers.push(`Prompt instructions must be at least 3 lines (got ${lines.length}).`);
  }

  // outputFormat: non-empty.
  if (!outputFormat)
    blockers.push("outputFormat is required — describe exactly what the model should return.");

  // safetyNotes: always required for healthcare.
  if (!safetyNotes)
    blockers.push("safetyNotes is required for healthcare prompts — always include PHI handling guidance.");

  // PHI check on instructions + examples.
  const textToCheck = `${instructions}\n${outputFormat}\n${safetyNotes}`;
  const phiResult = await checkPHI(textToCheck);
  if (phiResult.hasPHI) {
    // Only block if PHI appears in instructions (could be in example).
    const instructionPhiResult = await checkPHI(instructions);
    if (instructionPhiResult.hasPHI) {
      blockers.push(
        `PHI detected in prompt instructions: ${instructionPhiResult.reasons.join(", ")}. Remove all patient identifiers from examples.`,
      );
    } else {
      warnings.push(
        `PHI-like patterns detected in prompt artifact (may be in safety notes): ${phiResult.reasons.join(", ")}. Review carefully.`,
      );
    }
  }

  if (blockers.length > 0) return { passed: false, blockers, warnings };
  return { passed: true };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Validate a generated artifact against the AI Plugin Architecture rubric.
 *
 * Returns { passed: true } or { passed: false, blockers, warnings }.
 * Blockers must be resolved before insert. Warnings are advisory.
 *
 * PHI guard: calls detectPHI() from lib/phi-guard (S1). If S1 hasn't
 * landed yet, PHI check no-ops with a console warning and a TODO.
 */
export async function validateArtifact(
  kind: "prompt" | "skill" | "plugin",
  artifact: unknown,
): Promise<QualityGateResult> {
  if (typeof artifact !== "object" || artifact === null) {
    return {
      passed: false,
      blockers: ["Artifact must be a non-null object."],
      warnings: [],
    };
  }

  const a = artifact as Record<string, unknown>;

  switch (kind) {
    case "skill":
      return validateSkillArtifact(a);
    case "plugin":
      return validatePluginArtifact(a);
    case "prompt":
      return validatePromptArtifact(a);
  }
}
