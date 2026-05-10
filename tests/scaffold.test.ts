// T-12 (F-09) — Scaffold generator round-trip.
//
// What this asserts (per PRD §11 T-12):
//   1. For ≥1 reducer scored "skill": emitted SKILL.md parses via gray-matter,
//      frontmatter has required keys (name, description), body is non-empty
//      and ≤ 200 lines.
//   2. AGENTS.md exists, matches the Codex spec cached at
//      docs/decision-science/codex-agents-format.md (same frontmatter shape).
//   3. For ≥1 reducer scored "plugin": plugin.json validates against the Zod
//      schema (PluginJsonSchema) shipped alongside the generator.
//   4. Both Claude Code AND Codex targets are listed.
//   5. Reducers NOT scored skill/plugin (agent / human) get no scaffold.
//   6. Hard cap of ≤6 files per scaffold.
//   7. Determinism: same reducer → same scaffold bytes.

import { describe, expect, it } from "vitest";
import matter from "gray-matter";
import {
  generateScaffold,
  PluginJsonSchema,
} from "@/lib/scaffold-generator";
import type { WorkloadReducer } from "@/shared/schema";

const SKILL_REDUCER: WorkloadReducer = {
  type: "skill",
  title: "Insurance pre-auth letter",
  description:
    "Drafts a calm, plain-language insurance pre-authorization letter from a 4-line clinical summary.",
  artifact: { skillName: "pre-auth-letter" },
  automationLevel: "user_executes",
  coverage: "full_task",
  permission_tier: "T1",
  aiFeasibility: "skill",
  estTimeSavingHrsPerWeek: 2,
};

const PLUGIN_REDUCER: WorkloadReducer = {
  type: "plugin",
  title: "Weekly revenue snapshot",
  description:
    "Emails a Friday snapshot of revenue, fill rate, and no-shows from the prior week.",
  artifact: { skillName: "weekly-revenue-snapshot" },
  automationLevel: "user_executes",
  coverage: "full_task",
  permission_tier: "T2",
  aiFeasibility: "plugin",
  estTimeSavingHrsPerWeek: 1,
};

const AGENT_REDUCER: WorkloadReducer = {
  type: "playbook",
  title: "Sustained intake-to-scheduling-to-reminders agent",
  description:
    "An autonomous agent that monitors new referrals and orchestrates intake → scheduling → reminders.",
  artifact: { playbookSteps: ["Step 1...", "Step 2..."] },
  automationLevel: "ai_assisted",
  coverage: "full_task",
  permission_tier: "T3",
  aiFeasibility: "agent",
};

const HUMAN_REDUCER: WorkloadReducer = {
  type: "playbook",
  title: "Decide whether to sell the practice",
  description: "Practice-sale decision is not AI-owned.",
  artifact: { playbookSteps: ["Talk to spouse", "Talk to your accountant"] },
  automationLevel: "user_executes",
  coverage: "full_task",
  permission_tier: "T0",
  aiFeasibility: "human",
};

