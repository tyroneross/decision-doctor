// PRD §6.1 + §6.3 — Zod schemas for DecisionInput and DecisionOutput
// Shared between client (form validation) and server (route handler).

import { z } from "zod";

const PHI_FIELD_KEY_PATTERN =
  /(patient|client|member|mrn|medical[_-]?record|dob|birth|ssn|social[_-]?security|phone|email|address|street|zip|insurance[_-]?(id|member|number)|subscriber)/i;

const PHI_VALUE_PATTERNS: Array<{ label: string; pattern: RegExp }> = [
  {
    label: "email address",
    pattern: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i,
  },
  {
    label: "phone number",
    pattern: /(?:\+?1[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?)\d{3}[-.\s]?\d{4}\b/,
  },
  {
    label: "social security number",
    pattern: /\b\d{3}-\d{2}-\d{4}\b/,
  },
  {
    label: "date of birth",
    pattern: /\b(?:dob|date of birth|born)\b|(?:\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b)/i,
  },
  {
    label: "medical record number",
    pattern: /\b(?:mrn|medical record|patient id|member id)\s*[:#-]?\s*[A-Z0-9-]{4,}\b/i,
  },
  {
    label: "street address",
    pattern:
      /\b\d{1,6}\s+[A-Za-z0-9.'-]+(?:\s+[A-Za-z0-9.'-]+){0,4}\s+(?:st|street|ave|avenue|rd|road|blvd|boulevard|ln|lane|dr|drive|ct|court|way)\b/i,
  },
  {
    label: "person name",
    pattern: /\b[A-Z][a-z]{2,}\s+[A-Z][a-z]{2,}\b/,
  },
];

export function detectPhiLikeText(value: string): string | null {
  const normalized = value.trim();
  if (!normalized) return "empty text";

  const match = PHI_VALUE_PATTERNS.find(({ pattern }) => pattern.test(normalized));
  return match?.label ?? null;
}

function addPhiIssue(
  ctx: z.RefinementCtx,
  path: Array<string | number>,
  reason: string,
) {
  ctx.addIssue({
    code: "custom",
    path,
    message: `PHI-shaped intake is not accepted in v1: ${reason}`,
  });
}

// --- Field value types ---
const ShortCategoricalTextSchema = z
  .string()
  .min(1)
  .max(120)
  .superRefine((value, ctx) => {
    const reason = detectPhiLikeText(value);
    if (reason) addPhiIssue(ctx, [], reason);
  });

const FieldValueSchema = z.union([
  ShortCategoricalTextSchema, // bounded categorical text only; PHI-shaped strings rejected below
  z.number().finite(),
  z.boolean(),
  z.array(ShortCategoricalTextSchema).max(8),
  z.array(z.number().finite()).max(8),
]);
export type FieldValue = z.infer<typeof FieldValueSchema>;

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
}).superRefine((input, ctx) => {
  Object.entries(input.fields).forEach(([key, value]) => {
    if (PHI_FIELD_KEY_PATTERN.test(key)) {
      addPhiIssue(ctx, ["fields", key], `field name "${key}" can carry patient identifiers`);
    }

    const values = Array.isArray(value) ? value : [value];
    values.forEach((item, index) => {
      if (typeof item !== "string") return;

      const reason = detectPhiLikeText(item);
      if (reason) {
        addPhiIssue(
          ctx,
          Array.isArray(value) ? ["fields", key, index] : ["fields", key],
          reason,
        );
      }
    });
  });
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
