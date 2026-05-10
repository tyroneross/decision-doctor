// PRD §3 + T-10 — per-user 24h decision rate limit.
//
// Two-mode implementation, env-gated:
//   - When UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN are set
//     (production / preview on Vercel), use @upstash/ratelimit's
//     sliding-window algorithm against Redis. Multi-region-safe; survives
//     Vercel function recycling and concurrent regions.
//   - Otherwise (dev w/o Redis, tests), fall back to the in-memory
//     sliding-window. The same per-process bucket the route used before.
//     Graceful degradation, not a security boundary.
//
// Same contract surface — but `checkRateLimit` is now ASYNC. Route handlers
// must `await` it. Existing callers (chat + decisions) already live inside
// async route handlers, so the signature change is mechanical.

import "server-only";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { env } from "@/lib/env";

// ─── Public contract ────────────────────────────────────────────────────

export interface RateLimitResult {
  ok: boolean;
  remaining: number;
  /** ms-since-epoch when the user's bucket resets. */
  resetAt: number;
}

const WINDOW_MS = 24 * 60 * 60 * 1000;
const CAP = 20;

// ─── In-memory fallback (dev / no Redis) ────────────────────────────────

const buckets = new Map<string, number[]>(); // userId → ms timestamps[]

function gc(now: number) {
  for (const [k, ts] of buckets) {
    const fresh = ts.filter((t) => now - t < WINDOW_MS);
    if (fresh.length === 0) buckets.delete(k);
    else if (fresh.length !== ts.length) buckets.set(k, fresh);
  }
}

function checkInMemory(userId: string): RateLimitResult {
  const now = Date.now();
  if (Math.random() < 0.01) gc(now); // probabilistic cleanup
  const ts = (buckets.get(userId) ?? []).filter((t) => now - t < WINDOW_MS);
  if (ts.length >= CAP) {
    const resetAt = ts[0]! + WINDOW_MS;
    return { ok: false, remaining: 0, resetAt };
  }
  ts.push(now);
  buckets.set(userId, ts);
  return { ok: true, remaining: CAP - ts.length, resetAt: now + WINDOW_MS };
}

// Test-only: reset the in-memory bucket. Imported by tests; ignored in prod
// because we hit the Upstash branch there.
export function __resetInMemoryForTests() {
  buckets.clear();
}

// ─── Upstash branch (lazy singleton) ────────────────────────────────────

let upstashLimiter: Ratelimit | null | undefined;
function getUpstashLimiter(): Ratelimit | null {
  if (upstashLimiter !== undefined) return upstashLimiter;
  const url = env.UPSTASH_REDIS_REST_URL;
  const token = env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    upstashLimiter = null;
    return null;
  }
  const redis = new Redis({ url, token });
  upstashLimiter = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(CAP, "24 h"),
    analytics: false,
    prefix: "dd:rl:user",
  });
  return upstashLimiter;
}

// ─── Public entry ───────────────────────────────────────────────────────

export async function checkRateLimit(userId: string): Promise<RateLimitResult> {
  const limiter = getUpstashLimiter();
  if (!limiter) return checkInMemory(userId);
  try {
    const res = await limiter.limit(userId);
    return {
      ok: res.success,
      remaining: res.remaining,
      // Upstash returns `reset` as ms-since-epoch (the upper window edge).
      resetAt: res.reset,
    };
  } catch (e) {
    // Redis hiccup — degrade gracefully to the in-memory bucket so the
    // request isn't silently denied.
    console.warn(
      "[ratelimit] Upstash unreachable, falling back to in-memory:",
      e instanceof Error ? e.message : String(e),
    );
    return checkInMemory(userId);
  }
}
