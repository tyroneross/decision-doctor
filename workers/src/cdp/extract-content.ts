// Thin CDP wrapper: spawn Chrome → connect → navigate → wait load/stability →
// grab rendered text evidence.
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
//   4. Fixed 2s settle delay plus short text-stability polling — covers
//      post-load async content (React effects, lazy-mounted article body,
//      hydration finishers).
//   5. Runtime.evaluate(...) → return structured text candidates and HTML.
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
const TEXT_STABILITY_TIMEOUT_MS = 4_000;
const TEXT_STABILITY_INTERVAL_MS = 500;

interface LifecycleEvent {
  name?: string;
}

export interface ExtractRenderedHtmlOptions {
  /** Headless Chrome (default true). */
  headless?: boolean;
  /** Settle delay after first 'load' event (default 2s). */
  settleMs?: number;
}

export interface RenderedContentProbe {
  finalUrl: string;
  title: string;
  metaDescription: string;
  outerHtml: string;
  bodyInnerText: string;
  articleTexts: string[];
  mainTexts: string[];
  loadingSignals: string[];
  errorSignals: string[];
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

async function waitForTextStability(runtime: RuntimeDomain): Promise<void> {
  const deadline = Date.now() + TEXT_STABILITY_TIMEOUT_MS;
  let lastLen = -1;
  let stableTicks = 0;
  while (Date.now() < deadline) {
    const snapshot = (await runtime.evaluate(`(() => {
      const text = document.body?.innerText || "";
      const loading = document.querySelectorAll(
        '[class*="spinner"], [class*="loading"], [class*="loader"], ' +
        '[class*="skeleton"], [class*="placeholder"], [aria-busy="true"], ' +
        '[role="progressbar"]'
      ).length;
      return { readyState: document.readyState, textLength: text.length, loading };
    })()`)) as { readyState?: string; textLength?: number; loading?: number };
    const textLength = Number(snapshot.textLength ?? 0);
    const loading = Number(snapshot.loading ?? 0);
    if (snapshot.readyState === "complete" && loading === 0 && textLength === lastLen) {
      stableTicks++;
      if (stableTicks >= 2) return;
    } else {
      stableTicks = 0;
    }
    lastLen = textLength;
    await new Promise((r) => setTimeout(r, TEXT_STABILITY_INTERVAL_MS));
  }
}

async function withRenderedRuntime<T>(
  url: string,
  options: ExtractRenderedHtmlOptions = {},
  fn: (runtime: RuntimeDomain) => Promise<T>,
): Promise<T> {
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
    await waitForTextStability(runtime);

    return await fn(runtime);
  } finally {
    await conn.close().catch(() => {});
    await browser.close().catch(() => {});
  }
}

export async function extractRenderedContentProbe(
  url: string,
  options: ExtractRenderedHtmlOptions = {},
): Promise<RenderedContentProbe> {
  return await withRenderedRuntime(url, options, async (runtime) => {
    const probe = await runtime.evaluate(`(() => {
      const normalize = (s) => String(s || "").replace(/\\s+/g, " ").trim();
      const texts = (selector) => Array.from(document.querySelectorAll(selector))
        .map((el) => normalize(el.textContent || ""))
        .filter(Boolean);
      const loadingNodes = Array.from(document.querySelectorAll(
        '[class*="spinner"], [class*="loading"], [class*="loader"], ' +
        '[class*="skeleton"], [class*="placeholder"], [aria-busy="true"], ' +
        '[role="progressbar"]'
      )).slice(0, 10).map((el) => normalize(el.textContent || el.getAttribute("aria-label") || el.className || el.tagName));
      const errorNodes = Array.from(document.querySelectorAll(
        '[class*="error"], [class*="denied"], [class*="forbidden"], [role="alert"]'
      )).slice(0, 10).map((el) => normalize(el.textContent || el.getAttribute("aria-label") || el.className || el.tagName));
      return {
        finalUrl: location.href,
        title: document.title || "",
        metaDescription: document.querySelector('meta[name="description"], meta[property="og:description"]')?.getAttribute("content") || "",
        outerHtml: document.documentElement.outerHTML,
        bodyInnerText: normalize(document.body?.innerText || ""),
        articleTexts: texts("article"),
        mainTexts: texts("main"),
        loadingSignals: loadingNodes.filter(Boolean),
        errorSignals: errorNodes.filter(Boolean),
      };
    })()`);
    if (!probe || typeof probe !== "object") {
      throw new Error("extractRenderedContentProbe: Runtime.evaluate returned non-object");
    }
    return probe as RenderedContentProbe;
  });
}

export async function extractRenderedHtml(
  url: string,
  options: ExtractRenderedHtmlOptions = {},
): Promise<string> {
  const probe = await extractRenderedContentProbe(url, options);
  return probe.outerHtml;
}
