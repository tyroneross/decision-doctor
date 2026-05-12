import "server-only";

import { type NextRequest } from "next/server";
import { getSessionActor } from "@/lib/auth-session";
import { isGuestRequest } from "@/lib/auth-guest";
import { detectPHI } from "@/lib/phi-guard";
import {
  RecommendationIntakeAnswerInputSchema,
  ingestAnswer,
} from "@/lib/engine/recommendation-intake/controller";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const actor = await getSessionActor();
  const guest = !actor && (await isGuestRequest());
  if (!actor && !guest) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rawBody = await req.json().catch(() => ({}));
  const parsed = RecommendationIntakeAnswerInputSchema.safeParse(rawBody);
  if (!parsed.success) {
    return Response.json(
      { error: "Invalid input", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const phi = detectPHI(parsed.data.display);
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

  return Response.json({ state: ingestAnswer(parsed.data) }, { status: 200 });
}
