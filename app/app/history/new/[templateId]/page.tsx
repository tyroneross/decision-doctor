import { notFound } from "next/navigation";
import { loadTemplate } from "@/lib/engine/templates";
import { IntakeForm } from "@/components/intake/IntakeForm";
import { Card } from "@/components/ui/Card";

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
  // F-10: also expose criteria so the AHP toggle can render pair labels.
  const publicTemplate = {
    id: template.id,
    label: template.label,
    description: template.description,
    fields: template.fields,
    criteria: template.criteria.map((c) => ({
      id: c.id,
      label: c.label,
      description: c.description,
    })),
  };

  return (
    <section className="space-y-6 px-5 py-8 lg:px-8 lg:py-10 max-w-2xl mx-auto">
      <header className="space-y-1">
        <h1 className="text-[22px] font-semibold leading-tight text-ink">
          {template.label}
        </h1>
        <p className="text-[14px] text-mute leading-relaxed">
          {template.description}
        </p>
      </header>

      <Card flat>
        <p className="text-[12.5px] leading-relaxed text-text">
          <span className="font-semibold text-ink">First-run hint:</span> enter
          only what you'd write on a sticky note. The form accepts short
          values; long free-text is rejected.
        </p>
      </Card>

      <IntakeForm template={publicTemplate} />
    </section>
  );
}
