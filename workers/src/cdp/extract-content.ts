// Thin CDP wrapper: spawn Chrome → connect → navigate → wait load → settle → grab HTML.
//
// Used by the content-extract handler for JS-rendered sources (OpenAI news, etc.).
// Each call spawns a fresh BrowserManager — Chrome lifecycle is bounded per
// invocation. pg-boss serializes content-extract to batchSize=1, so we don't
// overlap browser processes.
//
// Settle strategy:
//   1. Page.enable + Page.setLifecycleEventsEnabled
//   2. Page.navigate
//   3. Await first 'load' lifecycle event (or 15s timeout) — covers the
//      initial paint after JS hydration kicks off.
//   4. Fixed 2s settle delay — covers post-load async content (React effects,
//      lazy-mounted article body, hydration finishers). Conservative; OpenAI
//      news pages render their <article> in this window.
//   5. Runtime.evaluate('document.documentElement.outerHTML') → return string.
//
// Failure: any thrown error propagates. The handler decides whether to mark
// degraded=true and continue. browser.close() runs in finally — Chrome always
// terminates even on error paths.

import { BrowserManager } from "./browser.js";
import { CdpConnection } from "./connection.js";
import { PageDomain } from "./page.js";
import { RuntimeDomain } from "./runtime.js";

const LIFECYCLE_TIMEOUT_MS = 15_000;
const SETTLE_DELAY_MS = 2_000;

interface LifecycleEvent {
  name?: string;
}

export interface ExtractRenderedHtmlOptions {
  /** Headless Chrome (default true). */
  headless?: boolean;
  /** Settle delay after first 'load' event (default 2s). */
  settleMs?: number;
}

/** Fetch the page-target WebSocket URL from Chrome's /json/list endpoint.
 *  The launch() return value is the BROWSER-level WS endpoint, which doesn't
 *  expose the Page domain; we need a page-target sessionless connection. */
async function getPageWebSocketUrl(cdpUrl: string): Promise<string> {
  const resp = await fetch(`${cdpUrl}/json/list`);
  if (!resp.ok) {
    throw new Error(`CDP /json/list returned ${resp.status}`);
  }
  const targets = (await resp.json()) as Array<{
    type?: string;
    webSocketDebuggerUrl?: string;
  }>;
  const page = targets.find(
    (t) => t.type === "page" && typeof t.webSocketDebuggerUrl === "string",
  );
  if (!page?.webSocketDebuggerUrl) {
    throw new Error("No page target in /json/list");
  }
  return page.webSocketDebuggerUrl;
}

export async function extractRenderedHtml(
  url: string,
  options: ExtractRenderedHtmlOptions = {},
): Promise<string> {
  const browser = new BrowserManager();
  await browser.launch({ headless: options.headless ?? true });
  // Use the page-target WS endpoint, not the browser-level one, so Page.*
  // domain commands route correctly without an explicit sessionId.
  const cdpUrl = browser.cdpUrl;
  if (!cdpUrl) {
    throw new Error("BrowserManager did not expose cdpUrl after launch()");
  }
  const pageWsUrl = await getPageWebSocketUrl(cdpUrl);
  const conn = new CdpConnection();
  try {
    await conn.connect(pageWsUrl);
    const page = new PageDomain(conn);
    const runtime = new RuntimeDomain(conn);

    // Enable lifecycle events BEFORE navigate so we don't miss the 'load' tick.
    await page.enableLifecycleEvents();
    await runtime.enable();

    // Subscribe to lifecycle events; resolve on first 'load' or timeout.
    const loadOrTimeout = new Promise<void>((resolve) => {
      let settled = false;
      const onEvent = (params: unknown) => {
        const ev = (params ?? {}) as LifecycleEvent;
        if (!settled && ev.name === "load") {
          settled = true;
          conn.off("Page.lifecycleEvent", onEvent);
          resolve();
        }
      };
      conn.on("Page.lifecycleEvent", onEvent);
      setTimeout(() => {
        if (!settled) {
          settled = true;
          conn.off("Page.lifecycleEvent", onEvent);
          resolve();
        }
      }, LIFECYCLE_TIMEOUT_MS);
    });

    await page.navigate(url);
    await loadOrTimeout;
    await new Promise((r) => setTimeout(r, options.settleMs ?? SETTLE_DELAY_MS));

    const html = await runtime.evaluate("document.documentElement.outerHTML");
    if (typeof html !== "string") {
      throw new Error("extractRenderedHtml: Runtime.evaluate returned non-string");
    }
    return html;
  } finally {
    await conn.close().catch(() => {});
    await browser.close().catch(() => {});
  }
}
