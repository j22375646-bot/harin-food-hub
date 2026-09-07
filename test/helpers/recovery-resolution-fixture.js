'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const USER = '20000000-0000-4000-8000-000000000001';
const OPERATOR = '20000000-0000-4000-8000-000000000002';
const OTHER = '20000000-0000-4000-8000-000000000003';
const OPERATION = '50000000-0000-4000-8000-000000000001';
const RESOLUTION = '60000000-0000-4000-8000-000000000001';
const CANDIDATE = 'lib/tenancy/sql/recovery-review-resolution.sql';
const root = path.join(__dirname, '../..');
async function exec(db, sql) {return typeof db.exec === 'function' ? db.exec(sql) : db.query(sql);}
async function install(db) {
  for (const file of [
    'supabase/migrations/20260812182508_add_dashboard_accounts_and_rbac.sql',
    'lib/tenancy/sql/auth-session-fence.sql', 'lib/tenancy/sql/recovery-review.sql', CANDIDATE,
  ]) await exec(db, await fs.readFile(path.join(root, file), 'utf8'));
}
async function seed(db) {
  await exec(db, `insert into auth.users(id) values('${USER}'),('${OPERATOR}'),('${OTHER}');
    insert into public.dashboard_users(user_id,email,username,display_name,role) values
      ('${USER}','owner@example.test','owner','Synthetic owner','OWNER'),
      ('${OPERATOR}','operator@example.test','operator','Synthetic internal operator','VIEWER'),
      ('${OTHER}','other@example.test','other','Synthetic other','OWNER');
    insert into moaon_auth.account_state(user_id) values('${USER}'),('${OTHER}');
    insert into moaon_auth.recovery_operators values('${OPERATOR}');
    select public.moaon_start_recovery_review('${USER}','${OPERATION}');`);
}
async function inspect(db, {operatorId = OPERATOR, userId = USER, operationId = OPERATION} = {}) {
  return (await db.query('select public.moaon_inspect_recovery_review($1,$2,$3) as result',
    [operatorId, userId, operationId])).rows[0].result;
}
async function resolve(db, {operatorId = OPERATOR, userId = USER, operationId = OPERATION,
  resolutionId = RESOLUTION, expectedVersion, action = 'CLOSE_NOT_STARTED'} = {}) {
  return (await db.query('select public.moaon_resolve_recovery_review($1,$2,$3,$4,$5,$6) as result',
    [operatorId, userId, operationId, resolutionId, expectedVersion, action])).rows[0].result;
}
async function preservedState(db) {
  const result = {};
  for (const table of ['auth.users', 'public.dashboard_users', 'public.dashboard_sessions',
    'moaon_auth.account_state', 'moaon_auth.password_changes', 'moaon_auth.login_tickets']) {
    result[table] = (await db.query(`select coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text),'[]') as data from ${table} t`)).rows[0].data;
  }
  return result;
}
module.exports = {USER, OPERATOR, OTHER, OPERATION, RESOLUTION, CANDIDATE, root, exec, install, seed, inspect, resolve, preservedState};
