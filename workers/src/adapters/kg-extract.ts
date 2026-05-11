// kg-extract pg-boss job handler.
//
// Chained from content-extract. Calls Groq Llama 3.3 70B in JSON mode to
// extract entities + relationships, then canonicalizes against ai_entities
// in this priority order (verbatim — must match adapter behavior):
//   1) Exact (scope, entity_type, lower(canonical_name)) — unique index match wins
//   2) pg_trgm similarity(lower(canonical_name), lower($1)) >= 0.7
//      → highest-similarity wins
//   3) Alias overlap: aliases @> ARRAY[$1] → match
//   4) Ambiguous (≥2 within 0.05 similarity) → pick highest mention_count;
//      log to metadata.kg_extract.ambiguous_canonicalization
//   5) No match → INSERT new ai_entities row
//
// Mention upsert: ON CONFLICT (document_id, entity_id) DO UPDATE
//   SET mention_count = ai_document_entity_mentions.mention_count + EXCLUDED.mention_count
// Relationship upsert: ON CONFLICT (scope, source_entity_id, target_entity_id, relationship_type)
//   DO NOTHING
//
// Doc-level idempotency: skip if any mention row already exists for this doc.
// Graceful degrade: Groq error → metadata.kg_extract = { degraded: true, ... }
// and zero DB writes for entities/mentions/relationships.

import { getPool } from "../db.js";
import { getGroqClient } from "../llm/groq-client.js";
import type { PoolClient } from "pg";

export const KG_EXTRACT_PROMPT_VERSION = "2026-05-11.1";
const MODEL = "llama-3.3-70b-versatile";

const ALLOWED_ENTITY_TYPES = new Set([
  "organization",
  "model",
  "product",
  "person",
  "benchmark",
  "capability",
  "technique",
  "paper",
  "standard",
  "other",
]);
const ALLOWED_TEMPORAL = new Set(["active", "ended", "announced", "rumored"]);

const SYSTEM_PROMPT = `You extract a knowledge graph from an AI-industry article.

Return ONE JSON object:
{
  "entities": [
    { "entity_type": "<one of: organization | model | product | person | benchmark | capability | technique | paper | standard | other>",
      "canonical_name": "<short canonical form, no punctuation>",
      "aliases": ["<alt spelling>", "..."],
      "description": "<one-line description, optional>",
      "confidence": 0.0..1.0 }
  ],
  "relationships": [
    { "source_canonical_name": "<must match an entity above>",
      "target_canonical_name": "<must match an entity above>",
      "relationship_type": "<verb_phrase like develops | competes_with | depends_on | replaces | cites | integrates | partners_with | acquires>",
      "temporal_status": "<one of: active | ended | announced | rumored>",
      "evidence_text": "<verbatim sentence from the body, optional>",
      "confidence": 0.0..1.0 }
  ]
}

Rules:
- entity_type values MUST be from the listed set verbatim.
- temporal_status values MUST be from { active, ended, announced, rumored } if set.
- relationship source/target MUST refer to entities you listed in the same response.
- No self-loops (source != target).
- Prefer canonical model names ("Claude Sonnet 4.5", not "the model").
- Skip generic concepts ("AI", "technology") — only specific named entities.
- Output STRICT JSON. No markdown fences, no prose preamble.`;

interface ExtractedEntity {
  entity_type: string;
  canonical_name: string;
  aliases: string[];
  description?: string;
  confidence: number;
}

interface ExtractedRelationship {
  source_canonical_name: string;
  target_canonical_name: string;
  relationship_type: string;
  temporal_status?: string;
  evidence_text?: string;
  confidence: number;
}

interface ExtractedGraph {
  entities: ExtractedEntity[];
  relationships: ExtractedRelationship[];
}

interface DocumentRow {
  id: string;
  scope: string;
  title: string;
  body: string;
}

export interface KgExtractPayload {
  documentId: string;
}

export interface KgExtractResult {
  documentId: string;
  status:
    | "extracted"
    | "skipped-already-extracted"
    | "skipped-not-found"
    | "degraded";
  entity_count: number;
  relationship_count: number;
  prompt_version: string;
  latency_ms: number;
}

