import type { DecisionInput, DecisionOutput } from "../../../shared/schema";

export class DecisionEngineUnavailableError extends Error {
  constructor(cause?: unknown) {
    super("Decision engine is unavailable.");
    this.cause = cause;
  }
}

type EngineModule = {
  runDecision?: unknown;
};

export async function loadRunDecision(): Promise<
  (input: DecisionInput) => Promise<DecisionOutput>
> {
  try {
    // Engine implementation is owned by another worker. Keep the API slice
    // type-safe while still binding to the real module when it lands.
    // @ts-ignore see comment above
    const mod = (await import("@/lib/engine/orchestrator")) as EngineModule;
    if (typeof mod.runDecision !== "function") {
      throw new Error("Missing runDecision export.");
    }
    return mod.runDecision as (input: DecisionInput) => Promise<DecisionOutput>;
  } catch (error) {
    throw new DecisionEngineUnavailableError(error);
  }
}
