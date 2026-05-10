-- PRD §7.4 — RLS policies (run after the initial drizzle-kit push)
-- Enables tenant isolation; FORCE ensures policy applies even to the table owner role.
-- IDEMPOTENT: safe to re-run. Branch A and Branch B share this Neon DB; whichever
-- migrates second must not crash. ENABLE/FORCE ROW LEVEL SECURITY are no-ops if
-- already set; CREATE POLICY is gated by DROP POLICY IF EXISTS.

ALTER TABLE decisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE decisions FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS decisions_tenant_isolation ON decisions;
CREATE POLICY decisions_tenant_isolation ON decisions
  FOR ALL
  USING (tenant_id::text = current_setting('app.current_tenant_id', true))
  WITH CHECK (tenant_id::text = current_setting('app.current_tenant_id', true));

ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenants FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenants_owner_only ON tenants;
CREATE POLICY tenants_owner_only ON tenants
  FOR ALL
  USING (owner_user_id = current_setting('app.current_user_id', true))
  WITH CHECK (owner_user_id = current_setting('app.current_user_id', true));

ALTER TABLE audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_events FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS audit_insert ON audit_events;
CREATE POLICY audit_insert ON audit_events
  FOR INSERT
  WITH CHECK (tenant_id::text = current_setting('app.current_tenant_id', true));

DROP POLICY IF EXISTS audit_select ON audit_events;
CREATE POLICY audit_select ON audit_events
  FOR SELECT
  USING (tenant_id::text = current_setting('app.current_tenant_id', true));

-- No UPDATE / DELETE policy = denies these operations entirely.

-- v2 multi-tenant policy upgrade (commented; uncomment when memberships table exists):
-- DROP POLICY decisions_tenant_isolation ON decisions;
-- CREATE POLICY decisions_tenant_isolation ON decisions FOR ALL
--   USING (
--     tenant_id::text = current_setting('app.current_tenant_id', true)
--     OR tenant_id IN (
--       SELECT tenant_id FROM memberships
--       WHERE user_id = current_setting('app.current_user_id', true)
--     )
--   )
--   WITH CHECK (tenant_id::text = current_setting('app.current_tenant_id', true));
