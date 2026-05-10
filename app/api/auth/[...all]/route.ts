import { toNextJsHandler } from "better-auth/next-js";
import { authHandler } from "@/lib/auth";

export const runtime = "nodejs";

export const { GET, POST } = toNextJsHandler(authHandler);
