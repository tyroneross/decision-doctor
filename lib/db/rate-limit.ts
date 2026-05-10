import { and, count, eq, gte } from "drizzle-orm";
import type { AppDbTransaction, DbActorContext } from "./actor";
import { auditEvents } from "./schema";

export const DECISION_DAILY_LIMIT = 20;
const GROQ_CALL_ACTION = "groq.call";

export class DecisionRateLimitError extends Error {
  constructor(
    readonly limit: number,
    readonly remaining: number,
    readonly resetAt: Date,
  ) {
    super("Daily decision limit reached.");
  }
}

export function startOfUtcDay(date = new Date()): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
}

export function createInMemoryDecisionLimiter(limit = DECISION_DAILY_LIMIT) {
  const buckets = new Map<string, { count: number; resetAt: Date }>();

  return {
    check(userId: string, now = new Date()) {
      const dayStart = startOfUtcDay(now);
      const resetAt = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
      const key = `${userId}:${dayStart.toISOString()}`;
      const bucket = buckets.get(key) ?? { count: 0, resetAt };

      if (bucket.count >= limit) {
        return { allowed: false, remaining: 0, resetAt };
      }

      bucket.count += 1;
      buckets.set(key, bucket);
      return { allowed: true, remaining: limit - bucket.count, resetAt };
    },
    clear() {
      buckets.clear();
    },
  };
}

export async function assertDecisionQuota(
  tx: AppDbTransaction,
  actor: DbActorContext,
  now = new Date(),
): Promise<void> {
  const resetAt = new Date(startOfUtcDay(now).getTime() + 24 * 60 * 60 * 1000);
  const rows = await tx
    .select({ value: count() })
    .from(auditEvents)
    .where(
      and(
        eq(auditEvents.userId, actor.userId),
        eq(auditEvents.action, GROQ_CALL_ACTION),
        gte(auditEvents.createdAt, startOfUtcDay(now)),
      ),
    );

  const used = rows[0]?.value ?? 0;
  if (used >= DECISION_DAILY_LIMIT) {
    throw new DecisionRateLimitError(DECISION_DAILY_LIMIT, 0, resetAt);
  }
}

export async function recordGroqCall(
  tx: AppDbTransaction,
  actor: DbActorContext,
  metadata: Record<string, unknown> = {},
): Promise<void> {
  await tx.insert(auditEvents).values({
    userId: actor.userId,
    tenantId: actor.tenantId,
    action: GROQ_CALL_ACTION,
    metadata,
  });
}
