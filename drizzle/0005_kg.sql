-- Knowledge Graph + Source Registry + Search Diagnostics
-- Migrated from decision-doctor-codex/docs/architecture/ai-knowledge-schema-draft.sql
-- 2026-05-10
--
-- Why this matters: AI-research retrieval is entity-heavy (model names like
-- "Llama 4 Scout", labs like "Anthropic", techniques like "Matryoshka" carry
-- most of the query signal). BM25 catches entity strings lexically; vector
-- search doesn't reliably encode model names whose embeddings post-date
-- text-embedding-3-small's Sept 2021 training cutoff. KG expansion bridges
-- this: at query time, expand recognized entities to their related entities
-- before retrieving, so a query for "Anthropic" also surfaces docs about
-- "Claude Haiku" and "Constitutional AI".
--
-- All tables follow the same scope = 'global' | user_id::text pattern used
-- by corpus_documents (ADR-009). RLS enforces visibility.
--
-- Indexes:
--   - pg_trgm GIN on entity names — fast canonicalization at ingest + query time
--   - composite scope-first on relationships and search_queries — leverages
--     pgvector 0.8.0 iterative scans (ADR-011)

-- ============================================================================
-- ai_sources — registry of crawl targets (global + per-user)
-- ============================================================================

CREATE TABLE ai_sources (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scope           TEXT NOT NULL,                  -- 'global' or user_id::text
  source_kind     TEXT NOT NULL CHECK (source_kind IN (
                    'lab_news',         -- OpenAI blog, Anthropic news
                    'lab_research',     -- DeepMind research, Microsoft Research
                    'paper_index',      -- arXiv, HuggingFace papers, Semantic Scholar
                    'industry_news',    -- MIT Tech Review, The Batch
                    'user_url',         -- one-off URL imported by a user
                    'user_rss',         -- user's private RSS subscription
                    'user_file'         -- uploaded PDF / markdown
                  )),
  source_key      TEXT NOT NULL,                  -- 'openai-news', 'arxiv-cs.AI', etc.
  display_name    TEXT NOT NULL,
  origin_url      TEXT,
  crawl_config    JSONB NOT NULL DEFAULT '{}'::jsonb,
  trust_tier      INTEGER NOT NULL DEFAULT 2,     -- 1=primary lab, 2=secondary, 3=tertiary
  enabled         BOOLEAN NOT NULL DEFAULT true,
  last_checked_at TIMESTAMPTZ,
  last_status     TEXT,                            -- 'ok', 'rate_limited', 'auth_failed', 'parse_error'
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (scope, source_key)
);
CREATE INDEX ai_sources_scope_enabled_idx ON ai_sources (scope, enabled) WHERE enabled = true;

ALTER TABLE ai_sources ENABLE ROW LEVEL SECURITY;
CREATE POLICY ai_sources_scope_read ON ai_sources
  FOR SELECT USING (
    scope = 'global' OR scope = current_setting('app.current_user_id', true)
  );
CREATE POLICY ai_sources_scope_write ON ai_sources
  FOR INSERT WITH CHECK (
    scope = 'global' OR scope = current_setting('app.current_user_id', true)
  );

-- ============================================================================
-- ai_entities — labs, models, products, people, benchmarks, techniques
-- ============================================================================

CREATE TABLE ai_entities (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scope           TEXT NOT NULL,
  entity_type     TEXT NOT NULL CHECK (entity_type IN (
                    'organization',     -- Anthropic, OpenAI, DeepMind
                    'model',            -- Claude Haiku, Llama 4 Scout, GPT-5
                    'product',          -- ChatGPT, Claude Code, Cursor
                    'person',           -- researchers, founders
                    'benchmark',        -- MTEB, HumanEval, MMLU
                    'capability',       -- tool use, vision, long context
                    'technique',        -- Matryoshka, RLHF, MoE, RAG
                    'paper',            -- specific arXiv ID
                    'standard',         -- MCP, OpenAPI, JSON Schema
                    'other'
                  )),
  canonical_name  TEXT NOT NULL,
  aliases         TEXT[] NOT NULL DEFAULT '{}',   -- ['gpt4', 'GPT 4', 'gpt-iv']
  description     TEXT,                            -- short, user-facing
  metadata        JSONB NOT NULL DEFAULT '{}'::jsonb,
  first_seen_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  mention_count   INTEGER NOT NULL DEFAULT 0,     -- denormalized counter, updated by mention triggers
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (scope, entity_type, lower(canonical_name))
);

-- Trigram indexes for fuzzy match — used by KG expansion + canonicalization
CREATE INDEX ai_entities_name_trgm   ON ai_entities USING gin (lower(canonical_name) gin_trgm_ops);
CREATE INDEX ai_entities_aliases_gin ON ai_entities USING gin (aliases);
CREATE INDEX ai_entities_type_scope_idx ON ai_entities (entity_type, scope);
CREATE INDEX ai_entities_last_seen_idx ON ai_entities (last_seen_at DESC);

ALTER TABLE ai_entities ENABLE ROW LEVEL SECURITY;
CREATE POLICY ai_entities_scope_read ON ai_entities
  FOR SELECT USING (
    scope = 'global' OR scope = current_setting('app.current_user_id', true)
  );
CREATE POLICY ai_entities_scope_write ON ai_entities
  FOR INSERT WITH CHECK (
    scope = 'global' OR scope = current_setting('app.current_user_id', true)
  );

