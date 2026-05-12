# Google OAuth Setup

Decision Doctor uses Better Auth for Google sign-in. The app route is already
wired at `/api/auth/[...all]`; Google redirects back to Better Auth's callback.

Source: https://better-auth.com/docs/authentication/google

Do not run `npx auth init` to add Google to this repo. That command scaffolds a
new Better Auth setup and can overwrite the existing custom `lib/auth.ts`
configuration. This repo already has Better Auth, Neon, Drizzle, magic links,
email/password, and the route handler wired.

## Google Cloud Console

Create an OAuth 2.0 Web application client in Google Cloud Console:

1. Configure the OAuth consent screen first.
2. Add local authorized redirect URI:
   `http://localhost:3006/api/auth/callback/google`
3. Add production authorized redirect URI:
   `https://<app-domain>/api/auth/callback/google`
4. Add the current Vercel alias and any custom production domain as separate
   exact redirect URIs.
5. Copy the client ID and client secret into the app environment.

Use separate Google Cloud projects for development and production when this
moves beyond local testing.

## Environment

```env
GOOGLE_CLIENT_ID=000000000000-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-xxxxxxxxxxxxxxxxxxxxxxxx
BETTER_AUTH_URL=http://localhost:3006
```

For production, `BETTER_AUTH_URL` must be the deployed app origin that Google
uses for the callback URL. The redirect path must be exact:

```text
https://<app-domain>/api/auth/callback/google
```

The app allows Google credentials to be absent in local development. If one of
`GOOGLE_CLIENT_ID` or `GOOGLE_CLIENT_SECRET` is set, both must be set.

## Verification

1. Start the app with both Google env vars present.
2. Open `/sign-in`.
3. Click `Continue with Google`.
4. Confirm Google redirects to `/api/auth/callback/google`.
5. Confirm the app lands on `/app`.
6. Confirm a `users` row and a `tenants` row exist for the signed-in email.

Better Auth requests the default `openid email profile` scopes and is configured
with `accessType: "offline"` plus `prompt: "select_account consent"` so Google
can issue a refresh token when durable Google access is needed later.
