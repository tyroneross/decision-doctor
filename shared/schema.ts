// PRD §6.1 + §6.3 — Zod schemas for DecisionInput and DecisionOutput
// V2 additive: AdoptionPathwaySchema, AiTaskRecommendationSchema.
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
  // userId + tenantId are Postgres uuids (verified via information_schema 2026-05-10).
  // Server overrides client-supplied values from the session actor regardless.
  userId: z.string().uuid(),
  tenantId: z.string().uuid(),
  previousDecisionIds: z.array(z.string().uuid()).optional(),
});

// F-10 (AHP): optional user-supplied pairwise comparisons of criteria.
// Keyed `${i}:${j}` where i < j and both refer to indices into the template's
// criteria array (in declaration order). Values on Saaty's 1/9 .. 9 scale.
// Empty object or missing → engine takes the default LLM weight-elicitation
// path (Stage 1).
export const AhpComparisonsSchema = z.record(
  z.string().regex(/^\d+:\d+$/),
  z.number().finite().positive(),
);

export const DecisionInputSchema = z.object({
  templateId: TemplateIdSchema,
  source: DecisionSourceSchema,
  fields: z.record(z.string(), FieldValueSchema),
  context: DecisionContextSchema,
  // F-10: optional alternative weight elicitation path.
  weightSource: z.enum(["llm", "ahp"]).optional(),
  ahpComparisons: AhpComparisonsSchema.optional(),
});
export type DecisionInput = z.infer<typeof DecisionInputSchema>;

// --- DecisionOutput (PRD §6.3) ---
export const RecommendationSchema = z.object({
  option: z.string(),
  // F-11: confidence is OMITTED for VDD (values-dominant) outputs.
  // For SED/EDD/TCLD it remains the TOPSIS top-1/top-2 margin (OQ-03).
  confidence: z.number().min(0).max(100).optional(),
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
  // F-10/F-11: stages 0 (PEDE classifier), 1B (AHP weights), 6 (feasibility),
  // 7 (scaffold) are additive. Existing 1-5 unchanged.
  stage: z.union([
    z.literal(0),
    z.literal(1),
    z.literal("1B"),
    z.literal(2),
    z.literal(3),
    z.literal(4),
    z.literal(5),
    z.literal(6),
    z.literal(7),
  ]),
  name: z.enum([
    "classifier",      // Stage 0 (F-11)
    "values",
    "ahp-weights",     // Stage 1B (F-10)
    "constraints",
    "weights",
    "outranking",
    "ranking",
    "feasibility",     // Stage 6 (F-08)
    "scaffold",        // Stage 7 (F-09)
  ]),
  output: z.unknown(), // stage-specific shape; rendered by UI as expandable JSON
});

// F-11 (PEDE classifier — Stage 0). Tuples per docs/research/question-type-coverage-2026-05-10.md
export const EpistemicTypeSchema = z.enum([
  "descriptive",        // Type 1 — out of scope (decline-and-reframe)
  "diagnostic",         // Type 2 — out of scope (decline-and-reframe)
  "predictive",         // Type 3 — out of scope (decline-and-reframe)
  "decision_analysis",  // Type 4 — Decision Doctor's home turf
  "optimization",       // Type 5 — out of scope (decline-and-reframe)
  "sequential",         // Type 6 — partial (v1.1 weekly audit)
]);

export const StructuralTypeSchema = z.enum([
  "SED",   // Structured Enumerable Decision — current pipeline
  "GDD",   // Generative Design Decision
  "VDD",   // Values-Dominant Decision — no ranked output
  "EDD",   // Exploratory Discovery Decision
  "TCLD",  // Time-Critical / Low-Data
]);

export const ModifierFlagSchema = z.enum([
  "HC",    // High consequence / low reversibility
  "SP",    // Sparse preferences
  "GD",    // Group decision
  "MS",    // Multi-session
  "UD",    // Unstructured documents
  "NF",    // No fixed option set
]);

export const DecisionTypeSchema = z.object({
  epistemicType: EpistemicTypeSchema,
  structuralType: StructuralTypeSchema,
  modifiers: z.array(ModifierFlagSchema).default([]),
  rationale: z.string().min(1).max(400),
});
export type DecisionType = z.infer<typeof DecisionTypeSchema>;

// F-08 (AI-feasibility — Stage 6). The 4-tier prescriptive chip.
export const AiFeasibilitySchema = z.enum(["skill", "plugin", "agent", "human"]);
export type AiFeasibility = z.infer<typeof AiFeasibilitySchema>;

