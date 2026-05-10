import { DecisionDetailPage } from "@/components/decision-client";

export default async function DecisionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <DecisionDetailPage decisionId={id} />;
}
