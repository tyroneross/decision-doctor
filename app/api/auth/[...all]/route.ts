// PRD §9 / LD-08 — Better Auth catch-all handler.
// Node runtime required: Better Auth's server APIs use the same WebSocket Pool
// that Neon driver requires for transaction-scoped GUCs.

import "server-only";
import { auth } from "@/lib/auth";
import { toNextJsHandler } from "better-auth/next-js";

export const runtime = "nodejs";

export const { GET, POST } = toNextJsHandler(auth);
