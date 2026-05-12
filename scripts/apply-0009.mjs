// Apply 0009_plugins_skills.sql directly (idempotent — uses IF NOT EXISTS / DO blocks).
// Uses Neon serverless client over DATABASE_URL_UNPOOLED (owner role).

import "dotenv/config";
import { config } from "dotenv";
import fs from "node:fs";
import { Pool, neonConfig } from "@neondatabase/serverless";

config({ path: ".env.local" });
if (typeof WebSocket !== "undefined") neonConfig.webSocketConstructor = WebSocket;

const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL_UNPOOLED or DATABASE_URL required");

const sql = fs.readFileSync("drizzle/0009_plugins_skills.sql", "utf8");

const pool = new Pool({ connectionString: url });
try {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(sql);
    await client.query("COMMIT");
    console.log("✓ 0009_plugins_skills.sql applied");
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    client.release();
  }
} finally {
  await pool.end();
}
