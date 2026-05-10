// Template registry. Add new templates here.
import type { DecisionTemplate } from "./types";
import { capacityTemplate } from "./capacity";
import { pricingTemplate } from "./pricing";
import { adminHireTemplate } from "./admin-hire";

const registry: Record<DecisionTemplate["id"], DecisionTemplate> = {
  capacity: capacityTemplate,
  pricing: pricingTemplate,
  "admin-hire": adminHireTemplate,
};

export function loadTemplate(id: DecisionTemplate["id"]): DecisionTemplate {
  const t = registry[id];
  if (!t) throw new Error(`Unknown template: ${id}`);
  return t;
}

export function listTemplates(): DecisionTemplate[] {
  return Object.values(registry);
}

export type { DecisionTemplate, TemplateField } from "./types";
