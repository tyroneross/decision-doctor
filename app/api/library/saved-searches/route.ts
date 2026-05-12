// GET  /api/library/saved-searches  — list current user's saved searches
// POST /api/library/saved-searches  — create one
//
// Authed-only. Guests get 401. Returns the inserted row on POST (201).
//
// POST body:
//   {
//     query: string,                       // search text, may be empty
//     kindFilter?: string[],               // LibraryKind values; default []
//     pathFilter?: string[],               // PainPath values; default []
//     onlyMine?: boolean,                  // default false
//     name?: string | null,                // optional user label
//   }

import "server-only";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionActor } from "@/lib/auth-session";
import {
  createSavedSearch,
  listSavedSearches,
} from "@/lib/library";

// Hardening item 7 (mirrors siblings).
export const runtime = "nodejs";

const VALID_KINDS = [
  "all",
  "use_case",
  "prompt",
  "skill",
  "plugin",
  "corpus",
  "kb_article",
  "saved_search",
  "saved_response",
] as const;

const VALID_PATHS = [
  "all",
  "referrals",
  "research",
  "admin",
  "capacity_growth",
  "follow_up",
  "custom",
] as const;

const CreateSchema = z.object({
  query: z.string().max(2000).default(""),
  kindFilter: z.array(z.enum(VALID_KINDS)).max(16).optional().default([]),
  pathFilter: z.array(z.enum(VALID_PATHS)).max(16).optional().default([]),
  onlyMine: z.boolean().optional().default(false),
  name: z.string().min(1).max(120).nullable().optional().default(null),
});

export async function GET() {
  const actor = await getSessionActor();
  if (!actor) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rows = await listSavedSearches(actor.userId, actor.tenantId);
  return NextResponse.json({ saved_searches: rows });
}

export async function POST(req: Request) {
  const actor = await getSessionActor();
  if (!actor) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "bad_request", detail: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const row = await createSavedSearch(actor.userId, actor.tenantId, {
    query: parsed.data.query,
    kindFilter: parsed.data.kindFilter,
    pathFilter: parsed.data.pathFilter,
    onlyMine: parsed.data.onlyMine,
    name: parsed.data.name,
  });

  return NextResponse.json({ saved_search: row }, { status: 201 });
}
