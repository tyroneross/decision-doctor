// PRD §6.1 + §6.3 — Zod schemas for DecisionInput and DecisionOutput
// Shared between client (form validation) and server (route handler).

import { z } from "zod";

// --- Field value types ---
const FieldValueSchema = z.union([
  z.string().max(200), // bounded — prevents free-form long enough to plausibly contain PHI
  z.number().finite(),
  z.boolean(),
  z.array(z.string().max(80)),
  z.array(z.number().finite()),
]);

// --- Template ID enum (extensible registry in v2) ---
export const TemplateIdSchema = z.enum(["capacity", "pricing", "admin-hire"]);
export type TemplateId = z.infer<typeof TemplateIdSchema>;

// --- DecisionInput (PRD §6.1) ---
export const DecisionSourceSchema = z.object({
  type: z.literal("user_form"), // v2: extend to "voice" | "calendar_api" | "pms_connector"
  sourceId: z.string().optional(),
  capturedAt: z.coerce.date(),
});

export const DecisionContextSchema = z.object({
  userId: z.string().uuid(),
  tenantId: z.string().uuid(),
  previousDecisionIds: z.array(z.string().uuid()).optional(),
});

export const DecisionInputSchema = z.object({
  templateId: TemplateIdSchema,
  source: DecisionSourceSchema,
  fields: z.record(z.string(), FieldValueSchema),
  context: DecisionContextSchema,
});
export type DecisionInput = z.infer<typeof DecisionInputSchema>;

// --- DecisionOutput (PRD §6.3) ---
export const RecommendationSchema = z.object({
  option: z.string(),
  confidence: z.number().min(0).max(100), // OQ-03: derived from TOPSIS top-1/top-2 margin
  rationale: z.string(),
});

export const AlternativeSchema = z.object({
  option: z.string(),
  eliminatedAtStage: z.union([z.literal(2), z.literal(4)]),
  reason: z.string(),
});

export const RobustAlternativeSchema = z.object({
  option: z.string(),
  why: z.string(), // minimax-regret rationale
});

export const MethodTraceEntrySchema = z.object({
  stage: z.union([
    z.literal(1),
    z.literal(2),
    z.literal(3),
    z.literal(4),
    z.literal(5),
  ]),
  name: z.enum([
    "values",
    "constraints",
    "weights",
    "outranking",
    "ranking",
  ]),
  output: z.unknown(), // stage-specific shape; rendered by UI as expandable JSON
});

export const WorkloadReducerSchema = z.object({
  type: z.enum(["prompt", "skill", "plugin", "mcp_tool", "playbook"]),
  title: z.string(),
  description: z.string(),
  artifact: z.object({
    promptText: z.string().optional(),
    skillName: z.string().optional(),
    pluginUrl: z.string().url().optional(),
    mcpServer: z.string().optional(),
    playbookSteps: z.array(z.string()).optional(),
  }),
  automationLevel: z.enum([
    "user_executes",
    "ai_assisted",
    "fully_automated",
  ]),
  coverage: z.enum(["full_task", "partial_task", "task_setup"]),
  permission_tier: z.enum(["T0", "T1", "T2", "T3", "T4", "T5"]),
});

export const DestinationSchema = z.object({
  type: z.enum([
    "user_ui",
    "user_pdf",
    // v2:
    "calendar_event",
    "task_create",
    "drafted_email",
    "marketplace_search",
  ]),
  delivered: z.boolean(),
  deliveredAt: z.coerce.date().optional(),
  artifactUri: z.string().optional(),
  error: z.string().optional(),
});

export const DecisionOutputSchema = z.object({
  decisionId: z.string().uuid(),
  decidedAt: z.coerce.date(),
  recommendation: RecommendationSchema,
  alternatives: z.array(AlternativeSchema).min(2), // T-03: ≥2 alternatives
  robustAlternative: RobustAlternativeSchema,
  methodTrace: z.array(MethodTraceEntrySchema), // T-03: covers Stages 1-5
  workloadReducers: z.array(WorkloadReducerSchema).min(3), // T-03 + A-12: ≥3 per recommendation
  destinations: z.array(DestinationSchema),
});
export type DecisionOutput = z.infer<typeof DecisionOutputSchema>;

