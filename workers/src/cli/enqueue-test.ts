// CLI: enqueue a test-job and exit. Used as T-33 — round-trips a payload.
//
// Usage:
//   pnpm tsx src/cli/enqueue-test.ts "hello"
import { config as loadEnv } from "dotenv";
import { getBoss } from "../queue.js";

loadEnv();

async function main(): Promise<void> {
  const echo = process.argv[2] ?? `ping-${Date.now()}`;
  const boss = getBoss();
  await boss.start();
  await boss.createQueue("test-job"); // idempotent
  const id = await boss.send("test-job", { echo });
  console.log(`[enqueue-test] queued test-job ${id} echo="${echo}"`);
  await boss.stop({ graceful: true, timeout: 2000 });
}

main().catch((e) => {
  console.error("[enqueue-test] fatal:", e);
  process.exit(1);
});
