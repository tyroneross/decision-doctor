import { notFound } from "next/navigation";
import { loadTemplate } from "@/lib/engine/templates";
import { IntakeForm } from "@/components/intake/IntakeForm";

type Props = { params: Promise<{ templateId: string }> };

export default async function IntakePage({ params }: Props) {
  const { templateId } = await params;
  let template;
  try {
    template = loadTemplate(templateId as Parameters<typeof loadTemplate>[0]);
  } catch {
    notFound();
  }

  // Public-safe slice — same shape as /api/templates?id=
  const publicTemplate = {
    id: template.id,
    label: template.label,
    description: template.description,
    fields: template.fields,
  };

  return (
    <section className="space-y-6">
      <header>
        <h1 className="text-xl font-semibold">{template.label}</h1>
        <p className="text-sm text-ink-500">{template.description}</p>
      </header>

      <div className="rounded-md border border-ink-100 bg-ink-100/40 p-3 text-xs text-ink-700">
        First-run hint: enter only what you'd write on a sticky note. The form
        accepts short values; long free-text is rejected.
      </div>

      <IntakeForm template={publicTemplate} />
    </section>
  );
}
