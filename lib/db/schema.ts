// PRD §7.1 — Multi-tenant schema (single-user UX, multi-tenant-ready)
// Every user-owned table carries tenant_id from day 1 so v2 enables without migration.

import { sql } from "drizzle-orm";
import {
  pgTable,
  uuid,
  text,
  timestamp,
  jsonb,
  index,
} from "drizzle-orm/pg-core";

// --- Better Auth tables (auto-generated on first run) ---
// users, sessions, accounts, verification_tokens
// Better Auth's Drizzle adapter generates these. We extend `users` minimally below.

export const users = pgTable("users", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  email: text("email").notNull().unique(),
  name: text("name"),
  emailVerifiedAt: timestamp("email_verified_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// --- Tenants — one auto-created per user in v1 ("Personal") ---
export const tenants = pgTable("tenants", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  ownerUserId: uuid("owner_user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull().default("Personal"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// --- Decisions — RLS-gated by tenant_id (PRD §7.4) ---
export const decisions = pgTable(
  "decisions",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    templateId: text("template_id").notNull(),
    intake: jsonb("intake").notNull(), // DecisionInput.fields
    recommendation: jsonb("recommendation"), // D-03
    alternatives: jsonb("alternatives"), // D-04
    robustAlternative: jsonb("robust_alternative"), // D-05
    methodTrace: jsonb("method_trace"), // D-06
    workloadReducers: jsonb("workload_reducers"), // D-09
    destinations: jsonb("destinations"), // emitted destinations[]
    status: text("status", { enum: ["pending", "complete", "failed"] })
      .notNull()
      .default("pending"),
    shareToken: text("share_token").unique(), // for signed shareable URL
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => ({
    tenantIdx: index("decisions_tenant_idx").on(t.tenantId),
    tenantUserIdx: index("decisions_tenant_user_idx").on(t.tenantId, t.userId),
    shareTokenIdx: index("decisions_share_token_idx").on(t.shareToken),
  }),
);

// --- Audit events (P1 per security checklist AT1; append-only) ---
export const auditEvents = pgTable(
  "audit_events",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    action: text("action").notNull(), // e.g. "decision.create", "groq.call"
    targetId: uuid("target_id"),
    metadata: jsonb("metadata"), // tokens_in, tokens_out, model, etc.
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => ({
    tenantIdx: index("audit_tenant_idx").on(t.tenantId),
    actionIdx: index("audit_action_idx").on(t.action),
  }),
);

// Type exports
export type User = typeof users.$inferSelect;
export type Tenant = typeof tenants.$inferSelect;
export type Decision = typeof decisions.$inferSelect;
export type NewDecision = typeof decisions.$inferInsert;
export type AuditEvent = typeof auditEvents.$inferSelect;
