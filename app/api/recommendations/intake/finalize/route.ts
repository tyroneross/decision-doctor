import "server-only";

import { type NextRequest } from "next/server";
import { getSessionActor } from "@/lib/auth-session";
import { isGuestRequest } from "@/lib/auth-guest";
import { detectPHI } from "@/lib/phi-guard";
import { RecommendationIntakeStateSchema } from "@/shared/schema";
import { finalize } from "@/lib/engine/recommendation-intake/controller";
import { POST as createRecommendation } from "../../route";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const actor = await getSessionActor();
  const guest = !actor && (await isGuestRequest());
  if (!actor && !guest) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rawBody = await req.json().catch(() => ({}));
  const parsed = RecommendationIntakeStateSchema.safeParse(rawBody.state);
  if (!parsed.success) {
    return Response.json(
      { error: "Invalid input", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const phi = detectPHI(parsed.data.challengeText);
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

  const recommendationInput = {
    ...finalize({ state: parsed.data }),
    intakeLog: {
      answers: parsed.data.answers,
      assumptions: parsed.data.assumptions,
      questionCount: parsed.data.questionCount,
    },
  };

  const delegatedRequest = new Request(req.url.replace("/intake/finalize", ""), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(recommendationInput),
  });

  return createRecommendation(delegatedRequest as NextRequest);
}
