// PRD §LD-08 — Better Auth catch-all route handler.
// Node runtime required for the Neon WebSocket pool.

import { auth } from "@/lib/auth";
import { toNextJsHandler } from "better-auth/next-js";

export const runtime = "nodejs";

export const { POST, GET } = toNextJsHandler(auth);
