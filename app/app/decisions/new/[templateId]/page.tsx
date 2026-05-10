import { IntakePage } from "@/components/decision-client";

export default async function NewDecisionPage({
  params,
}: {
  params: Promise<{ templateId: string }>;
}) {
  const { templateId } = await params;
  return <IntakePage templateId={templateId} />;
}
