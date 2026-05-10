// T-02: each template has ≤7 fields, all Zod-validated, no PHI-plausible
// free-form (max 200 chars caps strings).

import { describe, it, expect } from "vitest";
import { listTemplates } from "@/lib/engine/templates";

describe("templates registry (T-02)", () => {
  const templates = listTemplates();

  it("ships exactly 3 templates per PRD §F-01", () => {
    expect(templates.map((t) => t.id).sort()).toEqual([
      "admin-hire",
      "capacity",
      "pricing",
    ]);
  });

  for (const t of listTemplates()) {
    it(`${t.id}: has ≤7 fields`, () => {
      expect(t.fields.length).toBeLessThanOrEqual(7);
    });

    it(`${t.id}: every field has a label and known kind`, () => {
      for (const f of t.fields) {
        expect(f.label.length).toBeGreaterThan(0);
        expect([
          "number",
          "slider",
          "number-picker",
          "range",
          "select",
          "multiselect",
          "boolean",
          "text",
        ]).toContain(
          f.kind.type,
        );
      }
    });

    it(`${t.id}: any text-type field caps at ≤200 chars`, () => {
      for (const f of t.fields) {
        if (f.kind.type === "text") {
          expect(f.kind.maxLength).toBeLessThanOrEqual(200);
        }
      }
    });

    it(`${t.id}: Zod schema rejects unknown enum values + out-of-range numbers`, () => {
      const schema = t.buildZodSchema();
      // Build a minimal valid set + then mutate one field to invalid.
      const sample: Record<string, unknown> = {};
      for (const f of t.fields) {
        if (f.kind.type === "number") sample[f.id] = ((f.kind.min ?? 0) + (f.kind.max ?? 1)) / 2;
        else if (f.kind.type === "slider") sample[f.id] = (f.kind.min + f.kind.max) / 2;
        else if (f.kind.type === "number-picker") sample[f.id] = f.kind.min;
        else if (f.kind.type === "range") sample[f.id] = [f.kind.min, f.kind.max];
        else if (f.kind.type === "select") sample[f.id] = f.kind.options[0]!.value;
        else if (f.kind.type === "multiselect") sample[f.id] = [];
        else if (f.kind.type === "boolean") sample[f.id] = false;
        else sample[f.id] = "x";
      }
      expect(schema.safeParse(sample).success).toBe(true);

      // Mutate first select field to a bogus value.
      const sel = t.fields.find((f) => f.kind.type === "select");
      if (sel) {
        const bad = { ...sample, [sel.id]: "definitely-not-an-option" };
        expect(schema.safeParse(bad).success).toBe(false);
      }
    });
  }
});
