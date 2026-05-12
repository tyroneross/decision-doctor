import "server-only";

import { type NextRequest } from "next/server";
import { getSessionActor } from "@/lib/auth-session";
import { isGuestRequest } from "@/lib/auth-guest";
import { checkRateLimit } from "@/lib/ratelimit";
import { detectPHI } from "@/lib/phi-guard";
import {
  RecommendationIntakeNextInputSchema,
  nextStep,
} from "@/lib/engine/recommendation-intake/controller";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const actor = await getSessionActor();
  const guest = !actor && (await isGuestRequest());
  if (!actor && !guest) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rl = await checkRateLimit(actor ? actor.userId : "guest:shared");
  if (!rl.ok) {
    return Response.json(
      {
        error: "rate_limited",
        message: "Daily recommendation limit reached. Try again tomorrow.",
        resetAt: new Date(rl.resetAt).toISOString(),
      },
      {
        status: 429,
        headers: {
          "Retry-After": String(Math.ceil((rl.resetAt - Date.now()) / 1000)),
        },
      },
    );
  }

  const rawBody = await req.json().catch(() => ({}));
  const parsed = RecommendationIntakeNextInputSchema.safeParse(rawBody);
  if (!parsed.success) {
    return Response.json(
      { error: "Invalid input", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const challenge =
    parsed.data.state?.challengeText ?? parsed.data.challengeText ?? "";
  const phi = detectPHI(challenge);
  if (phi.hasPHI) {
    return Response.json(
      {
        error: "phi_blocked",
        phiBlocked: true,
        reasons: phi.reasons,
        message: "Remove patient-identifiable details before continuing.",
      },
      { status: 400 },
    );
  }

  try {
    return Response.json(await nextStep(parsed.data), { status: 200 });
  } catch (err) {
    console.error("[/api/recommendations/intake/next] failure:", err);
    return Response.json(
      {
        error: "intake_next_failed",
        message: err instanceof Error ? err.message : String(err),
      },
      { status: 502 },
    );
  }
}