// F-09 (Scaffold — Stage 7). Paste-ready artifact.
export const ScaffoldFileSchema = z.object({
  path: z.string().min(1).max(200),
  content: z.string().min(1),
  language: z.enum(["markdown", "json", "yaml", "bash", "typescript"]),
});

export const ScaffoldTargetSchema = z.enum([
  "claude-code-skill",
  "claude-code-plugin",
  "codex-skill",
  "codex-plugin",
]);

export const ScaffoldSchema = z.object({
  targets: z.array(ScaffoldTargetSchema).min(1),
  files: z.array(ScaffoldFileSchema).min(1).max(6), // F-09 hard cap: ≤6 files per scaffold
});
export type Scaffold = z.infer<typeof ScaffoldSchema>;

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
  // F-08 additive fields (all optional for back-compat with existing DB rows)
  aiFeasibility: AiFeasibilitySchema.optional(),
  feasibilityRationale: z.string().min(1).max(280).optional(),
  impactScore: z.number().min(0).max(100).optional(),
  feasibilityScore: z.number().min(0).max(100).optional(),
  combinedScore: z.number().min(0).max(100).optional(),
  // Optional time-saving estimate, surfaced by display layer.
  estTimeSavingHrsPerWeek: z.number().min(0).max(80).optional(),
  // F-09 (only present when aiFeasibility ∈ {"skill", "plugin"})
  scaffold: ScaffoldSchema.optional(),
});
export type WorkloadReducer = z.infer<typeof WorkloadReducerSchema>;

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

// ---------------------------------------------------------------------------
// V2 Pain-path + Adoption-pathway schemas
// ---------------------------------------------------------------------------

export const PainPathIdSchema = z.enum([
  "referrals",
  "research",
  "admin",
  "capacity_growth",
  "follow_up",
  "custom",
]);
export type PainPathId = z.infer<typeof PainPathIdSchema>;

// Builder-handoff seed schemas (server-side; consumed by builder bridges in U4).

const PromptBuilderSeedSchema = z.object({
  builderKind: z.literal("prompt"),
  taskTitle: z.string().min(1).max(200),
  taskDescription: z.string().max(400).nullable(),
  painPath: PainPathIdSchema,
  scoringRationale: z.string().max(400),
  targetAudience: z.string().max(120),
  outputSpec: z.string().max(200),
  permissionTier: z.literal("T0"),
});

const ChecklistBuilderSeedSchema = z.object({
  builderKind: z.literal("checklist"),
  taskTitle: z.string().min(1).max(200),
  taskDescription: z.string().max(400).nullable(),
  painPath: PainPathIdSchema,
  scoringRationale: z.string().max(400),
  stepCountTarget: z.number().int().min(2).max(20),
  format: z.literal("ordered-steps"),
  permissionTier: z.literal("T0"),
});

const SkillBuilderSeedSchema = z.object({
  builderKind: z.literal("skill"),
  taskTitle: z.string().min(1).max(200),
  taskDescription: z.string().max(400).nullable(),
  painPath: PainPathIdSchema,
  scoringRationale: z.string().max(400),
  scaffoldTarget: z.literal("claude-code-skill"),
  permissionTier: z.literal("T1"),
});

const PluginBuilderSeedSchema = z.object({
  builderKind: z.literal("plugin"),
  taskTitle: z.string().min(1).max(200),
  taskDescription: z.string().max(400).nullable(),
  painPath: PainPathIdSchema,
  scoringRationale: z.string().max(400),
  scaffoldTarget: z.literal("claude-code-plugin"),
  permissionTier: z.literal("T2"),
});

const AgentBuilderSeedSchema = z.object({
  builderKind: z.literal("agent"),
  taskTitle: z.string().min(1).max(200),
  taskDescription: z.string().max(400).nullable(),
  painPath: PainPathIdSchema,
  scoringRationale: z.string().max(400),
  scaffoldTarget: z.literal("claude-code-plugin"),
  permissionTier: z.literal("T3"),
});

const BuilderHandoffSeedSchema = z.discriminatedUnion("builderKind", [
  PromptBuilderSeedSchema,
  ChecklistBuilderSeedSchema,
  SkillBuilderSeedSchema,
  PluginBuilderSeedSchema,
  AgentBuilderSeedSchema,
]);

/**
 * One rung in the adoption pathway.
 * The picker (U4 / <AdoptionPathwayPicker>) renders only rungs where
 * state !== "not-recommended".
 */
