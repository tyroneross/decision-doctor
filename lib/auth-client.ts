// PRD §9 — Better Auth client (React).
// Both methods exposed: emailAndPassword (signIn.email / signUp.email)
// and magicLink (signIn.magicLink).
"use client";

import { createAuthClient } from "better-auth/react";
import { magicLinkClient } from "better-auth/client/plugins";

export const authClient = createAuthClient({
  // baseURL omitted — defaults to window.location.origin. Setting it explicitly
  // would break Vercel preview URLs that diverge from BETTER_AUTH_URL.
  plugins: [magicLinkClient()],
});

export const { signIn, signUp, signOut, useSession } = authClient;
