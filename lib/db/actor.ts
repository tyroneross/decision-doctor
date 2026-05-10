import "server-only";

import { AsyncLocalStorage } from "async_hooks";
import { Pool } from "@neondatabase/serverless";
import { drizzle, type NeonDatabase } from "drizzle-orm/neon-serverless";
import { sql } from "drizzle-orm";
import * as schema from "./schema";

export interface DbActorContext {
  userId: string;
  tenantId: string;
}

type DbContext = { userId: string; tenantId?: string };

const dbActorContext = new AsyncLocalStorage<DbContext>();

let pool: Pool | null = null;
let db: (NeonDatabase<typeof schema> & { $client: Pool }) | null = null;

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export function getPool(): Pool {
  if (!pool) {
    pool = new Pool({
      connectionString: requiredEnv("DATABASE_URL"),
      max: 10,
    });
  }
  return pool;
}

export function getDb() {
  if (!db) {
    db = drizzle(getPool(), { schema });
  }
  return db;
}

export type AppDb = ReturnType<typeof getDb>;
export type AppDbTransaction = Parameters<Parameters<AppDb["transaction"]>[0]>[0];

export function runWithActor<T>(
  context: DbActorContext,
  callback: () => Promise<T>,
): Promise<T> {
  return dbActorContext.run(context, callback);
}

export function runWithUser<T>(
  context: { userId: string },
  callback: () => Promise<T>,
): Promise<T> {
  return dbActorContext.run(context, callback);
}

export async function withActor<T>(
  operation: (tx: AppDbTransaction) => Promise<T>,
): Promise<T> {
  const actor = dbActorContext.getStore();
  if (!actor?.tenantId) {
    throw new Error(
      "withActor() called outside of runWithActor() scope. Wrap your route handler in runWithActor({userId, tenantId}, ...).",
    );
  }
  return getDb().transaction(async (tx) => {
    await tx.execute(sql`
      SELECT
        set_config('app.current_user_id', ${actor.userId}, true),
        set_config('app.current_tenant_id', ${actor.tenantId}, true)
    `);
    return operation(tx);
  });
}

export async function withUser<T>(
  operation: (tx: AppDbTransaction) => Promise<T>,
): Promise<T> {
  const actor = dbActorContext.getStore();
  if (!actor?.userId) {
    throw new Error("withUser() called outside of runWithUser() scope.");
  }
  return getDb().transaction(async (tx) => {
    await tx.execute(sql`
      SELECT set_config('app.current_user_id', ${actor.userId}, true)
    `);
    return operation(tx);
  });
}