function safeArray<T>(x: unknown): T[] {
  return Array.isArray(x) ? (x as T[]) : [];
}

function normalizeEntity(raw: unknown): ExtractedEntity | null {
  const r = (raw ?? {}) as Partial<ExtractedEntity> & Record<string, unknown>;
  const t = typeof r.entity_type === "string" ? r.entity_type : "";
  if (!ALLOWED_ENTITY_TYPES.has(t)) return null;
  const name = typeof r.canonical_name === "string" ? r.canonical_name.trim() : "";
  if (!name) return null;
  const aliases = Array.isArray(r.aliases)
    ? r.aliases.filter((a): a is string => typeof a === "string" && a.trim().length > 0)
    : [];
  const conf = typeof r.confidence === "number" ? Math.max(0, Math.min(1, r.confidence)) : 0.8;
  return {
    entity_type: t,
    canonical_name: name,
    aliases,
    description: typeof r.description === "string" ? r.description : undefined,
    confidence: conf,
  };
}

function normalizeRelationship(
  raw: unknown,
): ExtractedRelationship | null {
  const r = (raw ?? {}) as Partial<ExtractedRelationship> &
    Record<string, unknown>;
  const src = typeof r.source_canonical_name === "string" ? r.source_canonical_name.trim() : "";
  const tgt = typeof r.target_canonical_name === "string" ? r.target_canonical_name.trim() : "";
  const type = typeof r.relationship_type === "string" ? r.relationship_type.trim() : "";
  if (!src || !tgt || !type || src.toLowerCase() === tgt.toLowerCase()) return null;
  const ts = typeof r.temporal_status === "string" ? r.temporal_status : "";
  const tsValid = ALLOWED_TEMPORAL.has(ts) ? ts : undefined;
  const conf = typeof r.confidence === "number" ? Math.max(0, Math.min(1, r.confidence)) : 0.8;
  return {
    source_canonical_name: src,
    target_canonical_name: tgt,
    relationship_type: type,
    temporal_status: tsValid,
    evidence_text: typeof r.evidence_text === "string" ? r.evidence_text : undefined,
    confidence: conf,
  };
}

export async function callGroqExtract(
  title: string,
  body: string,
): Promise<ExtractedGraph> {
  const client = getGroqClient();
  const resp = await client.chat.completions.create({
    model: MODEL,
    temperature: 0,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: `TITLE: ${title}\n\nBODY:\n${body}\n\nReturn the JSON now.`,
      },
    ],
  });
  const raw = resp.choices[0]?.message?.content ?? "{}";
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    throw new Error(`Groq returned invalid JSON: ${String(e).slice(0, 200)}`);
  }
  const obj = (parsed ?? {}) as Record<string, unknown>;
  const entities = safeArray(obj.entities).map(normalizeEntity).filter(
    (e): e is ExtractedEntity => e !== null,
  );
  const relationships = safeArray(obj.relationships)
    .map(normalizeRelationship)
    .filter((r): r is ExtractedRelationship => r !== null);
  return { entities, relationships };
}

interface CanonRow {
  id: string;
  canonical_name: string;
  mention_count: number;
  similarity?: number;
}

interface AmbiguousNote {
  proposed: string;
  candidates: Array<{ id: string; canonical_name: string; similarity: number }>;
}

/** Canonicalize ONE proposed entity to a row in ai_entities, inserting if no
 *  match is found. Returns the canonical entity id plus an optional note for
 *  later attachment to metadata.kg_extract.ambiguous_canonicalization. */