describe("F-09 / T-12 — Scaffold generator round-trip", () => {
  it("skill reducer emits a SKILL.md + AGENTS.md bundle", () => {
    const scaffold = generateScaffold(SKILL_REDUCER);
    expect(scaffold).not.toBeNull();
    expect(scaffold!.files.length).toBeGreaterThanOrEqual(2);
    const skillFile = scaffold!.files.find((f) => f.path === "SKILL.md");
    const agentsFile = scaffold!.files.find((f) => f.path === "AGENTS.md");
    expect(skillFile).toBeDefined();
    expect(agentsFile).toBeDefined();
    expect(skillFile!.language).toBe("markdown");
    expect(agentsFile!.language).toBe("markdown");
  });

  it("SKILL.md parses via gray-matter, has required frontmatter, body non-empty and ≤200 lines (T-12)", () => {
    const scaffold = generateScaffold(SKILL_REDUCER);
    const skillFile = scaffold!.files.find((f) => f.path === "SKILL.md")!;
    const parsed = matter(skillFile.content);
    expect(parsed.data.name).toBeTruthy();
    expect(parsed.data.description).toBeTruthy();
    expect(typeof parsed.data.name).toBe("string");
    expect(typeof parsed.data.description).toBe("string");
    expect(parsed.content.trim().length).toBeGreaterThan(0);
    const lines = parsed.content.split("\n").length;
    expect(lines).toBeLessThanOrEqual(200);
  });

  it("AGENTS.md is plain markdown with no frontmatter (Codex spec)", () => {
    const scaffold = generateScaffold(SKILL_REDUCER);
    const agentsFile = scaffold!.files.find((f) => f.path === "AGENTS.md")!;
    // Codex CLI's AGENTS.md is plain markdown — no required frontmatter.
    // Source: github.com/openai/codex codex-rs/core/gpt_5_1_prompt.md.
    // gray-matter on plain markdown returns { data: {}, content: <whole-file> }.
    const parsed = matter(agentsFile.content);
    expect(parsed.data).toEqual({});
    expect(parsed.content).toMatch(/^# /); // starts with an H1 heading
    expect(parsed.content.split("\n").length).toBeLessThanOrEqual(200);
  });

  it("skill reducer claims both claude-code-skill and codex-skill targets", () => {
    const scaffold = generateScaffold(SKILL_REDUCER);
    expect(scaffold!.targets).toContain("claude-code-skill");
    expect(scaffold!.targets).toContain("codex-skill");
  });

  it("plugin reducer emits plugin.json that validates against PluginJsonSchema (T-12)", () => {
    const scaffold = generateScaffold(PLUGIN_REDUCER);
    expect(scaffold).not.toBeNull();
    const pluginFile = scaffold!.files.find((f) => f.path === "plugin.json");
    expect(pluginFile).toBeDefined();
    expect(pluginFile!.language).toBe("json");
    const parsed = JSON.parse(pluginFile!.content);
    const result = PluginJsonSchema.safeParse(parsed);
    expect(result.success).toBe(true);
  });

  it("plugin reducer claims both claude-code-plugin and codex-plugin targets", () => {
    const scaffold = generateScaffold(PLUGIN_REDUCER);
    expect(scaffold!.targets).toContain("claude-code-plugin");
    expect(scaffold!.targets).toContain("codex-plugin");
  });

  it("agent reducer gets no scaffold", () => {
    expect(generateScaffold(AGENT_REDUCER)).toBeNull();
  });

  it("human reducer gets no scaffold", () => {
    expect(generateScaffold(HUMAN_REDUCER)).toBeNull();
  });

  it("hard cap: scaffold never emits more than 6 files", () => {
    const scaffoldSkill = generateScaffold(SKILL_REDUCER);
    const scaffoldPlugin = generateScaffold(PLUGIN_REDUCER);
    expect(scaffoldSkill!.files.length).toBeLessThanOrEqual(6);
    expect(scaffoldPlugin!.files.length).toBeLessThanOrEqual(6);
  });

  it("deterministic: same reducer → same scaffold bytes", () => {
    const a = generateScaffold(SKILL_REDUCER);
    const b = generateScaffold(SKILL_REDUCER);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("slug is lowercase-hyphenated and non-empty", () => {
    const scaffold = generateScaffold(SKILL_REDUCER);
    const fm = matter(
      scaffold!.files.find((f) => f.path === "SKILL.md")!.content,
    ).data;
    expect(fm.name).toMatch(/^[a-z0-9][a-z0-9-]*$/);
  });

  it("emitted plugin.json's commands[] has at least one entry with name+description", () => {
    const scaffold = generateScaffold(PLUGIN_REDUCER);
    const parsed = JSON.parse(
      scaffold!.files.find((f) => f.path === "plugin.json")!.content,
    );
    expect(parsed.commands.length).toBeGreaterThanOrEqual(1);
    expect(parsed.commands[0].name).toBeTruthy();
    expect(parsed.commands[0].description).toBeTruthy();
  });

  it("body contains the reducer description / paste-ready prompt content", () => {
    const scaffold = generateScaffold(SKILL_REDUCER);
    const skillFile = scaffold!.files.find((f) => f.path === "SKILL.md")!;
    // Body should reference the reducer's title or description.
    expect(skillFile.content).toContain(SKILL_REDUCER.title);
  });
});
