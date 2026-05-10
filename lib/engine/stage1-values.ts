import { DecisionInputSchema, type DecisionInput } from "../../shared/schema";
import type { DecisionTemplate, Stage1Values } from "./types";

function prioritySignal(weight: number): "low" | "medium" | "high" {
  if (weight >= 0.28) return "high";
  if (weight >= 0.18) return "medium";
  return "low";
}

export async function runStage1Values(
  input: DecisionInput,
  template: DecisionTemplate,
): Promise<Stage1Values> {
  const parsedInput = DecisionInputSchema.parse(input);
  const fields = template.fieldSchema.parse(parsedInput.fields);

  return {
    input: parsedInput,
    template,
    fields,
    objectives: template.criteria.map((criterion) => {
      const adjustedWeight =
        criterion.baseWeight + (criterion.weightAdjustment?.(fields) ?? 0);

      return {
        criterionId: criterion.id,
        label: criterion.label,
        prioritySignal: prioritySignal(adjustedWeight),
      };
    }),
    fieldSummary: fields,
  };
}
