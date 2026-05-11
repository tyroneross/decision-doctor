// CDP smoke test — spawns Chrome, navigates to a JS-rendered URL, asserts
// the rendered DOM is meaningful.
//
// Skipped by default when no Chrome binary is available locally; flipped on
// in CI / locally where IBR's own test suite passes. The Railway build adds
// Nixpacks `chromium` so this passes there too.

import { describe, it, expect } from "vitest";
import { existsSync } from "node:fs";
import { extractRenderedHtml } from "../src/cdp/extract-content.js";

const CHROME_PATHS = [
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium-browser",
  "/usr/bin/chromium",
];

function findChrome(): string | null {
  for (const p of CHROME_PATHS) {
    if (existsSync(p)) return p;
  }
  return null;
}

const hasChrome = findChrome() !== null;
const describeIfChrome = hasChrome ? describe : describe.skip;

describeIfChrome("CDP extractRenderedHtml", () => {
  it("returns a non-trivial rendered DOM for example.com", async () => {
    const html = await extractRenderedHtml("https://example.com");
    expect(typeof html).toBe("string");
    expect(html.length).toBeGreaterThan(500);
    // example.com always renders an <h1>Example Domain</h1>
    expect(html.toLowerCase()).toContain("example domain");
  }, 60_000);
});
