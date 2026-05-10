import { DecisionInputSchema, type DecisionInput } from "../../../shared/schema";
import type { SessionActor } from "../../../lib/auth";

const PHI_FIELD_NAME_PATTERN =
  /(^|[_\-\s])(?:name|dob|birthdate|mrn|ssn|phone|email|address|diagnosis|diagnoses)($|[_\-\s])|(?:patient|client)[_\-\s]*(?:name|dob|birthdate|mrn|id|phone|email|address)|(?:patient|client)(?:Name|Dob|Birthdate|Mrn|Id|Phone|Email|Address)/;
const PHI_VALUE_PATTERNS = [
  /\b\d{3}-\d{2}-\d{4}\b/,
  /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i,
  /\b(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/,
  /\b(?:MRN|medical record)\s*[:#-]?\s*[A-Z0-9-]{4,}\b/i,
];

export class DecisionValidationError extends Error {
  constructor(readonly details: unknown) {
    super(`Invalid decision input. ${JSON.stringify(details)}`);
  }
}

function hasPhiShapedString(value: string): boolean {
  if (value.length > 80) {
    return true;
  }
  return PHI_VALUE_PATTERNS.some((pattern) => pattern.test(value));
}

function assertNoPhiShapedFields(fields: Record<string, unknown>) {
  for (const [key, value] of Object.entries(fields)) {
    if (PHI_FIELD_NAME_PATTERN.test(key)) {
      throw new DecisionValidationError({
        field: key,
        reason: "PHI-shaped field names are not accepted in v1.",
      });
    }

    if (typeof value === "string" && hasPhiShapedString(value)) {
      throw new DecisionValidationError({
        field: key,
        reason: "PHI-shaped free text is not accepted in v1.",
      });
    }

    if (
      Array.isArray(value) &&
      value.some((item) => typeof item === "string" && hasPhiShapedString(item))
    ) {
      throw new DecisionValidationError({
        field: key,
        reason: "PHI-shaped list values are not accepted in v1.",
      });
    }
  }
}

export function parseDecisionInputForActor(
  body: unknown,
  actor: SessionActor,
): DecisionInput {
  const candidate =
    body && typeof body === "object"
      ? {
          ...(body as Record<string, unknown>),
          context: {
            ...((body as { context?: Record<string, unknown> }).context ?? {}),
            userId: actor.userId,
            tenantId: actor.tenantId,
          },
        }
      : body;

  const fields =
    candidate && typeof candidate === "object"
      ? (candidate as { fields?: unknown }).fields
      : undefined;

  if (!fields || typeof fields !== "object" || Array.isArray(fields)) {
    throw new DecisionValidationError({ fields: "Expected an object." });
  }

  assertNoPhiShapedFields(fields as Record<string, unknown>);

  const parsed = DecisionInputSchema.safeParse(candidate);
  if (!parsed.success) {
    throw new DecisionValidationError(parsed.error.flatten());
  }

  return parsed.data;
}
