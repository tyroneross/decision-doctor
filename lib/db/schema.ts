// PRD §7.1 — Multi-tenant schema (single-user UX, multi-tenant-ready).
//
// Schema convention adopted from Branch A (mid-build collision on 2026-05-10):
// plural table names, uuid PKs, Better Auth's drizzleAdapter configured to use
// these names via per-model overrides. Tenant_id RLS isolates the data plane
// between Branch A and Branch B.

import { sql } from "drizzle-orm";
import {
  pgTable,
  uuid,
  text,
  timestamp,
  jsonb,
  index,
  uniqueIndex,
  boolean,
} from "drizzle-orm/pg-core";

// ---------------------------------------------------------------------------
// Better Auth core tables (plural, uuid PK — Branch A convention)
// ---------------------------------------------------------------------------

export const users = pgTable("users", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  name: text("name").notNull().default(""),
  image: text("image"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    token: text("token").notNull().unique(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at").notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => ({
    tokenIdx: uniqueIndex("sessions_token_idx").on(t.token),
    userIdx: index("sessions_user_idx").on(t.userId),
  }),
);

export const accounts = pgTable(
  "accounts",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at"),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
    scope: text("scope"),
    password: text("password"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => ({
    providerAccountIdx: uniqueIndex("accounts_provider_account_idx").on(t.providerId, t.accountId),
    userIdx: index("accounts_user_idx").on(t.userId),
  }),
);

export const verifications = pgTable(
  "verifications",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => ({
    identifierIdx: index("verifications_identifier_idx").on(t.identifier),
  }),
);

// ---------------------------------------------------------------------------
// Domain tables (user-owned, RLS-gated by tenant_id)
// ---------------------------------------------------------------------------

export const tenants = pgTable("tenants", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  ownerUserId: uuid("owner_user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull().default("Personal"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

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
    intake: jsonb("intake").notNull(),
    recommendation: jsonb("recommendation"),
    alternatives: jsonb("alternatives"),
    robustAlternative: jsonb("robust_alternative"),
    methodTrace: jsonb("method_trace"),
    workloadReducers: jsonb("workload_reducers"),
    destinations: jsonb("destinations"),
    // Chat-first additions (additive — Branch A's queries unaffected).
    // mode: which decision-mode router classified this conversation into.
    //   structured_enumerable | generic_structured | generative_design | values_dominant
    // null on legacy template-form rows.
    mode: text("mode"),
    // transcript: ordered conversation turns the chat collected before producing
    // the recommendation. Shape: { messages: [{role, content, timestamp}], state: {...} }
    // Optional for non-chat decisions (legacy template-form path).
    transcript: jsonb("transcript"),
    status: text("status", { enum: ["pending", "complete", "failed"] })
      .notNull()
      .default("pending"),
    shareToken: text("share_token").unique(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => ({
    tenantIdx: index("decisions_tenant_idx").on(t.tenantId),
    tenantUserIdx: index("decisions_tenant_user_idx").on(t.tenantId, t.userId),
    shareTokenIdx: index("decisions_share_token_idx").on(t.shareToken),
  }),
);

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
    action: text("action").notNull(),
    targetId: uuid("target_id"),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => ({
    tenantIdx: index("audit_tenant_idx").on(t.tenantId),
    actionIdx: index("audit_action_idx").on(t.action),
  }),
);

export type User = typeof users.$inferSelect;
export type Tenant = typeof tenants.$inferSelect;
export type Decision = typeof decisions.$inferSelect;
export type NewDecision = typeof decisions.$inferInsert;
export type AuditEvent = typeof auditEvents.$inferSelect;