export const AdoptionPathwayRungSchema = z.object({
  kind: z.enum(["prompt", "checklist", "skill", "plugin", "agent"]),
  /** Short action-oriented label (≤80 chars). */
  label: z.string().min(1).max(80),
  /** One-sentence rationale for this rung's state (≤280 chars). */
  rationale: z.string().min(1).max(280),
  /** 0-100 confidence that this rung fits. */
  confidence: z.number().int().min(0).max(100),
  builderHandoff: z.object({
    /** Server-side typed payload for builder bridges (U4). */
    seed: BuilderHandoffSeedSchema,
  }),
  state: z.enum(["recommended", "optional", "not-recommended"]),
});
export type AdoptionPathwayRung = z.infer<typeof AdoptionPathwayRungSchema>;

/**
 * Full adoption pathway: exactly 5 entries in order:
 * prompt, checklist, skill, plugin, agent.
 * Stage 8 sets this on every run; never null.
 */
export const AdoptionPathwaySchema = z
  .tuple([
    AdoptionPathwayRungSchema,
    AdoptionPathwayRungSchema,
    AdoptionPathwayRungSchema,
    AdoptionPathwayRungSchema,
    AdoptionPathwayRungSchema,
  ])
  .refine(
    (rungs) => rungs.some((r) => r.state === "recommended"),
    { message: "AdoptionPathway must have at least 1 recommended rung" },
  );
export type AdoptionPathway = z.infer<typeof AdoptionPathwaySchema>;

// Candidate task schema.
export const CandidateTaskSchema = z.object({
  id: z.string().min(1).max(64),
  title: z.string().min(1).max(200),
  description: z.string().min(1).max(400),
  painPath: PainPathIdSchema,
  score: z.number().min(0).max(100),
  tags: z.array(z.string().min(1).max(64)).max(10),
});
export type CandidateTask = z.infer<typeof CandidateTaskSchema>;

// Recommendation approach.
export const RecommendationApproachSchema = z.enum([
  "existing_tool",
  "prompt",
  "checklist",
  "sop",
  "skill",
  "plugin",
  "agent",
  "human_only",
]);

// Method trace entry for the V2 recommendation pipeline.
export const RecommendationMethodTraceEntrySchema = z.object({
  stage: z.enum([
    "pain-classify",
    "use-case-retrieval",
    "candidate-gen",
    "scoring",
    "stage8-promotion",
  ]),
  name: z.string().min(1).max(64),
  output: z.unknown(),
});

// ---------------------------------------------------------------------------
// Workflow v2 — ActivityStep + WorkflowRecommendation zod schemas
// ---------------------------------------------------------------------------

const DataSensitivitySchema = z.enum(["low", "pii", "phi"]);
const ValueClassSchema = z.enum(["value-add", "necessary-non-value-add", "waste"]);
const EloundouBetaSchema = z.union([z.literal(0), z.literal(0.5), z.literal(1)]);
const AiRungSchema = z.enum(["none", "prompt", "skill", "plugin", "agent"]);
const StepOriginSchema = z.enum(["existing", "new"]);
const BuilderPermissionTierSchema = z.enum(["T0", "T1", "T2", "T3"]);

export const ActivityStepSchema = z.object({
  id: z.string().min(1).max(32),
  parentId: z.string().nullable(),
  order: z.number().int().min(0),
  title: z.string().min(1).max(200),
  origin: StepOriginSchema,
  inputs: z.array(z.string()),
  outputs: z.array(z.string()),
  currentTool: z.string().nullable(),
  jobRole: z.string().min(1).max(120),
  dataNeeded: z.array(z.object({ source: z.string(), sensitivity: DataSensitivitySchema })),
  integrations: z.array(z.string()),
  valueClass: ValueClassSchema,
  estDurationMins: z.number().positive().nullable(),
  frequencyPerMonth: z.number().positive().nullable(),
  aiSuitability: z.object({
    eloundouBeta: EloundouBetaSchema,
    predictability: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]),
    volume: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]),
    dataAvailability: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]),
    exceptionFrequency: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]),
    compositeScore: z.number().min(0).max(1),
  }),
  aiRung: AiRungSchema,
  aiSuggestion: z.object({
    label: z.string(),
    summary: z.string(),
    artifactSeed: z.string().nullable(),
    permissionTier: BuilderPermissionTierSchema,
    upstreamPlugin: z.object({
      name: z.string(),
      repoUrl: z.string(),
      installCommand: z.string(),
    }).optional(),
  }).nullable(),
  systemImpact: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]),
  userPain: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]),
  lynchpinScore: z.number().min(0).max(1),
  isLynchpin: z.boolean(),
  evolutionNotes: z.string().nullable(),
});
export type ActivityStep = z.infer<typeof ActivityStepSchema>;