// ---------------------------------------------------------------------------
// Chat-first additions (per .build-loop/decisions/2026-05-10-research-digest.md)
// ---------------------------------------------------------------------------

export const ChatMessageSchema = z.object({
  role: z.enum(["user", "assistant", "system"]),
  content: z.string().max(4000),
  // Optional chip choices the assistant offered with this turn — surfaced
  // in the transcript so the user's pick is auditable.
  chips: z
    .array(z.object({ value: z.string(), label: z.string() }))
    .optional(),
  // Optional structured intake-state delta this turn produced (e.g. router
  // committed a mode, or a clarifier extracted a numeric anchor).
  delta: z.record(z.string(), z.unknown()).optional(),
  timestamp: z.coerce.date(),
});
export type ChatMessage = z.infer<typeof ChatMessageSchema>;

export const DecisionModeSchema = z.enum([
  "structured_enumerable",
  "generic_structured",
  "generative_design",
  "values_dominant",
]);
export type DecisionMode = z.infer<typeof DecisionModeSchema>;

// Chat-state stored alongside the decision row so the next turn can pick
// up where the last left off (and so the user can see the conversation in
// their history).
export const ChatTranscriptSchema = z.object({
  messages: z.array(ChatMessageSchema),
  routerOutput: z
    .object({
      mode: DecisionModeSchema,
      confidence: z.number(),
      templateMatch: z.enum(["capacity", "pricing", "admin-hire"]).nullable(),
      rationale: z.string(),
    })
    .optional(),
  // Working intake state — fields the chat has extracted so far. When this
  // matches a template's required fields, we trigger the engine.
  extractedFields: z.record(z.string(), z.unknown()).default({}),
  // What the system still needs before it can run the engine for the chosen mode.
  pendingClarifications: z.array(z.string()).default([]),
});
export type ChatTranscript = z.infer<typeof ChatTranscriptSchema>;

// Output shapes for the two new modes (structured_enumerable + generic_structured
// continue to use DecisionOutputSchema above).
//
// Design brief (generative_design) — no ranking; describes a recommended pilot.
export const DesignBriefSchema = z.object({
  decisionId: z.string().uuid(),
  decidedAt: z.coerce.date(),
  mode: z.literal("generative_design"),
  fundamentalObjective: z.string(), // What success looks like
  constraints: z.array(z.string()), // What can't change
  recommendedPilot: z.string(), // The single first-step recommendation
  implementationSequence: z.array(z.string()).min(3).max(5), // 3-step sequence
  workloadReducers: z.array(WorkloadReducerSchema).min(2), // Tools to deploy first
  measureIn30Days: z.array(z.string()).min(1).max(4), // Metrics to watch
  fallbackIfPilotFails: z.string(), // What to try if this doesn't work
});
export type DesignBrief = z.infer<typeof DesignBriefSchema>;

// Values map (values_dominant) — no recommendation; surfaces what's at stake.
export const ValuesMapSchema = z.object({
  decisionId: z.string().uuid(),
  decidedAt: z.coerce.date(),
  mode: z.literal("values_dominant"),
  fundamentalObjectives: z.array(z.string()).min(1),
  keyTensions: z
    .array(
      z.object({
        between: z.tuple([z.string(), z.string()]),
        explanation: z.string(),
      }),
    )
    .min(1),
  dominantConstructs: z.array(z.string()), // Things the user keeps coming back to
  unresolvedDimensions: z.array(z.string()).min(1), // What still needs answers
  recommendedNextConversations: z.array(z.string()).min(1), // Who/what to talk to next
});
export type ValuesMap = z.infer<typeof ValuesMapSchema>;
