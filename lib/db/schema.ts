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

// --- Library tables (V2 P0: pain-to-AI-recommendation) ---
// Scope-keyed: 'global' for curated content; user_id::text for saved/promoted artifacts.
// RLS lives in drizzle/0007_library.sql (same scope-based pattern as corpus_documents).
// pain_path + starting_level are CHECK-constrained at the DB level — Drizzle has no
// first-class enum helper that mirrors a Postgres CHECK constraint, so the constraint
// stays SQL-side and we surface it as a TS union type below.

export type PainPath =
  | "referrals"
  | "research"
  | "admin"
  | "capacity_growth"
  | "follow_up"
  | "custom";

export type StartingLevel =
  | "prompt"
  | "checklist"
  | "skill"
  | "plugin"
  | "agent";

export const libraryUseCases = pgTable(
  "library_use_cases",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    scope: text("scope").notNull(),
    painPath: text("pain_path").$type<PainPath>().notNull(),
    startingLevel: text("starting_level").$type<StartingLevel>().notNull(),
    title: text("title").notNull(),
    body: text("body").notNull(),
    rationale: text("rationale").notNull().default(""),
    estimatedMinutesSavedPerWeek: integer("estimated_minutes_saved_per_week"),
    metadata: jsonb("metadata").notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => ({
    scopeIdx: index("library_use_cases_scope_idx").on(t.scope),
    pathIdx: index("library_use_cases_path_idx").on(t.painPath),
    pathScopeIdx: index("library_use_cases_path_scope_idx").on(
      t.painPath,
      t.scope,
    ),
  }),
);

export const libraryPrompts = pgTable(
  "library_prompts",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    scope: text("scope").notNull(),
    painPath: text("pain_path").$type<PainPath>().notNull(),
    title: text("title").notNull(),
    body: text("body").notNull(),
    description: text("description").notNull().default(""),
    metadata: jsonb("metadata").notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => ({
    scopeIdx: index("library_prompts_scope_idx").on(t.scope),
    pathIdx: index("library_prompts_path_idx").on(t.painPath),
  }),
);

export const librarySkills = pgTable(
  "library_skills",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    scope: text("scope").notNull(),
    painPath: text("pain_path").$type<PainPath>().notNull(),
    title: text("title").notNull(),
    body: text("body").notNull(),
    sourceRecommendationId: uuid("source_recommendation_id"),
    qualityDiagnostic: jsonb("quality_diagnostic")
      .notNull()
      .default(sql`'{}'::jsonb`),
    metadata: jsonb("metadata").notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => ({
    scopeIdx: index("library_skills_scope_idx").on(t.scope),
    pathIdx: index("library_skills_path_idx").on(t.painPath),
    sourceRecIdx: index("library_skills_source_rec_idx").on(
      t.sourceRecommendationId,
    ),
  }),
);

export const libraryPlugins = pgTable(
  "library_plugins",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    scope: text("scope").notNull(),
    painPath: text("pain_path").$type<PainPath>().notNull(),
    title: text("title").notNull(),
    body: text("body").notNull(),
    sourceRecommendationId: uuid("source_recommendation_id"),
    qualityDiagnostic: jsonb("quality_diagnostic")
      .notNull()
      .default(sql`'{}'::jsonb`),
    metadata: jsonb("metadata").notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => ({
    scopeIdx: index("library_plugins_scope_idx").on(t.scope),
    pathIdx: index("library_plugins_path_idx").on(t.painPath),
    sourceRecIdx: index("library_plugins_source_rec_idx").on(
      t.sourceRecommendationId,
    ),
  }),
);

// --- Recommendations (V2 E3: pain-to-AI-recommendation) ---
// User-scoped (no 'global' rows); RLS lives in drizzle/0008_recommendations.sql.
// pain_path CHECK constraint mirrors library_use_cases (hardening item 12).
// status enum mirrors the practitioner lifecycle: planned → tried → active → improve → retired.

export type RecommendationStatus =
  | "planned"
  | "tried"
  | "active"
  | "improve"
  | "retired";

export const recommendations = pgTable(
  "recommendations",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    painPath: text("pain_path").$type<PainPath>().notNull(),
    challengeSummary: text("challenge_summary").notNull(),
    goal: text("goal"),
    intake: jsonb("intake").notNull().default(sql`'{}'::jsonb`),
    candidateTasks: jsonb("candidate_tasks").notNull().default(sql`'[]'::jsonb`),
    recommendedTask: jsonb("recommended_task"),
    starterSolution: jsonb("starter_solution"),
    guardrails: jsonb("guardrails").notNull().default(sql`'[]'::jsonb`),
    successMetric: text("success_metric"),
    adoptionPathway: jsonb("adoption_pathway").notNull().default(sql`'[]'::jsonb`),
    methodTrace: jsonb("method_trace"),
    baseline: jsonb("baseline"),
    status: text("status")
      .$type<RecommendationStatus>()
      .notNull()
      .default("planned"),
    confidence: text("confidence"), // stored as numeric(3,2); read as string from PG, cast at runtime
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => ({
    userIdx: index("recommendations_user_idx").on(t.userId, t.createdAt),
    painPathIdx: index("recommendations_pain_path_idx").on(t.painPath),
    statusIdx: index("recommendations_status_idx").on(t.status),
  }),
);

// --- Knowledge Base articles (V2: /app/learn) ---
// Scope-based RLS mirrors library_use_cases. See drizzle/0009_kb_articles.sql.
export const kbArticles = pgTable(
  "kb_articles",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    scope: text("scope").notNull(),
    slug: text("slug").notNull(),
    title: text("title").notNull(),
    summary: text("summary").notNull().default(""),
    body: text("body").notNull(),
    readingMinutes: integer("reading_minutes"),
    displayOrder: integer("display_order").notNull().default(100),
    metadata: jsonb("metadata").notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => ({
    scopeIdx: index("kb_articles_scope_idx").on(t.scope),
    orderIdx: index("kb_articles_order_idx").on(t.displayOrder),
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
export type LibraryUseCase = typeof libraryUseCases.$inferSelect;
export type NewLibraryUseCase = typeof libraryUseCases.$inferInsert;
export type LibraryPrompt = typeof libraryPrompts.$inferSelect;
export type NewLibraryPrompt = typeof libraryPrompts.$inferInsert;
export type LibrarySkill = typeof librarySkills.$inferSelect;
export type NewLibrarySkill = typeof librarySkills.$inferInsert;
export type LibraryPlugin = typeof libraryPlugins.$inferSelect;
export type NewLibraryPlugin = typeof libraryPlugins.$inferInsert;
export type Recommendation = typeof recommendations.$inferSelect;
export type NewRecommendation = typeof recommendations.$inferInsert;
export type KbArticle = typeof kbArticles.$inferSelect;
export type NewKbArticle = typeof kbArticles.$inferInsert;