async function canonicalizeEntity(
  client: PoolClient,
  scope: string,
  proposed: ExtractedEntity,
): Promise<{ id: string; ambiguous?: AmbiguousNote }> {
  // 1) Exact case-insensitive match on canonical_name within (scope, entity_type).
  const exact = await client.query<CanonRow>(
    `SELECT id, canonical_name, mention_count
       FROM ai_entities
      WHERE scope = $1
        AND entity_type = $2
        AND lower(canonical_name) = lower($3)
      LIMIT 1`,
    [scope, proposed.entity_type, proposed.canonical_name],
  );
  if (exact.rows.length > 0) {
    return { id: exact.rows[0]!.id };
  }

  // 2) Trigram similarity ≥ 0.7 within same scope+entity_type, ordered highest first.
  const trgm = await client.query<CanonRow>(
    `SELECT id, canonical_name, mention_count,
            similarity(lower(canonical_name), lower($3)) AS similarity
       FROM ai_entities
      WHERE scope = $1
        AND entity_type = $2
        AND similarity(lower(canonical_name), lower($3)) >= 0.7
      ORDER BY similarity DESC, mention_count DESC
      LIMIT 5`,
    [scope, proposed.entity_type, proposed.canonical_name],
  );
  if (trgm.rows.length > 0) {
    const top = trgm.rows[0]!;
    const topSim = typeof top.similarity === "number" ? top.similarity : 1;
    const ambiguous = trgm.rows.filter(
      (r) => Math.abs((r.similarity ?? 0) - topSim) <= 0.05,
    );
    if (ambiguous.length >= 2) {
      // Tie-break: highest mention_count wins (already ordered).
      const winner = [...ambiguous].sort(
        (a, b) => b.mention_count - a.mention_count,
      )[0]!;
      return {
        id: winner.id,
        ambiguous: {
          proposed: proposed.canonical_name,
          candidates: ambiguous.map((c) => ({
            id: c.id,
            canonical_name: c.canonical_name,
            similarity: c.similarity ?? 0,
          })),
        },
      };
    }
    return { id: top.id };
  }

  // 3) Alias overlap — does any existing row's aliases array contain our proposed name?
  const aliasHit = await client.query<{ id: string }>(
    `SELECT id FROM ai_entities
      WHERE scope = $1
        AND entity_type = $2
        AND aliases @> ARRAY[$3]::text[]
      LIMIT 1`,
    [scope, proposed.entity_type, proposed.canonical_name],
  );
  if (aliasHit.rows.length > 0) {
    return { id: aliasHit.rows[0]!.id };
  }

  // 4) INSERT.
  const ins = await client.query<{ id: string }>(
    `INSERT INTO ai_entities
       (scope, entity_type, canonical_name, aliases, description)
     VALUES ($1, $2, $3, $4::text[], $5)
     RETURNING id`,
    [
      scope,
      proposed.entity_type,
      proposed.canonical_name,
      proposed.aliases,
      proposed.description ?? null,
    ],
  );
  return { id: ins.rows[0]!.id };
}

