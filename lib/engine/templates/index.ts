// Template registry. Add a new template by adding a `<id>.ts` file and registering here.
import type { DecisionTemplate } from "@/lib/engine/types";
import { capacityTemplate } from "./capacity";
import { pricingTemplate } from "./pricing";
import { adminHireTemplate } from "./admin-hire";

export const templates: Record<DecisionTemplate["id"], DecisionTemplate> = {
  capacity: capacityTemplate,
  pricing: pricingTemplate,
  "admin-hire": adminHireTemplate,
};

export function loadTemplate(
  id: DecisionTemplate["id"],
): DecisionTemplate {
  const t = templates[id];
  if (!t) throw new Error(`Unknown template: ${id}`);
  return t;
}

export function listTemplates(): Array<
  Pick<DecisionTemplate, "id" | "label" | "description">
> {
  return Object.values(templates).map((t) => ({
    id: t.id,
    label: t.label,
    description: t.description,
  }));
}
