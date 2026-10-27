-- Internal schema-cache initialization must not inherit the 8s request budget.
-- Keep the effective service API request timeout unchanged at 8s explicitly.
-- anon=3s, authenticated=8s and lock_timeout are intentionally unchanged.
ALTER ROLE service_role SET statement_timeout = '8s';
ALTER ROLE authenticator SET statement_timeout = '120s';
NOTIFY pgrst, 'reload config';
NOTIFY pgrst, 'reload schema';

-- Rollback (pre-change service_role had no explicit timeout):
-- ALTER ROLE authenticator SET statement_timeout = '8s';
-- ALTER ROLE service_role RESET statement_timeout;
-- NOTIFY pgrst, 'reload config';
