# Railway Assessment

## Recommendation

Do not move Branch C to Railway right now. Railway is viable for Decision Doctor,
but it is not needed for this branch's current P0 workflow.

Use Railway later if the app needs a single operational project containing
Next.js, Postgres, Redis, workers, storage buckets, or long-running background
services. For this branch, keeping the current Next.js + Neon + external API
shape avoids an unnecessary infrastructure migration while other build-loop
branches are still coordinating shared database state.

## Current fit

What Railway supports:

- Railway's official Next.js guide supports deploying from GitHub, CLI, or a
  Dockerfile and connecting Postgres with `DATABASE_URL`.
- Railway's full-stack guide supports a single project with Next.js, Postgres,
  Redis, workers, and storage buckets for production SaaS-style apps.
- Railway pricing is base subscription plus actual resource usage. As of the
  checked docs, Hobby is listed at $5/month and Pro at $20/month, with the plan
  fee counting toward included usage.

What this repo currently needs:

- A Next.js app runtime.
- A Postgres-compatible `DATABASE_URL` already aimed at Neon.
- External Groq and Resend variables.
- No required background worker, queue, object storage, or co-located service
  added by Branch C.

## Deployment implications

Railway deployment would require extra app configuration before production:

- Add `output: "standalone"` to `next.config.ts`.
- Confirm the `start` script serves the standalone Next server.
- Configure Railway variables for `DATABASE_URL`, `BETTER_AUTH_SECRET`,
  `BETTER_AUTH_URL`, `GROQ_API_KEY`, `RESEND_API_KEY`, and sender email.
- Decide whether Railway Postgres replaces Neon or only hosts the app. Replacing
  Neon should wait until the shared DB ownership issue is settled across
  Branch A/B/C.
- Add a pre-deploy migration command only after migration ownership is
  coordinated.

## Local preflight

- Railway CLI is installed: `railway 4.44.0`.
- This checkout is not linked to a Railway project.
- `railway status --json` could not refresh OAuth because network is restricted
  in this sandbox, then reported no linked project.

## Sources checked

- https://docs.railway.com/guides/nextjs
- https://docs.railway.com/guides/fullstack-nextjs
- https://docs.railway.com/pricing/plans
