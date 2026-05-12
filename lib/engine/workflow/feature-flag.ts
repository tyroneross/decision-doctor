/**
 * Engine mode selector.
 *
 * Default: "v1" (existing checklist pipeline). When the env var
 * DD_ENGINE_MODE === "v2-workflow" the engine routes to the new pipeline.
 *
 * In dev only (`NODE_ENV !== "production"`), an optional query-param
 * override `?engineMode=v2-workflow` is honored when explicitly passed
 * via getEngineModeFromRequest(req). Not used in production.
 */
export type EngineMode = "v1" | "v2-workflow";

export function getEngineMode(): EngineMode {
  const env = process.env.DD_ENGINE_MODE;
  if (env === "v2-workflow") return "v2-workflow";
  return "v1";
}

export function getEngineModeFromRequest(
  searchParams: URLSearchParams | undefined,
): EngineMode {
  if (process.env.NODE_ENV !== "production" && searchParams) {
    const q = searchParams.get("engineMode");
    if (q === "v2-workflow") return "v2-workflow";
  }
  return getEngineMode();
}
