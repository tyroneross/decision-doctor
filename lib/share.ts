// PRD §F-05 / T-05 — HMAC-signed share URLs
// Decisions are publicly viewable via /share/<token> WITHOUT auth.
// Token = base64url(payload).base64url(hmac256(payload)) where payload = decisionId + issuedAt.

import "server-only";
import { createHmac, timingSafeEqual } from "crypto";
import { env } from "@/lib/env";

const SECRET = env.SHARE_URL_SECRET ?? env.BETTER_AUTH_SECRET;

function b64url(buf: Buffer | string): string {
  const b = typeof buf === "string" ? Buffer.from(buf, "utf8") : buf;
  return b.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlDecode(s: string): Buffer {
  const padded = s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4);
  return Buffer.from(padded, "base64");
}

export interface SharePayload {
  decisionId: string;
  issuedAt: number; // epoch ms
}

export function signShareToken(decisionId: string, now = Date.now()): string {
  const payload: SharePayload = { decisionId, issuedAt: now };
  const payloadJson = JSON.stringify(payload);
  const payloadB64 = b64url(payloadJson);
  const sig = createHmac("sha256", SECRET).update(payloadB64).digest();
  const sigB64 = b64url(sig);
  return `${payloadB64}.${sigB64}`;
}

export function verifyShareToken(token: string): SharePayload | null {
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [payloadB64, sigB64] = parts as [string, string];
  const expectedSig = createHmac("sha256", SECRET).update(payloadB64).digest();
  let providedSig: Buffer;
  try {
    providedSig = b64urlDecode(sigB64);
  } catch {
    return null;
  }
  if (providedSig.length !== expectedSig.length) return null;
  if (!timingSafeEqual(providedSig, expectedSig)) return null;
  try {
    const payload = JSON.parse(b64urlDecode(payloadB64).toString("utf8")) as SharePayload;
    if (typeof payload.decisionId !== "string" || typeof payload.issuedAt !== "number") {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}
