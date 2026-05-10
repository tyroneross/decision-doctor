// PRD §7.1 — Multi-tenant schema (single-user UX, multi-tenant-ready).
//
// Schema mirrors the actual Neon database — verified via information_schema
// 2026-05-10. Tables are PLURAL: `users`, `accounts`, `sessions`, `verifications`,
// `tenants`, `decisions`, `audit_events`. ALL primary keys + foreign keys are
// `uuid` (Better Auth was configured to use uuid generateId, not text/cuid).

import { sql } from "drizzle-orm";
import {
  pgTable,
  uuid,
  text,
  boolean,
  timestamp,
  jsonb,
  index,
  integer,
  uniqueIndex,
  customType,
} from "drizzle-orm/pg-core";

// pgvector custom type — Drizzle has no first-class vector column yet.
// Round-trip:
//   write: number[]  →  '[0.12, 0.34, …]'  (Postgres vector literal)
//   read : '[0.12, 0.34, …]'  →  number[]
// Dimension is parameterized so the same helper works for 768 / 1536 / etc.
export const vector = customType<{
  data: number[];
  driverData: string;
  config: { dimensions: number };
}>({
  dataType(config) {
    return `vector(${config?.dimensions ?? 768})`;
  },
  toDriver(value: number[]): string {
    return `[${value.join(",")}]`;
  },
  fromDriver(value: string): number[] {
    // Postgres returns '[0.1,0.2,...]'
    return JSON.parse(value);
  },
});

// --- Better Auth tables (auto-managed by Better Auth's drizzle adapter) ---
// Schema mirrored here so app code can JOIN; do NOT modify columns without
// running Better Auth's `generate` command in lockstep.

export const users = pgTable("users", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull().default(""),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const accounts = pgTable("accounts", {
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
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const sessions = pgTable("sessions", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  expiresAt: timestamp("expires_at").notNull(),
  token: text("token").notNull().unique(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
});

export const verifications = pgTable("verifications", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
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
    title: text("title"), // human-readable label, set after Stage 1
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

// --- Corpus documents + embeddings (F-30) ---
// Scope-keyed: 'global' for shared ingest, user_id::text for user-specific saves.
// RLS lives in drizzle/0003_corpus.sql — DO NOT add tenant_id here; the corpus
// is intentionally cross-tenant.
export const corpusDocuments = pgTable(
  "corpus_documents",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    scope: text("scope").notNull(), // 'global' or user_id::text
    sourceType: text("source_type").notNull(), // 'arxiv' | 'anthropic' | ...
    sourceId: text("source_id").notNull(),
    sourceUrl: text("source_url").notNull(),
    title: text("title").notNull(),
    body: text("body").notNull(),
    contentHash: text("content_hash").notNull(),
    fetchedAt: timestamp("fetched_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    metadata: jsonb("metadata").notNull().default(sql`'{}'::jsonb`),
    // `search_tsv` is a GENERATED column; Drizzle has no native generated-column
    // helper. We declare it raw and treat it as read-only at the ORM level.
    // INSERTs MUST omit it (Postgres rejects writes to GENERATED ALWAYS).
  },
  (t) => ({
    scopeIdx: index("corpus_documents_scope_idx").on(t.scope),
    sourceIdx: index("corpus_documents_source_idx").on(
      t.sourceType,
      t.fetchedAt,
    ),
    sourceUniq: uniqueIndex("corpus_documents_source_unique").on(
      t.sourceType,
      t.sourceId,
      t.scope,
    ),
  }),
);

export const corpusEmbeddings = pgTable(
  "corpus_embeddings",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    documentId: uuid("document_id")
      .notNull()
      .references(() => corpusDocuments.id, { onDelete: "cascade" }),
    chunkIndex: integer("chunk_index").notNull(),
    chunkText: text("chunk_text").notNull(),
    embedding: vector("embedding", { dimensions: 768 }).notNull(),
    contentHash: text("content_hash").notNull(),
  },
  (t) => ({
    docIdx: index("corpus_embeddings_doc_idx").on(t.documentId),
    chunkUniq: uniqueIndex("corpus_embeddings_chunk_unique").on(
      t.documentId,
      t.chunkIndex,
    ),
  }),
);

// Type exports — plural matches DB; type names stay singular for ergonomics.
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Tenant = typeof tenants.$inferSelect;
export type Decision = typeof decisions.$inferSelect;
export type NewDecision = typeof decisions.$inferInsert;
export type AuditEvent = typeof auditEvents.$inferSelect;
export type CorpusDocument = typeof corpusDocuments.$inferSelect;
export type NewCorpusDocument = typeof corpusDocuments.$inferInsert;
export type CorpusEmbedding = typeof corpusEmbeddings.$inferSelect;
export type NewCorpusEmbedding = typeof corpusEmbeddings.$inferInsert;
