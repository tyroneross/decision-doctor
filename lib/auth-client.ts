// PRD §9 — Better Auth client (React).
// Both methods exposed: emailAndPassword (signIn.email / signUp.email)
// and magicLink (signIn.magicLink).
"use client";

import { createAuthClient } from "better-auth/react";
import { magicLinkClient } from "better-auth/client/plugins";

// During SSR static prerender there is no `window`, and Vercel Sensitive
// env vars (BETTER_AUTH_URL among them) are not exposed to the build
// sandbox. Better Auth's client falls through to `""` in that case and
// throws `Invalid base URL`. Provide a valid SSR-only sentinel so the
// `/sign-in` page prerender doesn't crash; browsers still use their
// actual origin so preview URLs that differ from BETTER_AUTH_URL keep
// working. The sentinel never gets used for real HTTP calls — those
// only fire client-side in response to user actions.
const authClientBaseURL =
  typeof window !== "undefined"
    ? window.location.origin
    : "http://localhost:3000";

export const authClient = createAuthClient({
  baseURL: authClientBaseURL,
  plugins: [magicLinkClient()],
});

export const { signIn, signUp, signOut, useSession } = authClient;
