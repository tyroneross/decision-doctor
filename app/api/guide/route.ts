import {
  DecisionGuideRequestSchema,
  guideDecisionQuestion,
} from "@/lib/decision-guide";

export const runtime = "nodejs";

function jsonError(error: string, status: number, extra = {}) {
  return Response.json({ error, ...extra }, { status });
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const parsed = DecisionGuideRequestSchema.safeParse(body);

  if (!parsed.success) {
    return jsonError("Invalid guide request", 400, {
      details: parsed.error.flatten().fieldErrors,
    });
  }

  return Response.json(guideDecisionQuestion(parsed.data));
}