-- ============================================================================
-- ai_document_entity_mentions — many-to-many: which entities appear in which docs
-- ============================================================================

CREATE TABLE ai_document_entity_mentions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id     UUID NOT NULL REFERENCES corpus_documents(id) ON DELETE CASCADE,
  entity_id       UUID NOT NULL REFERENCES ai_entities(id) ON DELETE CASCADE,
  confidence      NUMERIC(4,3) NOT NULL DEFAULT 0.800,
  mention_count   INTEGER NOT NULL DEFAULT 1,     -- multiple mentions in same doc
  evidence_text   TEXT,                            -- sentence/snippet that triggered the mention
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (document_id, entity_id)
);
CREATE INDEX ai_mentions_document_idx ON ai_document_entity_mentions(document_id);
CREATE INDEX ai_mentions_entity_idx   ON ai_document_entity_mentions(entity_id);

-- Mentions inherit visibility from corpus_documents (no own RLS — joins enforce it)

-- ============================================================================
-- ai_relationships — typed edges between entities
-- ============================================================================

CREATE TABLE ai_relationships (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scope                 TEXT NOT NULL,
  source_entity_id      UUID NOT NULL REFERENCES ai_entities(id) ON DELETE CASCADE,
  target_entity_id      UUID NOT NULL REFERENCES ai_entities(id) ON DELETE CASCADE,
  relationship_type     TEXT NOT NULL,            -- 'develops', 'competes_with', 'depends_on', 'replaces', 'cites', 'integrates', 'partners_with', 'acquires'
  confidence            NUMERIC(4,3) NOT NULL DEFAULT 0.800,
  evidence_document_id  UUID REFERENCES corpus_documents(id) ON DELETE SET NULL,
  evidence_text         TEXT,
  temporal_status       TEXT CHECK (temporal_status IN ('active', 'ended', 'announced', 'rumored')),
  metadata              JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (source_entity_id <> target_entity_id),
  UNIQUE (scope, source_entity_id, target_entity_id, relationship_type)
);
CREATE INDEX ai_relationships_source_idx ON ai_relationships(source_entity_id);
CREATE INDEX ai_relationships_target_idx ON ai_relationships(target_entity_id);
CREATE INDEX ai_relationships_type_idx   ON ai_relationships(relationship_type);

ALTER TABLE ai_relationships ENABLE ROW LEVEL SECURITY;
CREATE POLICY ai_relationships_scope_read ON ai_relationships
  FOR SELECT USING (
    scope = 'global' OR scope = current_setting('app.current_user_id', true)
  );
CREATE POLICY ai_relationships_scope_write ON ai_relationships
  FOR INSERT WITH CHECK (
    scope = 'global' OR scope = current_setting('app.current_user_id', true)
  );

-- ============================================================================
-- ai_search_queries — per-query diagnostics for F-31 observability
-- ============================================================================

CREATE TABLE ai_search_queries (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID REFERENCES users(id) ON DELETE SET NULL,
  query_text      TEXT NOT NULL,
  filters         JSONB NOT NULL DEFAULT '{}'::jsonb,      -- {scope, source_types, date_range, ...}
  result_count    INTEGER NOT NULL DEFAULT 0,
  lexical_ms      INTEGER,                                  -- pg_search BM25 latency
  vector_ms       INTEGER,                                  -- pgvector HNSW latency
  kg_ms           INTEGER,                                  -- KG expansion latency
  rerank_ms       INTEGER,                                  -- BGE-v2-m3 latency
  total_ms        INTEGER,
  degraded        BOOLEAN NOT NULL DEFAULT false,           -- any stage failed/skipped
  degraded_reason TEXT,                                     -- 'embedding_unavailable', 'rerank_unavailable', 'kg_skipped_low_confidence'
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ai_search_queries_user_idx
  ON ai_search_queries(user_id, created_at DESC);
CREATE INDEX ai_search_queries_degraded_idx
  ON ai_search_queries(created_at DESC) WHERE degraded = true;

-- ============================================================================
-- Comment block — KG expansion query pattern for F-31 reference
-- ============================================================================

-- Pattern for KG-aware hybrid search (to be implemented in lib/ai-knowledge/search/):
--
-- 1. Canonicalize query entities via fuzzy match on ai_entities:
--    SELECT id, canonical_name FROM ai_entities
--    WHERE scope IN ('global', current_user_scope)
--      AND (lower(canonical_name) % lower($1)
--           OR $1 = ANY(aliases));
--
-- 2. Expand each matched entity to neighbors via ai_relationships:
--    SELECT target_entity_id FROM ai_relationships
--    WHERE source_entity_id = ANY($matched_ids)
--      AND scope IN ('global', current_user_scope)
--      AND confidence >= 0.7;
--
-- 3. Find docs that mention the expanded entity set:
--    SELECT DISTINCT document_id FROM ai_document_entity_mentions
--    WHERE entity_id = ANY($expanded_ids);
--
-- 4. Boost these documents in RRF fusion (treat as a third retrieval leg
--    alongside BM25 + vector).
--
-- See docs/architecture/perplexity-guidance-reconciliation-2026-05-10.md
-- and decision-doctor-codex/docs/architecture/ai-knowledge-search-architecture.md
-- for the full retrieval design rationale.
