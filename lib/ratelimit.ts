// PRD §3 + T-10 — per-user 24h decision rate limit.
//
// In-memory sliding window. Acceptable per PRD §3 because v1 is single-region
// Vercel + low volume; if the function instance recycles, the user gets a
// fresh budget — graceful degradation, not security boundary.
//
// Migrate to Upstash Redis later (the @upstash/ratelimit dep is already
// installed) by wrapping the same surface.

import "server-only";

const WINDOW_MS = 24 * 60 * 60 * 1000;
const CAP = 20;

const buckets = new Map<string, number[]>(); // userId → timestamps[]

function gc(now: number) {
  for (const [k, ts] of buckets) {
    const fresh = ts.filter((t) => now - t < WINDOW_MS);
    if (fresh.length === 0) buckets.delete(k);
    else if (fresh.length !== ts.length) buckets.set(k, fresh);
  }
}

export function checkRateLimit(userId: string): {
  ok: boolean;
  remaining: number;
  resetAt: number;
} {
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
