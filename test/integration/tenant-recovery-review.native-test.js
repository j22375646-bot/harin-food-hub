'use strict';
// Explicit opt-in, disposable loopback PostgreSQL only; excluded from the default glob.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const {randomBytes} = require('node:crypto');
const {Pool} = require('pg');

const url = new URL(process.env.MOAON_AUTH_TEST_POSTGRES_URL || 'invalid:');
if (!['postgres:', 'postgresql:'].includes(url.protocol) || url.hostname !== '127.0.0.1'
  || url.port !== '55437' || url.username !== 'moaon_test_admin' || !url.password
  || url.pathname !== '/postgres' || url.search || url.hash) {
  throw Error('An explicit isolated loopback test cluster URL is required.');
}
const name = `moaon_test_recovery_review_${process.pid}_${randomBytes(4).toString('hex')}`;
if (!/^moaon_test_recovery_review_[0-9]+_[0-9a-f]{8}$/.test(name)) throw Error('Unsafe test database name.');
const config = {ssl: false, max: 4, connectionTimeoutMillis: 2000, statement_timeout: 5000, allowExitOnIdle: true};
const supervisor = new Pool({...config, max: 2, connectionString: url.toString()});
let pool;
let created = false;
const roles = [];
const USER = '20000000-0000-4000-8000-000000000001';
const OPERATION = '50000000-0000-4000-8000-000000000001';

test.before(async () => {
  for (const role of ['anon', 'authenticated', 'service_role']) {
    const found = await supervisor.query('select 1 from pg_roles where rolname=$1', [role]);
    if (!found.rowCount) {
      await supervisor.query(`create role ${role}${role === 'service_role' ? ' bypassrls' : ''}`);
      roles.push(role);
    }
  }
  await supervisor.query(`create database "${name}"`);
  created = true;
  url.pathname = `/${name}`;
  pool = new Pool({...config, connectionString: url.toString()});
  await pool.query('create schema auth; create table auth.users(id uuid primary key)');
  for (const file of [
    'supabase/migrations/20260812182508_add_dashboard_accounts_and_rbac.sql',
    'lib/tenancy/sql/auth-session-fence.sql',
    'lib/tenancy/sql/recovery-review.sql',
  ]) await pool.query(await fs.readFile(path.join(__dirname, '../..', file), 'utf8'));
});

test.after(async () => {
  const errors = [];
  try {if (pool) await pool.end();} catch (error) {errors.push(error);}
  let dropped = !created;
  if (created) {
    try {await supervisor.query(`drop database "${name}"`); dropped = true;} catch (error) {errors.push(error);}
  }
  if (dropped) for (const role of roles.reverse()) {
    try {await supervisor.query(`drop role ${role}`);} catch (error) {errors.push(error);}
  }
  try {await supervisor.end();} catch (error) {errors.push(error);}
  if (errors.length) throw new AggregateError(errors, 'Disposable recovery-review resources could not be cleaned up.');
});

test.beforeEach(async () => {
  await pool.query(`truncate auth.users cascade;
    insert into auth.users values('${USER}');
    insert into public.dashboard_users(user_id,email,username,display_name,role)
      values('${USER}','synthetic@example.test','synthetic','Synthetic','OWNER');
    insert into moaon_auth.account_state(user_id) values('${USER}');
    select public.moaon_start_recovery_review('${USER}','${OPERATION}');`);
});

