// Tiny shared rate-limit helper. 1-req/sec is Atomize's convention for outbound
// scraping, mirroring the inline sleep in anthropic-sitemap.ts. Reused by
// content-extract for per-host throttling.
export async function sleep(ms: number): Promise<void> {
  await new Promise((r) => setTimeout(r, ms));
}
