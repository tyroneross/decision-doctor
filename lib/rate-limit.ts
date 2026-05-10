// PRD §T-10 + BY2 — Per-user Groq rate limit
// Hackathon-grade: in-memory Map<userId, timestamps[]>. Survives a single Node process.
// Production v1.1 swaps to @upstash/ratelimit if UPSTASH_REDIS_REST_URL is set.

import { env } from "@/lib/env";

const WINDOW_MS = 24 * 60 * 60 * 1000;

const buckets = new Map<string, number[]>();

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number; // epoch ms when oldest call drops out of window
  limit: number;
}

/**
 * Returns whether this call is allowed and the remaining quota.
 * Caller MUST check `allowed` before invoking the LLM.
 * On allowed=true, the timestamp is recorded automatically.
 */
export function checkAndConsume(userId: string, now = Date.now()): RateLimitResult {
  const limit = env.GROQ_RATE_LIMIT_PER_DAY;
  const cutoff = now - WINDOW_MS;
  const existing = (buckets.get(userId) ?? []).filter((t) => t > cutoff);

  if (existing.length >= limit) {
    const oldest = existing[0] ?? now;
    return {
      allowed: false,
      remaining: 0,
      resetAt: oldest + WINDOW_MS,
      limit,
    };
  }

  existing.push(now);
  buckets.set(userId, existing);
  return {
    allowed: true,
    remaining: limit - existing.length,
    resetAt: (existing[0] ?? now) + WINDOW_MS,
    limit,
  };
}

/** Inspect current usage without consuming a call (useful for tests + UI). */
export function peek(userId: string, now = Date.now()): RateLimitResult {
  const limit = env.GROQ_RATE_LIMIT_PER_DAY;
  const cutoff = now - WINDOW_MS;
  const existing = (buckets.get(userId) ?? []).filter((t) => t > cutoff);
  return {
    allowed: existing.length < limit,
    remaining: Math.max(0, limit - existing.length),
    resetAt: (existing[0] ?? now) + WINDOW_MS,
    limit,
  };
}

/** Test helper: clear a user's bucket. */
export function reset(userId?: string): void {
  if (userId) buckets.delete(userId);
  else buckets.clear();
}
