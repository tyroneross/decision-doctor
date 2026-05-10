import { adminHireTemplate } from "./admin-hire";
import { capacityTemplate } from "./capacity";
import { pricingTemplate } from "./pricing";
import type { DecisionTemplate } from "../types";
import type { TemplateId } from "../../../shared/schema";

export const decisionTemplates = {
  capacity: capacityTemplate,
  pricing: pricingTemplate,
  "admin-hire": adminHireTemplate,
} satisfies Record<TemplateId, DecisionTemplate>;

export function loadTemplate(templateId: TemplateId): DecisionTemplate {
  return decisionTemplates[templateId];
}

export type { DecisionTemplate };
