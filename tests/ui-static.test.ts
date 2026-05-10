import { describe, expect, it } from "vitest";
import { decisionTemplates } from "../components/decision-data";
import { decisionTemplates as engineTemplates } from "../lib/engine/templates";

describe("mobile UI contract", () => {
  it("keeps each adaptive intake at seven fields or fewer", () => {
    for (const template of decisionTemplates) {
      expect(template.fields.length).toBeLessThanOrEqual(7);
    }
  });

  it("uses only structured field controls for v1 intake", () => {
    const fieldTypes = new Set(
      decisionTemplates.flatMap((template) =>
        template.fields.map((field) => field.type),
      ),
    );

    expect(Array.from(fieldTypes).sort()).toEqual(["number", "select"]);
  });

  it("keeps UI field ids aligned with the engine schemas", () => {
    for (const template of decisionTemplates) {
      const sampleFields = Object.fromEntries(
        template.fields.map((field) => [
          field.id,
          field.type === "number" ? field.min : field.options[0]!.value,
        ]),
      );

      expect(engineTemplates[template.id].fieldSchema.safeParse(sampleFields).success).toBe(true);
    }
  });
});
