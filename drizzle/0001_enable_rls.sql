-- PRD §7.4 — RLS policies (run after the initial drizzle-kit push)
-- Enables tenant isolation; FORCE ensures policy applies even to the table owner role.

ALTER TABLE decisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE decisions FORCE ROW LEVEL SECURITY;

CREATE POLICY decisions_tenant_isolation ON decisions
  FOR ALL
  USING (
    tenant_id::text = current_setting('app.current_tenant_id', true)
    AND user_id::text = current_setting('app.current_user_id', true)
  )
  WITH CHECK (
    tenant_id::text = current_setting('app.current_tenant_id', true)
    AND user_id::text = current_setting('app.current_user_id', true)
  );

CREATE POLICY decisions_share_read ON decisions
  FOR SELECT
  USING (share_token IS NOT NULL);

ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenants FORCE ROW LEVEL SECURITY;

CREATE POLICY tenants_owner_only ON tenants
  FOR ALL
  USING (owner_user_id::text = current_setting('app.current_user_id', true))
  WITH CHECK (owner_user_id::text = current_setting('app.current_user_id', true));

ALTER TABLE audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_events FORCE ROW LEVEL SECURITY;

-- Audit events: insert OK for the actor; SELECT only own tenant's events; never UPDATE/DELETE
CREATE POLICY audit_insert ON audit_events
  FOR INSERT
  WITH CHECK (
    tenant_id::text = current_setting('app.current_tenant_id', true)
    AND user_id::text = current_setting('app.current_user_id', true)
  );

CREATE POLICY audit_select ON audit_events
  FOR SELECT
  USING (
    tenant_id::text = current_setting('app.current_tenant_id', true)
    AND user_id::text = current_setting('app.current_user_id', true)
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
