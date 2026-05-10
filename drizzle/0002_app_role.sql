-- 0002 — Provision the dedicated app_user role with NOBYPASSRLS.
--
-- Why: Neon's default neondb_owner role has rolbypassrls=true, which silently
-- skips FORCE ROW LEVEL SECURITY policies. The app runtime pool MUST connect
-- as a role without BYPASSRLS so that the policies in 0001_enable_rls.sql
-- actually defend against cross-tenant reads.
--
-- Verified 2026-05-10: T-08 (tests/rls-isolation.test.ts) returned cross-tenant
-- rows when the pool connected as neondb_owner. Switching to app_user (created
-- here) made the policy effective.
--
-- This migration is idempotent: re-running it does NOT rotate the password.
-- The password is supplied via the APP_USER_PASSWORD psql variable (or environment).
-- Production deploys: pre-create the role manually in Neon Console once, then
-- skip this file in production migrations.

DO $$
DECLARE
  pwd text := current_setting('app.app_user_password', true);
BEGIN
  IF pwd IS NULL OR pwd = '' THEN
    RAISE NOTICE '0002_app_role: app.app_user_password not set; skipping role creation. Provision app_user manually.';
    RETURN;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_user') THEN
    EXECUTE format('CREATE ROLE app_user LOGIN PASSWORD %L NOBYPASSRLS', pwd);
  ELSE
    EXECUTE format('ALTER ROLE app_user WITH LOGIN PASSWORD %L NOBYPASSRLS', pwd);
  END IF;
END $$;

-- Grant the privileges app_user needs. Default privileges cover Better Auth's
-- auto-generated tables (users, sessions, accounts, verification) so we don't
-- have to re-grant after auth runs its first sync.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_user') THEN
    GRANT USAGE ON SCHEMA public TO app_user;
    GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_user;
    GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app_user;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public
      GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_user;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public
      GRANT USAGE, SELECT ON SEQUENCES TO app_user;
  END IF;
END $$;
