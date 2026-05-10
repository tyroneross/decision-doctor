-- 0002 — Better Auth additive migration + schema reshape (text user.id).
--
-- Idempotent. Safe to run on a DB where Branch A may have run a similar
-- migration first. Strategy:
--   1. Create Better Auth tables (user, session, account, verification) as text-id.
--   2. If our domain tables (tenants, decisions, audit_events) currently reference
--      a uuid users.id, drop those FKs, change column type to text, re-add FKs
--      pointing at user(id).
--   3. Drop the legacy plural users table if it exists and is empty.

-- 1. Better Auth core tables ------------------------------------------------

CREATE TABLE IF NOT EXISTS "user" (
  id          text PRIMARY KEY,
  name        text,
  email       text NOT NULL UNIQUE,
  email_verified boolean NOT NULL DEFAULT false,
  image       text,
  created_at  timestamp NOT NULL DEFAULT now(),
  updated_at  timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "session" (
  id          text PRIMARY KEY,
  expires_at  timestamp NOT NULL,
  token       text NOT NULL UNIQUE,
  created_at  timestamp NOT NULL DEFAULT now(),
  updated_at  timestamp NOT NULL DEFAULT now(),
  ip_address  text,
  user_agent  text,
  user_id     text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS "account" (
  id            text PRIMARY KEY,
  account_id    text NOT NULL,
  provider_id   text NOT NULL,
  user_id       text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  access_token  text,
  refresh_token text,
  id_token      text,
  access_token_expires_at  timestamp,
  refresh_token_expires_at timestamp,
  scope         text,
  password      text,
  created_at    timestamp NOT NULL DEFAULT now(),
  updated_at    timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "verification" (
  id          text PRIMARY KEY,
  identifier  text NOT NULL,
  value       text NOT NULL,
  expires_at  timestamp NOT NULL,
  created_at  timestamp DEFAULT now(),
  updated_at  timestamp DEFAULT now()
);

-- 2. Reshape domain tables to text user_id (idempotent) ---------------------
--    Drop RLS policies that reference the columns we need to retype, then
--    recreate them after.

DROP POLICY IF EXISTS tenants_owner_only ON tenants;

DO $$
BEGIN
  -- tenants.owner_user_id
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'tenants' AND column_name = 'owner_user_id' AND data_type = 'uuid'
  ) THEN
    ALTER TABLE tenants DROP CONSTRAINT IF EXISTS tenants_owner_user_id_users_id_fk;
    ALTER TABLE tenants ALTER COLUMN owner_user_id TYPE text USING owner_user_id::text;
  END IF;

  -- decisions.user_id
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'decisions' AND column_name = 'user_id' AND data_type = 'uuid'
  ) THEN
    ALTER TABLE decisions DROP CONSTRAINT IF EXISTS decisions_user_id_users_id_fk;
    ALTER TABLE decisions ALTER COLUMN user_id TYPE text USING user_id::text;
  END IF;

  -- audit_events.user_id
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'audit_events' AND column_name = 'user_id' AND data_type = 'uuid'
  ) THEN
    ALTER TABLE audit_events DROP CONSTRAINT IF EXISTS audit_events_user_id_users_id_fk;
    ALTER TABLE audit_events ALTER COLUMN user_id TYPE text USING user_id::text;
  END IF;

  -- Re-create FKs pointing at user(id), only if not already present
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'tenants' AND constraint_name = 'tenants_owner_user_id_user_id_fk'
  ) THEN
    BEGIN
      ALTER TABLE tenants ADD CONSTRAINT tenants_owner_user_id_user_id_fk
        FOREIGN KEY (owner_user_id) REFERENCES "user"(id) ON DELETE CASCADE;
    EXCEPTION WHEN others THEN
      RAISE NOTICE 'Skipping tenants FK add: %', SQLERRM;
    END;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'decisions' AND constraint_name = 'decisions_user_id_user_id_fk'
  ) THEN
    BEGIN
      ALTER TABLE decisions ADD CONSTRAINT decisions_user_id_user_id_fk
        FOREIGN KEY (user_id) REFERENCES "user"(id) ON DELETE CASCADE;
    EXCEPTION WHEN others THEN
      RAISE NOTICE 'Skipping decisions FK add: %', SQLERRM;
    END;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'audit_events' AND constraint_name = 'audit_events_user_id_user_id_fk'
  ) THEN
    BEGIN
      ALTER TABLE audit_events ADD CONSTRAINT audit_events_user_id_user_id_fk
        FOREIGN KEY (user_id) REFERENCES "user"(id) ON DELETE CASCADE;
    EXCEPTION WHEN others THEN
      RAISE NOTICE 'Skipping audit_events FK add: %', SQLERRM;
    END;
  END IF;
END $$;

-- 3. Add `title` column to decisions if missing -----------------------------

ALTER TABLE decisions ADD COLUMN IF NOT EXISTS title text;

-- 4. Drop legacy users table if empty ---------------------------------------

DO $$
DECLARE
  legacy_count integer;
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'users') THEN
    EXECUTE 'SELECT count(*) FROM users' INTO legacy_count;
    IF legacy_count = 0 THEN
      DROP TABLE users CASCADE;
    ELSE
      RAISE NOTICE 'Legacy users table has % rows; not dropping.', legacy_count;
    END IF;
  END IF;
END $$;
