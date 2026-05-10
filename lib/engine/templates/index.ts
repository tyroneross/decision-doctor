// Template registry — v2 (AI-leverage finder).
//
// The single canonical user-facing template is `aiLeverageTemplate`. The v1
// trio (capacity / pricing / admin-hire) is preserved for backward-compat —
// existing decision rows still load — but `listTemplates()` returns ONLY the
// AI-leverage template so the UI surfaces the new product.
//
// To re-expose v1 templates (e.g. for power-user fast-paths), uncomment them
// in `listTemplates()`. They remain importable individually for tests.

import type { DecisionTemplate } from "./types";
import { capacityTemplate } from "./capacity";
import { pricingTemplate } from "./pricing";
import { adminHireTemplate } from "./admin-hire";
import { aiLeverageTemplate } from "./ai-leverage";

// Internal registry for `loadTemplate(id)` — must include all template ids
// any decision row in the DB might reference. The `capacity` slot is
// overridden by `aiLeverageTemplate` (same id) so the engine reads the
// new template definition for any existing capacity row going forward.
// Old rows persist their snapshotted intake; the v2 schema doesn't require
// them to re-run.
const registry: Record<DecisionTemplate["id"], DecisionTemplate> = {
  capacity: aiLeverageTemplate,        // v2 default — was capacityTemplate in v1
  pricing: pricingTemplate,            // v1 — still loadable for legacy rows
  "admin-hire": adminHireTemplate,     // v1 — still loadable for legacy rows
};

// Keep the v1 templates importable but de-listed.
export const v1Templates = {
  capacity: capacityTemplate,
  pricing: pricingTemplate,
  "admin-hire": adminHireTemplate,
};

export function loadTemplate(id: DecisionTemplate["id"]): DecisionTemplate {
  const t = registry[id];
  if (!t) throw new Error(`Unknown template: ${id}`);
  return t;
}

// Surface only the AI-leverage template by default. The chat router still
// recognizes capacity/pricing/admin-hire patterns and routes them all to the
// same AI-leverage template (since `id: "capacity"` now maps to the new
// definition).
export function listTemplates(): DecisionTemplate[] {
  return [registry.capacity];
}

export type { DecisionTemplate, TemplateField } from "./types";
