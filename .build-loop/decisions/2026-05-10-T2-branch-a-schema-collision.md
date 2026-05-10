# 2026-05-10 — Branch A pushed schema; Branch B adopts plural-table convention

## Observation

Mid-build, Branch A pushed a schema migration to the shared Neon DB that:
- Re-created `users` (plural) with uuid PK + `email_verified boolean` + `name text default ''`
- Created `accounts`, `sessions`, `verifications` (all plural) with uuid PKs
- Reverted `tenants.owner_user_id`, `decisions.user_id`, `audit_events.user_id` to uuid (FK to users.id)
- Created a `decisions_share_read` policy `USING (share_token IS NOT NULL)` — broadly permissive

This collided with Branch B's just-applied additive migration which used Better Auth's
default table names (singular: `user`, `session`, `account`, `verification` with text PKs).

## Decision

Adopt Branch A's plural-table + uuid-PK convention. Reshape Branch B's `lib/db/schema.ts`
to match. Configure Better Auth's drizzleAdapter with custom modelName / fields so
Better Auth uses our plural names.

## Why

- Tenant_id RLS isolation works regardless of table-name convention. Schema convergence
  benefits both branches (they can share auth users; useful for hackathon demo with one
  account that works on either branch).
- Branch A's path requires fewer commits net (text→uuid back-revert was the wasted churn).
- Better Auth fully supports custom table names via the adapter's `schema` option.
- Branch A's permissive `decisions_share_read` policy works for OUR share view too.

## Implementation

1. Rewrite `lib/db/schema.ts` — plural tables, uuid PKs, drop my `user`/etc.
2. Drop my legacy `user`/`session`/`account`/`verification` tables (Branch B's earlier
   additive migration). Keep them coexisting for a few minutes is fine but cleaner to drop.
3. Configure Better Auth with `usePlural: true` (or per-model modelName overrides).
4. Re-apply RLS using app_user role + GUC pattern.

## Risk

If Branch A pushes again, they may further reshape. Will document and adapt; this is
the inherent risk of two-branch concurrent build against shared DB.
