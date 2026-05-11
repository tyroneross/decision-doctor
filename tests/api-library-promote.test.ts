/**
 * tests/api-library-promote.test.ts — U4 promote route unit tests.
 *
 * Tests:
 *   1. Unauthenticated request returns 401.
 *   2. Missing required fields returns 400.
 *   3. Skill kind: valid request → bridge + gate called → 201 with skill.
 *   4. Plugin kind: valid request → bridge + gate called → 201 with plugin.
 *   5. Quality gate failure → 422 with diagnostics.
 *   6. Prompt kind: valid request → 201 (stored as plugin for now per TODO).
 *
 * Mocks: getSessionActor, promoteToSkill, promoteToPlugin, generateSkill,
 *        generatePlugin, generatePrompt, validateArtifact.
 *        runWithActor/withActor for audit — best-effort, swallowed.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mocks (declared before imports so vi.mock hoisting works)
// ---------------------------------------------------------------------------

vi.mock("@/lib/auth-session", () => ({
  getSessionActor: vi.fn(),
}));

vi.mock("@/lib/library", () => ({
  promoteToSkill: vi.fn(),
  promoteToPlugin: vi.fn(),
}));

vi.mock("@/lib/builders/skill-bridge", () => ({
  generateSkill: vi.fn(),
}));

vi.mock("@/lib/builders/agent-bridge", () => ({
  generatePlugin: vi.fn(),
}));

vi.mock("@/lib/builders/prompt-bridge", () => ({
  generatePrompt: vi.fn(),
}));

vi.mock("@/lib/builders/quality-gate", () => ({
  validateArtifact: vi.fn(),
}));

// Audit writes — mock runWithActor/withActor to no-op.
vi.mock("@/lib/db/actor", () => ({
  runWithActor: vi.fn(async (_actor: unknown, fn: () => Promise<unknown>) => fn()),
  withActor: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn({ insert: () => ({ values: () => Promise.resolve() }) })),
}));

vi.mock("@/lib/db/schema", () => ({
  auditEvents: {},
}));

import { getSessionActor } from "@/lib/auth-session";
import { promoteToSkill, promoteToPlugin } from "@/lib/library";
import { generateSkill } from "@/lib/builders/skill-bridge";
import { generatePlugin } from "@/lib/builders/agent-bridge";
import { generatePrompt } from "@/lib/builders/prompt-bridge";
import { validateArtifact } from "@/lib/builders/quality-gate";
import { POST } from "@/app/api/library/promote/route";

const mockGetSessionActor = getSessionActor as ReturnType<typeof vi.fn>;
const mockPromoteToSkill = promoteToSkill as ReturnType<typeof vi.fn>;
const mockPromoteToPlugin = promoteToPlugin as ReturnType<typeof vi.fn>;
const mockGenerateSkill = generateSkill as ReturnType<typeof vi.fn>;
const mockGeneratePlugin = generatePlugin as ReturnType<typeof vi.fn>;
const mockGeneratePrompt = generatePrompt as ReturnType<typeof vi.fn>;
const mockValidateArtifact = validateArtifact as ReturnType<typeof vi.fn>;

const ACTOR = {
  userId: "00000000-0000-0000-0000-000000000001",
  tenantId: "00000000-0000-0000-0000-000000000002",
  email: "test@example.com",
};

const RECOMMENDATION_ID = "a1b2c3d4-e5f6-4789-abcd-ef1234567890";

function makeRequest(body: unknown): Request {
  return new Request("http://localhost/api/library/promote", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("POST /api/library/promote", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when not authenticated", async () => {
    mockGetSessionActor.mockResolvedValue(null);

    const req = makeRequest({});
    const res = await POST(req);
    expect(res.status).toBe(401);
    const body = await res.json() as Record<string, unknown>;
    expect(body.error).toBe("Unauthorized");
  });

  it("returns 400 when required fields are missing", async () => {
    mockGetSessionActor.mockResolvedValue(ACTOR);

    const req = makeRequest({ kind: "skill" }); // missing recommendationId, painPath, payload
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json() as Record<string, unknown>;
    expect(body.error).toBe("bad_request");
  });

  it("returns 201 with skill on valid skill request", async () => {
    mockGetSessionActor.mockResolvedValue(ACTOR);
    mockGenerateSkill.mockResolvedValue({
      name: "draft-emails",
      description: "This skill drafts patient emails.",
      skillMdBody: "---\nname: draft-emails\n---\n\n## Overview\n...",
      frontmatter: "---\nname: draft-emails\n---",
      status: "draft",
    });
    mockValidateArtifact.mockResolvedValue({ passed: true });
    mockPromoteToSkill.mockResolvedValue({
      id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
      title: "draft-emails",
    });

    const req = makeRequest({
      kind: "skill",
      recommendationId: RECOMMENDATION_ID,
      painPath: "follow_up",
      payload: {
        builderKind: "skill",
        taskTitle: "Draft patient follow-up emails",
        taskDescription: null,
        painPath: "follow_up",
        scoringRationale: "High frequency task with structured output.",
        scaffoldTarget: "claude-code-skill",
        permissionTier: "T1",
      },
    });

    const res = await POST(req);
    expect(res.status).toBe(201);
    const body = await res.json() as Record<string, unknown>;
    expect(body.skill).toBeDefined();
    expect(mockGenerateSkill).toHaveBeenCalledOnce();
    expect(mockValidateArtifact).toHaveBeenCalledWith("skill", expect.objectContaining({ name: "draft-emails" }));
    expect(mockPromoteToSkill).toHaveBeenCalledOnce();
  });

  it("returns 201 with plugin on valid plugin request", async () => {
    mockGetSessionActor.mockResolvedValue(ACTOR);
    mockGeneratePlugin.mockResolvedValue({
      name: "followup-plugin",
      description: "This plugin automates follow-up workflows.",
      pluginJson: JSON.stringify({ name: "followup-plugin", description: "...", version: "0.1.0" }),
      componentsManifest: "plugin.json\nCLAUDE.md",
      status: "draft",
    });
    mockValidateArtifact.mockResolvedValue({ passed: true });
    mockPromoteToPlugin.mockResolvedValue({
      id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
      title: "followup-plugin",
    });

    const req = makeRequest({
      kind: "plugin",
      recommendationId: RECOMMENDATION_ID,
      painPath: "follow_up",
      payload: {
        builderKind: "plugin",
        taskTitle: "Automate follow-up scheduling",
        taskDescription: null,
        painPath: "follow_up",
        scoringRationale: "Integration with scheduling system needed.",
        scaffoldTarget: "claude-code-plugin",
        permissionTier: "T2",
      },
    });

    const res = await POST(req);
    expect(res.status).toBe(201);
    const body = await res.json() as Record<string, unknown>;
    expect(body.plugin).toBeDefined();
    expect(mockGeneratePlugin).toHaveBeenCalledOnce();
    expect(mockValidateArtifact).toHaveBeenCalledWith("plugin", expect.anything());
    expect(mockPromoteToPlugin).toHaveBeenCalledOnce();
  });

  it("returns 422 with diagnostics on quality gate failure", async () => {
    mockGetSessionActor.mockResolvedValue(ACTOR);
    mockGenerateSkill.mockResolvedValue({
      name: "bad-skill",
      description: "I can help you do things.", // first-person — should fail gate
      skillMdBody: "Short body without required sections.",
      frontmatter: "---\nname: bad-skill\n---",
      status: "draft",
    });
    mockValidateArtifact.mockResolvedValue({
      passed: false,
      blockers: ["Description must be third-person.", "SKILL.md must include a ## NOT-DO section."],
      warnings: [],
    });

    const req = makeRequest({
      kind: "skill",
      recommendationId: RECOMMENDATION_ID,
      painPath: "admin",
      payload: {
        builderKind: "skill",
        taskTitle: "Test task",
        painPath: "admin",
        scoringRationale: "Test.",
        scaffoldTarget: "claude-code-skill",
        permissionTier: "T1",
      },
    });

    const res = await POST(req);
    expect(res.status).toBe(422);
    const body = await res.json() as Record<string, unknown>;
    expect(body.error).toBe("quality_gate_failed");
    expect(body.diagnostics).toBeDefined();
    const diag = body.diagnostics as { passed: boolean; blockers: string[] };
    expect(diag.passed).toBe(false);
    expect(diag.blockers).toHaveLength(2);
    // Promote should NOT have been called.
    expect(mockPromoteToSkill).not.toHaveBeenCalled();
  });

  it("returns 201 for prompt kind (stored as plugin until promoteToPrompt lands)", async () => {
    mockGetSessionActor.mockResolvedValue(ACTOR);
    mockGeneratePrompt.mockResolvedValue({
      title: "Follow-up email prompt",
      instructions: "You are a helpful assistant.\nDraft a follow-up email for [VISIT_REASON].\nKeep it under 80 words.",
      requiredInputs: ["VISIT_REASON"],
      outputFormat: "A short email suitable for sending to a patient.",
      safetyNotes: "Do not include PHI.",
      reviewRequirements: "Practitioner review required.",
    });
    mockValidateArtifact.mockResolvedValue({ passed: true });
    mockPromoteToPlugin.mockResolvedValue({
      id: "cccccccc-cccc-cccc-cccc-cccccccccccc",
      title: "Follow-up email prompt",
    });

    const req = makeRequest({
      kind: "prompt",
      recommendationId: RECOMMENDATION_ID,
      painPath: "follow_up",
      payload: {
        builderKind: "prompt",
        taskTitle: "Draft patient follow-up emails",
        taskDescription: null,
        painPath: "follow_up",
        scoringRationale: "Drafting task best served by prompt.",
        targetAudience: "solo healthcare practitioner",
        outputSpec: "paste-ready prompt",
        permissionTier: "T0",
      },
    });

    const res = await POST(req);
    expect(res.status).toBe(201);
    const body = await res.json() as Record<string, unknown>;
    expect(body.plugin).toBeDefined();
    expect(mockGeneratePrompt).toHaveBeenCalledOnce();
    expect(mockValidateArtifact).toHaveBeenCalledWith("prompt", expect.anything());
  });
});
