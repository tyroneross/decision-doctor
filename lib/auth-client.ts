// Better Auth client (browser-side). Used by sign-in / sign-out UI.
"use client";
import { createAuthClient } from "better-auth/react";
import { magicLinkClient } from "better-auth/client/plugins";

export const authClient = createAuthClient({
  baseURL: typeof window !== "undefined" ? window.location.origin : undefined,
  plugins: [magicLinkClient()],
});