export const WorkflowRecommendationSchema = z.object({
  workflowTitle: z.string().min(1).max(200),
  outcome: z.string().min(1).max(400),
  scope: z.object({
    in: z.array(z.string()),
    out: z.array(z.string()),
  }),
  steps: z.array(ActivityStepSchema),
  startHere: z.object({
    stepIds: z.array(z.string()).min(1).max(3),
    rationale: z.string().min(1).max(400),
  }),
  horizon: z.array(z.object({
    label: z.enum(["this week", "this month", "this quarter", "this year"]),
    description: z.string().min(1).max(400),
    upliftedStepIds: z.array(z.string()),
    newStepIds: z.array(z.string()),
  })),
  artifacts: z.array(z.object({
    stepId: z.string(),
    rung: z.enum(["prompt", "skill", "plugin", "agent"]),
    body: z.string(),
  })),
});
export type WorkflowRecommendation = z.infer<typeof WorkflowRecommendationSchema>;

/**
 * AiTaskRecommendation — primary V2 output object.
 * Returned by runRecommendation() and persisted in ai_recommendations.
 */
export const AiTaskRecommendationSchema = z.object({
  selectedPainPath: PainPathIdSchema,
  challengeSummary: z.string().min(1).max(600),
  goal: z.string().min(1).max(400),
  candidateTasks: z.array(CandidateTaskSchema).min(1).max(10),
  recommendedTask: z.string().min(1).max(200),
  recommendedApproach: RecommendationApproachSchema,
  whyThisTask: z.string().min(1).max(600),
  /** @deprecated kept for one release; read from `output.body` when kind === "checklist" */
  starterSolution: z.string().min(1).max(2000),
  guardrails: z.array(z.string().min(1).max(200)).min(1).max(6),
  tryThisWeek: z.array(z.string().min(1).max(200)).min(1).max(5),
  successMetric: z.string().min(1).max(300),
  adoptionPathway: AdoptionPathwaySchema,
  confidence: z.number().min(0).max(100),
  methodTrace: z.array(RecommendationMethodTraceEntrySchema),
  output: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("checklist"), body: z.string() }),
    z.object({ kind: z.literal("workflow"), workflow: WorkflowRecommendationSchema }),
  ]).optional(),
});
export type AiTaskRecommendation = z.infer<typeof AiTaskRecommendationSchema>;

// RecommendationInput schema (for route handlers — E3).
//
// scoringInput is an optional partial slice of ScoringInputSchema. The
// intake flow forwards user-reported values (frequency, time burden, pain
// severity, risk tolerance, AI comfort). dataReadiness is intentionally
// omitted from the intake (no question collects it) and gets a server
// default in the orchestrator. We accept any subset so guests / API
// callers / older clients still work without it.
export const RecommendationInputSchema = z.object({
  painPath: PainPathIdSchema,
  challengeText: z.string().min(1).max(800),
  goal: z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
    z.string().min(1).max(400).optional(),
  ),
  scoringInput: z
    .object({
      painSeverity: z.number().min(0).max(1).optional(),
      frequency: z.number().min(0).max(1).optional(),
      timeBurden: z.number().min(0).max(1).optional(),
      riskTolerance: z.number().min(0).max(1).optional(),
      aiComfort: z.number().min(0).max(1).optional(),
      dataReadiness: z.number().min(0).max(1).optional(),
    })
    .optional(),
  intakeLog: z.unknown().optional(),
  userId: z.string().uuid().optional(),
  tenantId: z.string().uuid().optional(),
});
export type RecommendationInput = z.infer<typeof RecommendationInputSchema>;

// ---------------------------------------------------------------------------
// Adaptive recommendation intake schemas
// ---------------------------------------------------------------------------

const RecommendationIntakeWidgetSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("chips"),
    fieldId: z.string().min(1).max(64),
    label: z.string().min(1).max(120),
    hint: z.string().max(200).optional(),
    options: z
      .array(
        z.object({
          value: z.string().min(1).max(64),
          label: z.string().min(1).max(80),
        }),
      )
      .min(2)
      .max(8),
    defaultValue: z.string().max(64).optional(),
  }),
  z.object({
    kind: z.literal("slider"),
    fieldId: z.string().min(1).max(64),
    label: z.string().min(1).max(120),
    hint: z.string().max(200).optional(),
    min: z.number().finite(),
    max: z.number().finite(),
    step: z.number().positive().finite().optional(),
    defaultValue: z.number().finite(),
    unit: z.string().max(24).optional(),
  }),
]);