async function waitForLock(pid) {
  const until = Date.now() + 2000;
  while (Date.now() < until) {
    const result = await pool.query('select wait_event_type from pg_stat_activity where pid=$1', [pid]);
    if (result.rows[0]?.wait_event_type === 'Lock') return;
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  assert.fail('Competing recovery classification was not observed waiting for the account lock.');
}

async function outcome(promise) {
  return promise.then(result => ({result}), error => ({error}));
}

test('an uncommitted begin wins before reject and cannot be classified REJECTED', async context => {
  let first;
  let second;
  let pending;
  try {
    first = await pool.connect();
    second = await pool.connect();
    const waitingPid = (await second.query('select pg_backend_pid() as pid')).rows[0].pid;
    await first.query('begin');
    await first.query('select public.moaon_begin_password_change($1,$2)', [USER, OPERATION]);
    pending = outcome(second.query('select public.moaon_reject_recovery_review($1,$2)', [USER, OPERATION]));
    await waitForLock(waitingPid);
    await first.query('commit');
    const result = await pending;
    assert.match(result.error?.message || '', /RECOVERY_REVIEW_REJECTED/);
    assert.deepEqual((await pool.query('select status from moaon_auth.recovery_reviews')).rows, [{status: 'PENDING'}]);
    assert.deepEqual((await pool.query('select blocked from moaon_auth.account_state')).rows, [{blocked: true}]);
    context.diagnostic(`observed waiting backend pid=${waitingPid}`);
  } finally {
    if (first) {await first.query('rollback'); first.release();}
    if (pending) await pending;
    if (second) second.release();
  }
});

test('a committed reject wins before begin and the rejected operation cannot start', async context => {
  let first;
  let second;
  let pending;
  try {
    first = await pool.connect();
    second = await pool.connect();
    const waitingPid = (await second.query('select pg_backend_pid() as pid')).rows[0].pid;
    await first.query('begin');
    assert.equal((await first.query('select public.moaon_reject_recovery_review($1,$2) as rejected', [USER, OPERATION])).rows[0].rejected, true);
    pending = outcome(second.query('select public.moaon_begin_password_change($1,$2)', [USER, OPERATION]));
    await waitForLock(waitingPid);
    await first.query('commit');
    const result = await pending;
    assert.equal(result.error?.message, 'AUTH_TRANSITION_REJECTED');
    assert.deepEqual((await pool.query('select status from moaon_auth.recovery_reviews')).rows, [{status: 'REJECTED'}]);
    assert.deepEqual((await pool.query('select blocked from moaon_auth.account_state')).rows, [{blocked: false}]);
    assert.equal((await pool.query('select count(*)::int as count from moaon_auth.password_changes')).rows[0].count, 0);
    context.diagnostic(`observed waiting backend pid=${waitingPid}`);
  } finally {
    if (first) {await first.query('rollback'); first.release();}
    if (pending) await pending;
    if (second) second.release();
  }
});

test('candidate trigger preserves the legacy no-journal password-change begin in the same database', async () => {
  const operation = '50000000-0000-4000-8000-000000000099';
  assert.equal((await pool.query(
    'select public.moaon_begin_password_change($1,$2) as began',
    [USER, operation]
  )).rows[0].began, true);
  assert.deepEqual((await pool.query(
    'select status from moaon_auth.password_changes where user_id=$1 and id=$2',
    [USER, operation]
  )).rows, [{status: 'PENDING'}]);
});

test('candidate unresolved index provides the millisecond LIMIT order without a Sort', async context => {
  const client = await pool.connect();
  try {
    await client.query('begin');
    await client.query('set local enable_seqscan=off; set local enable_bitmapscan=off');
    const explained = await client.query(
      `explain (costs off)
       select user_id,operation_id,status,stage,
         date_trunc('milliseconds',created_at at time zone 'UTC') created_at_ms,
         date_trunc('milliseconds',updated_at) updated_at_ms
       from moaon_auth.recovery_reviews
       where status in ('PENDING','REVIEW_REQUIRED')
       order by date_trunc('milliseconds',created_at at time zone 'UTC'),operation_id
       limit 1`
    );
    const plan = explained.rows.map(row => row['QUERY PLAN']).join('\n');
    assert.match(plan, /Index Scan using recovery_reviews_unresolved_idx/);
    assert.doesNotMatch(plan, /\bSort\b/);
    context.diagnostic(plan);
  } finally {
    await client.query('rollback');
    client.release();
  }
});
