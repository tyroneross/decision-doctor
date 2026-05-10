-- Drop our legacy singular better-auth tables (we own them; they're empty).
-- Branch B 2026-05-10 — Branch A's plural tables are canonical.
DROP TABLE IF EXISTS "verification" CASCADE;
DROP TABLE IF EXISTS "account" CASCADE;
DROP TABLE IF EXISTS "session" CASCADE;
DROP TABLE IF EXISTS "user" CASCADE;
