-- PRD §7.4 — RLS policies (run after the initial drizzle-kit push)
-- IDEMPOTENT: safe to re-run. Branch A and Branch B share this Neon DB; whichever
-- migrates second must not crash. ENABLE/FORCE ROW LEVEL SECURITY are no-ops if
-- already set; CREATE POLICY is gated by DROP POLICY IF EXISTS.
--
-- POLICIES MIRROR LIVE NEON STATE (verified 2026-05-10 post-Branch-A run):
--   * `decisions_tenant_isolation` and `audit_select` enforce BOTH tenant_id
--     AND user_id (defense in depth — a tenant member should not see another
--     member's decisions in v2 multi-tenant).
--   * `decisions_share_read` allows public reads when share_token is set, so
--     unauthenticated /share/<token> pages work without disabling RLS.
--   * `tenants_owner_only` keeps the ::text cast — owner_user_id is `uuid`,
--     current_setting() returns text; without the cast the equality crashes.
--
-- Required runtime context (set per actor txn — see lib/db/actor.ts):
--   * connection role: `app_user` (NOBYPASSRLS); the owner role bypasses RLS.
--   * GUCs:  app.current_user_id, app.current_tenant_id (transaction-local).

ALTER TABLE decisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE decisions FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS decisions_tenant_isolation ON decisions;
CREATE POLICY decisions_tenant_isolation ON decisions
  FOR ALL
  USING (
    (tenant_id::text = current_setting('app.current_tenant_id', true))
    AND (user_id::text = current_setting('app.current_user_id', true))
  )
  WITH CHECK (
    (tenant_id::text = current_setting('app.current_tenant_id', true))
    AND (user_id::text = current_setting('app.current_user_id', true))
  );

-- Public share read: any decision with a share_token may be SELECTed by anyone.
-- The /share/<token> route additionally HMAC-verifies the token before render.
DROP POLICY IF EXISTS decisions_share_read ON decisions;
CREATE POLICY decisions_share_read ON decisions
  FOR SELECT
  USING (share_token IS NOT NULL);

ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenants FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenants_owner_only ON tenants;
CREATE POLICY tenants_owner_only ON tenants
  FOR ALL
  USING (owner_user_id::text = current_setting('app.current_user_id', true))
  WITH CHECK (owner_user_id::text = current_setting('app.current_user_id', true));

ALTER TABLE audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_events FORCE ROW LEVEL SECURITY;

-- Audit events: insert OK for the actor; SELECT only own (tenant, user); never UPDATE/DELETE
DROP POLICY IF EXISTS audit_insert ON audit_events;
CREATE POLICY audit_insert ON audit_events
  FOR INSERT
  WITH CHECK (tenant_id::text = current_setting('app.current_tenant_id', true));

DROP POLICY IF EXISTS audit_select ON audit_events;
CREATE POLICY audit_select ON audit_events
  FOR SELECT
  USING (
    (tenant_id::text = current_setting('app.current_tenant_id', true))
    AND (user_id::text = current_setting('app.current_user_id', true))
  );

-- No UPDATE / DELETE policy = denies these operations entirely.

-- v2 multi-tenant policy upgrade (commented; uncomment when memberships table exists):
-- DROP POLICY decisions_tenant_isolation ON decisions;
-- CREATE POLICY decisions_tenant_isolation ON decisions FOR ALL
--   USING (
--     tenant_id::text = current_setting('app.current_tenant_id', true)
--     OR tenant_id IN (
--       SELECT tenant_id FROM memberships
--       WHERE user_id::text = current_setting('app.current_user_id', true)
--     )
--   )
--   WITH CHECK (tenant_id::text = current_setting('app.current_tenant_id', true));
