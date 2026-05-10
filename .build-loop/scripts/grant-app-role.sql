-- Make neondb_owner a member of app_user so SET ROLE app_user works.
GRANT app_user TO neondb_owner;
SELECT pg_catalog.pg_roles.rolname, pg_auth_members.admin_option, am.rolname AS member_of
  FROM pg_auth_members
  JOIN pg_catalog.pg_roles ON pg_catalog.pg_roles.oid = pg_auth_members.member
  JOIN pg_catalog.pg_roles am ON am.oid = pg_auth_members.roleid
  WHERE pg_catalog.pg_roles.rolname IN ('neondb_owner','app_user');