export const RecommendationIntakeFillSchema = z.object({
  path: z.string().min(1).max(80),
  kind: z.enum(["string", "number", "pain_path"]),
  mergeStrategy: z.enum(["replace", "append"]).default("replace"),
});
export type RecommendationIntakeFill = z.infer<
  typeof RecommendationIntakeFillSchema
>;

export const RecommendationIntakeBlockingScoreSchema = z.object({
  topic: z.string().min(1).max(80),
  evidenceGap: z.number().min(0).max(5),
  reversibility: z.number().min(0).max(5),
  risk: z.number().min(0).max(5),
  blocking: z.number().min(0).max(15),
  decision: z.enum(["ask", "infer"]),
  reason: z.string().min(1).max(240),
});
export type RecommendationIntakeBlockingScore = z.infer<
  typeof RecommendationIntakeBlockingScoreSchema
>;

export const RecommendationIntakeQuestionSchema = z.object({
  id: z.string().min(1).max(80),
  topic: z.string().min(1).max(80),
  prompt: z.string().min(1).max(240),
  widget: RecommendationIntakeWidgetSchema,
  fills: RecommendationIntakeFillSchema,
  blockingScore: RecommendationIntakeBlockingScoreSchema,
});
export type RecommendationIntakeQuestion = z.infer<
  typeof RecommendationIntakeQuestionSchema
>;

export const RecommendationIntakeAnswerSchema = z.object({
  questionId: z.string().min(1).max(80),
  topic: z.string().min(1).max(80),
  fills: RecommendationIntakeFillSchema,
  display: z.string().min(1).max(240),
  raw: z.union([z.string().max(240), z.number().finite()]),
  answeredAt: z.string().datetime(),
});
export type RecommendationIntakeAnswer = z.infer<
  typeof RecommendationIntakeAnswerSchema
>;

export const RecommendationIntakeAssumptionSchema = z.object({
  topic: z.string().min(1).max(80),
  path: z.string().min(1).max(80),
  value: z.union([z.string().max(400), z.number().finite()]),
  confidence: z.enum(["high", "medium", "low"]),
  rationale: z.string().min(1).max(280),
  challengePrompt: z.string().min(1).max(240),
});
export type RecommendationIntakeAssumption = z.infer<
  typeof RecommendationIntakeAssumptionSchema
>;

export const RecommendationIntakeStateSchema = z.object({
  challengeText: z.string().min(1).max(800),
  painPath: PainPathIdSchema.optional(),
  goal: z.string().min(1).max(400).optional(),
  scoringInput: RecommendationInputSchema.shape.scoringInput.default({}),
  answers: z.array(RecommendationIntakeAnswerSchema).default([]),
  assumptions: z.array(RecommendationIntakeAssumptionSchema).default([]),
  askedTopics: z.array(z.string().min(1).max(80)).default([]),
  filledPaths: z.array(z.string().min(1).max(80)).default([]),
  questionCount: z.number().int().min(0).max(20).default(0),
});
export type RecommendationIntakeState = z.infer<
  typeof RecommendationIntakeStateSchema
>;

export const RecommendationIntakeActionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("ask"),
    state: RecommendationIntakeStateSchema,
    question: RecommendationIntakeQuestionSchema,
    progress: z.object({
      asked: z.number().int().min(0),
      max: z.number().int().min(1),
      remainingHighLeverage: z.number().int().min(0),
    }),
  }),
  z.object({
    action: z.literal("infer"),
    state: RecommendationIntakeStateSchema,
    defaults: z.array(RecommendationIntakeAssumptionSchema).min(1).max(8),
    progress: z.object({
      asked: z.number().int().min(0),
      max: z.number().int().min(1),
      remainingHighLeverage: z.number().int().min(0),
    }),
  }),
  z.object({
    action: z.literal("done"),
    state: RecommendationIntakeStateSchema,
    recommendationInput: RecommendationInputSchema,
    reason: z.string().min(1).max(240),
  }),
]);
export type RecommendationIntakeAction = z.infer<
  typeof RecommendationIntakeActionSchema
>;

