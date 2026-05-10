// Vitest global setup. Loads .env.local before any imports happen via vitest.config.ts.
// Patches `server-only` so files that import it can run in node-test mode.
import { config as dotenvConfig } from "dotenv";
dotenvConfig({ path: ".env.local" });

// Stub `server-only` so library code that guards against client imports passes
// in vitest. (The real package throws on import; here it's a no-op.)
import { vi } from "vitest";
vi.mock("server-only", () => ({}));
