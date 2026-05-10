// PRD §F-02 — Intake form per template. Fields rendered from registry.

import { notFound } from "next/navigation";
import { loadTemplate } from "@/lib/engine/templates";
import { IntakeForm } from "@/components/intake/intake-form";

const validIds = ["capacity", "pricing", "admin-hire"] as const;
type TemplateId = typeof validIds[number];

export default async function NewDecisionPage({
  params,
}: {
  params: Promise<{ templateId: string }>;
}) {
  const { templateId } = await params;
  if (!validIds.includes(templateId as TemplateId)) notFound();
  const template = loadTemplate(templateId as TemplateId);
  return (
    <main className="px-4 sm:px-6 py-6 max-w-2xl">
      <div className="text-xs text-ink-muted uppercase tracking-wide">{template.intentVerb}</div>
      <h1 className="mt-1 text-2xl font-semibold">{template.title}</h1>
      <p className="mt-2 text-sm text-ink-subtle">{template.oneLine}</p>
      <IntakeForm
        templateId={template.id}
        fields={template.fields}
        title={template.title}
      />
    </main>
  );
}