// ---------------------------------------------------------------------------
// E2 — Pain-path classifier + 9-criteria scoring schemas
// ---------------------------------------------------------------------------

/**
 * PainPathSchema: alias for the canonical PainPathIdSchema.
 * Exported under the name expected by E2 consumers.
 */
export const PainPathSchema = PainPathIdSchema;
export type PainPath = z.infer<typeof PainPathSchema>;

/** Classification output from classifyPainPath(). */
export const PainPathClassificationSchema = z.object({
  path: PainPathIdSchema,
  /** 0-1 confidence. Values below 0.7 indicate ambiguity. */
  confidence: z.number().min(0).max(1),
  /** Present when confidence < 0.7 — chips asking the user to confirm their path. */
  clarifiers: z
    .array(
      z.object({
        kind: z.literal("chips"),
        fieldId: z.string().min(1).max(64),
        label: z.string().min(1).max(120),
        hint: z.string().max(200).optional(),
        options: z.array(z.object({ value: z.string().min(1).max(64), label: z.string().min(1).max(80) })).min(2).max(8),
        defaultValue: z.string().max(64).optional(),
      }),
    )
    .optional(),
});
export type PainPathClassification = z.infer<typeof PainPathClassificationSchema>;

/** A candidate AI task produced by generateCandidateTasks(). */
export const CandidateTaskExtSchema = z.object({
  id: z.string().min(1).max(64),
  taskName: z.string().min(1).max(80),
  taskDescription: z.string().min(1).max(300),
  aiCapability: z.string().min(1).max(64),
  dataNeeded: z.string().min(1).max(200),
  guardrails: z.string().min(1).max(280),
  startingLevel: z.enum(["prompt", "checklist", "skill", "plugin", "agent"]),
  source: z.enum(["library", "generated"]),
});
export type CandidateTaskExt = z.infer<typeof CandidateTaskExtSchema>;

/** Input to scoreCandidates(). Captures user-reported context. */
export const ScoringInputSchema = z.object({
  painSeverity: z.number().min(0).max(1),
  frequency: z.number().min(0).max(1),
  timeBurden: z.number().min(0).max(1),
  riskTolerance: z.number().min(0).max(1),
  aiComfort: z.number().min(0).max(1),
  dataReadiness: z.number().min(0).max(1),
  weights: z
    .record(
      z.enum([
        "pain_severity", "frequency", "time_burden", "business_impact",
        "ai_fit", "risk", "data_readiness", "adoption_friction", "setup_effort",
      ]),
      z.number().min(0).max(1),
    )
    .optional(),
});
export type ScoringInput = z.infer<typeof ScoringInputSchema>;

const CriterionScoreSchema = z.object({
  raw: z.number().min(0).max(1),
  adjusted: z.number().min(0).max(1),
  rationale: z.string().min(1).max(280),
});

/** A candidate task with 9-criteria scoring and rank. */
export const ScoredCandidateSchema = CandidateTaskExtSchema.extend({
  scores: z.record(
    z.enum([
      "pain_severity", "frequency", "time_burden", "business_impact",
      "ai_fit", "risk", "data_readiness", "adoption_friction", "setup_effort",
    ]),
    CriterionScoreSchema,
  ),
  combinedScore: z.number().min(0).max(1),
  rank: z.number().int().min(1),
});
export type ScoredCandidate = z.infer<typeof ScoredCandidateSchema>;

export const DecisionOutputSchema = z.object({
  decisionId: z.string().uuid(),
  decidedAt: z.coerce.date(),
  recommendation: RecommendationSchema,
  // T-03 requires ≥2 alternatives for SED/Type-4 outputs. F-11's VDD branch
  // ships a values-map only (no ranking), so the floor relaxes to 0 — VDD
  // outputs explicitly carry an empty alternatives array.
  alternatives: z.array(AlternativeSchema),
  robustAlternative: RobustAlternativeSchema,
  methodTrace: z.array(MethodTraceEntrySchema), // T-03: covers Stages 1-5 (+ 0/1B/6/7 additive)
  workloadReducers: z.array(WorkloadReducerSchema).min(3), // T-03 + A-12: ≥3 per recommendation
  destinations: z.array(DestinationSchema),
  // F-11: decision-type tag from PEDE Stage 0 (optional for back-compat).
  decisionType: DecisionTypeSchema.optional(),
  // F-10: which weight-elicitation path was used.
  weightSource: z.enum(["llm", "ahp"]).optional(),
});
export type DecisionOutput = z.infer<typeof DecisionOutputSchema>;