export async function handleKgExtract(
  payload: KgExtractPayload,
): Promise<KgExtractResult> {
  const t0 = Date.now();
  const pool = getPool();
  const client = await pool.connect();
  try {
    const docQ = await client.query<DocumentRow>(
      `SELECT id, scope, title, body FROM corpus_documents WHERE id = $1 LIMIT 1`,
      [payload.documentId],
    );
    if (docQ.rows.length === 0) {
      return {
        documentId: payload.documentId,
        status: "skipped-not-found",
        entity_count: 0,
        relationship_count: 0,
        prompt_version: KG_EXTRACT_PROMPT_VERSION,
        latency_ms: Date.now() - t0,
      };
    }
    const doc = docQ.rows[0]!;

    // Doc-level idempotency: if any mention row exists for this doc, skip.
    const existing = await client.query(
      `SELECT 1 FROM ai_document_entity_mentions WHERE document_id = $1 LIMIT 1`,
      [doc.id],
    );
    if ((existing.rowCount ?? 0) > 0) {
      return {
        documentId: doc.id,
        status: "skipped-already-extracted",
        entity_count: 0,
        relationship_count: 0,
        prompt_version: KG_EXTRACT_PROMPT_VERSION,
        latency_ms: Date.now() - t0,
      };
    }

    // Call Groq with graceful-degrade.
    let graph: ExtractedGraph;
    let degraded = false;
    try {
      graph = await callGroqExtract(doc.title, doc.body);
    } catch (e) {
      console.error(`[kg-extract] Groq call failed for ${doc.id}:`, e);
      graph = { entities: [], relationships: [] };
      degraded = true;
    }

    const ambiguousNotes: AmbiguousNote[] = [];
    let entityCount = 0;
    let relCount = 0;

    if (!degraded) {
      await client.query("BEGIN");
      await client.query(
        "SELECT set_config('app.current_user_id', $1, true)",
        [doc.scope],
      );

      // Canonicalize each entity, build name → id map for relationship resolution.
      const nameToId = new Map<string, string>();
      for (const e of graph.entities) {
        const { id, ambiguous } = await canonicalizeEntity(client, doc.scope, e);
        nameToId.set(e.canonical_name.toLowerCase(), id);
        if (ambiguous) ambiguousNotes.push(ambiguous);
        // Mention upsert (one row per (document, entity), mention_count incremented).
        await client.query(
          `INSERT INTO ai_document_entity_mentions
             (document_id, entity_id, confidence, mention_count, evidence_text)
           VALUES ($1, $2, $3, 1, $4)
           ON CONFLICT (document_id, entity_id)
           DO UPDATE SET
             mention_count = ai_document_entity_mentions.mention_count + EXCLUDED.mention_count,
             confidence    = GREATEST(ai_document_entity_mentions.confidence, EXCLUDED.confidence)`,
          [doc.id, id, e.confidence, e.description ?? null],
        );
        // Bump entity's denormalized counter + last_seen_at.
        await client.query(
          `UPDATE ai_entities
              SET mention_count = mention_count + 1,
                  last_seen_at  = now()
            WHERE id = $1`,
          [id],
        );
        entityCount++;
      }

      // Relationships — only if both endpoints canonicalized.
      for (const r of graph.relationships) {
        const srcId = nameToId.get(r.source_canonical_name.toLowerCase());
        const tgtId = nameToId.get(r.target_canonical_name.toLowerCase());
        if (!srcId || !tgtId || srcId === tgtId) continue;
        const ins = await client.query(
          `INSERT INTO ai_relationships
             (scope, source_entity_id, target_entity_id, relationship_type,
              confidence, evidence_document_id, evidence_text, temporal_status)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           ON CONFLICT (scope, source_entity_id, target_entity_id, relationship_type)
           DO NOTHING`,
          [
            doc.scope,
            srcId,
            tgtId,
            r.relationship_type,
            r.confidence,
            doc.id,
            r.evidence_text ?? null,
            r.temporal_status ?? null,
          ],
        );
        if ((ins.rowCount ?? 0) > 0) relCount++;
      }

      // Stamp metadata.kg_extract on the doc.
      const meta: Record<string, unknown> = {
        generated_at: new Date().toISOString(),
        prompt_version: KG_EXTRACT_PROMPT_VERSION,
        entity_count: entityCount,
        relationship_count: relCount,
      };
      if (ambiguousNotes.length > 0) {
        meta.ambiguous_canonicalization = ambiguousNotes;
      }
      await client.query(
        `UPDATE corpus_documents
            SET metadata = COALESCE(metadata, '{}'::jsonb)
                           || jsonb_build_object('kg_extract', $1::jsonb)
          WHERE id = $2`,
        [JSON.stringify(meta), doc.id],
      );
      await client.query("COMMIT");
    } else {
      // Degraded path: just stamp metadata.
      await client.query("BEGIN");
      await client.query(
        "SELECT set_config('app.current_user_id', $1, true)",
        [doc.scope],
      );
      await client.query(
        `UPDATE corpus_documents
            SET metadata = COALESCE(metadata, '{}'::jsonb)
                           || jsonb_build_object('kg_extract', $1::jsonb)
          WHERE id = $2`,
        [
          JSON.stringify({
            degraded: true,
            generated_at: new Date().toISOString(),
            prompt_version: KG_EXTRACT_PROMPT_VERSION,
            entity_count: 0,
            relationship_count: 0,
          }),
          doc.id,
        ],
      );
      await client.query("COMMIT");
    }

    const result: KgExtractResult = {
      documentId: doc.id,
      status: degraded ? "degraded" : "extracted",
      entity_count: entityCount,
      relationship_count: relCount,
      prompt_version: KG_EXTRACT_PROMPT_VERSION,
      latency_ms: Date.now() - t0,
    };
    console.log(JSON.stringify({ event: "kg-extract-complete", ...result }));
    return result;
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}
