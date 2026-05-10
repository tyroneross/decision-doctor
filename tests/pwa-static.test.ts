import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("PWA manifest", () => {
  it("starts the installed app at the decision selector", () => {
    const manifest = JSON.parse(
      readFileSync(join(process.cwd(), "public/manifest.json"), "utf8"),
    ) as { start_url?: string; display?: string; icons?: unknown[] };

    expect(manifest.start_url).toBe("/app");
    expect(manifest.display).toBe("standalone");
    expect(manifest.icons?.length).toBeGreaterThanOrEqual(2);
  });
});
