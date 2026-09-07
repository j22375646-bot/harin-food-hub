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
const name = `moaon_test_recovery_admission_${process.pid}_${randomBytes(4).toString('hex')}`;
if (!/^moaon_test_recovery_admission_[0-9]+_[0-9a-f]{8}$/.test(name)) {
  throw Error('Unsafe test database name.');
}
const config = {ssl: false, max: 4, connectionTimeoutMillis: 2000, statement_timeout: 5000, allowExitOnIdle: true};
const supervisor = new Pool({...config, max: 2, connectionString: url.toString()});
let pool;
let created = false;
const roles = [];
const OPERATOR = '20000000-0000-4000-8000-000000000002';
const OTHER = '20000000-0000-4000-8000-000000000003';
const SESSION = '30000000-0000-4000-8000-000000000001';
const OTHER_SESSION = '30000000-0000-4000-8000-000000000003';
const GLOBAL = '00000000-0000-0000-0000-000000000000';

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
    'lib/tenancy/sql/recovery-review-resolution.sql',
    'lib/tenancy/sql/recovery-review-admission.sql',
  ]) await pool.query(await fs.readFile(path.join(__dirname, '../..', file), 'utf8'));
});

test.after(async () => {
  const errors = [];
  try { if (pool) await pool.end(); } catch (error) { errors.push(error); }
  let dropped = !created;
  if (created) {
    try { await supervisor.query(`drop database "${name}"`); dropped = true; } catch (error) { errors.push(error); }
  }
  if (dropped) for (const role of roles.reverse()) {
    try { await supervisor.query(`drop role ${role}`); } catch (error) { errors.push(error); }
  }
  try { await supervisor.end(); } catch (error) { errors.push(error); }
  if (errors.length) throw new AggregateError(errors, 'Disposable recovery-admission resources could not be cleaned up.');
});

test.beforeEach(async () => {
  await pool.query(`truncate moaon_auth.recovery_request_limits, moaon_auth.recovery_operators,
    public.dashboard_sessions, public.dashboard_users, auth.users cascade;
    insert into auth.users(id) values('${OPERATOR}'),('${OTHER}');
    insert into public.dashboard_users(user_id,email,username,display_name,role) values
      ('${OPERATOR}','operator@example.test','operator','Synthetic operator','VIEWER'),
      ('${OTHER}','other@example.test','other','Synthetic other','VIEWER');
    insert into moaon_auth.recovery_operators(user_id) values('${OPERATOR}'),('${OTHER}');
    insert into public.dashboard_sessions
      (id,user_id,token_hash,username,display_name,role,expires_at,last_seen_at) values
      ('${SESSION}','${OPERATOR}','${'a'.repeat(64)}','operator','Synthetic operator','VIEWER',clock_timestamp()+interval '1 hour',clock_timestamp()),
      ('${OTHER_SESSION}','${OTHER}','${'b'.repeat(64)}','other','Synthetic other','VIEWER',clock_timestamp()+interval '1 hour',clock_timestamp());`);
});

async function consume(client, operatorId = OPERATOR, sessionId = SESSION, mode = 'inspect') {
  return (await client.query('select public.moaon_consume_recovery_review($1,$2,$3) as allowed',
    [operatorId, sessionId, mode])).rows[0].allowed;
}

async function counters(mode = 'inspect') {
  return (await pool.query(`select scope,subject_id::text as subject_id,used
    from moaon_auth.recovery_request_limits where mode=$1 order by scope,subject_id`, [mode])).rows;
}

async function waitForLock(pid) {
  const until = Date.now() + 2000;
  while (Date.now() < until) {
    const result = await supervisor.query('select wait_event_type from pg_stat_activity where pid=$1', [pid]);
    if (result.rows[0]?.wait_event_type === 'Lock') return;
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  assert.fail('Competing recovery admission was not observed waiting for the quota lock.');
}

test('native separate connections allow only one operator request at the final inspect slot', async () => {
  await pool.query(`insert into moaon_auth.recovery_request_limits(scope,subject_id,mode,used) values
    ('GLOBAL',$1,'inspect',29),('OPERATOR',$2,'inspect',29)`, [GLOBAL, OPERATOR]);
  const first = await pool.connect();
  const second = await pool.connect();
  try {
    const decisions = await Promise.all([consume(first), consume(second)]);
    assert.deepEqual(decisions.sort(), [false, true]);
  } finally {
    first.release();
    second.release();
  }
  assert.deepEqual(await counters(), [
    {scope: 'GLOBAL', subject_id: GLOBAL, used: 30},
    {scope: 'OPERATOR', subject_id: OPERATOR, used: 30},
  ]);
});

test('native GLOBAL final slot is shared across operators without a partial operator charge', async () => {
  await pool.query(`insert into moaon_auth.recovery_request_limits(scope,subject_id,mode,used) values
    ('GLOBAL',$1,'inspect',299),('OPERATOR',$2,'inspect',0),('OPERATOR',$3,'inspect',0)`,
  [GLOBAL, OPERATOR, OTHER]);
  const first = await pool.connect();
  const second = await pool.connect();
  try {
    const decisions = await Promise.all([
      consume(first),
      consume(second, OTHER, OTHER_SESSION),
    ]);
    assert.deepEqual(decisions.sort(), [false, true]);
  } finally {
    first.release();
    second.release();
  }
  const rows = await counters();
  assert.equal(rows[0].used, 300);
  assert.equal(rows[1].used + rows[2].used, 1);
});

test('native elapsed windows reset while unauthorized and revoked sessions change no counter', async () => {
  await pool.query(`insert into moaon_auth.recovery_request_limits(scope,subject_id,mode,started_at,used) values
    ('GLOBAL',$1,'resolve',clock_timestamp()-interval '60 seconds',100),
    ('OPERATOR',$2,'resolve',clock_timestamp()-interval '60 seconds',10)`, [GLOBAL, OPERATOR]);
  assert.equal(await consume(pool, OPERATOR, SESSION, 'resolve'), true);
  assert.deepEqual(await counters('resolve'), [
    {scope: 'GLOBAL', subject_id: GLOBAL, used: 1},
    {scope: 'OPERATOR', subject_id: OPERATOR, used: 1},
  ]);

  await pool.query('truncate moaon_auth.recovery_request_limits');
  await pool.query('delete from moaon_auth.recovery_operators where user_id=$1', [OPERATOR]);
  await assert.rejects(() => consume(pool), /RECOVERY_REVIEW_RESOLUTION_REJECTED/);
  assert.deepEqual(await counters(), []);
  await pool.query('insert into moaon_auth.recovery_operators(user_id) values($1)', [OPERATOR]);
  await pool.query('update public.dashboard_sessions set revoked_at=clock_timestamp() where id=$1', [SESSION]);
  await assert.rejects(() => consume(pool), /RECOVERY_REVIEW_ADMISSION_REJECTED/);
  assert.deepEqual(await counters(), []);
});

test('native session expiry while waiting for GLOBAL quota aborts without a counter change', async () => {
  await pool.query(`update public.dashboard_sessions set expires_at=clock_timestamp()+interval '500 milliseconds'
    where id=$1`, [SESSION]);
  await pool.query(`insert into moaon_auth.recovery_request_limits(scope,subject_id,mode,used)
    values('GLOBAL',$1,'inspect',0)`, [GLOBAL]);
  const blocker = await pool.connect();
  const waiting = await pool.connect();
  try {
    await blocker.query('begin');
    await blocker.query(`select 1 from moaon_auth.recovery_request_limits
      where scope='GLOBAL' and subject_id=$1 and mode='inspect' for update`, [GLOBAL]);
    const pid = (await waiting.query('select pg_backend_pid() as pid')).rows[0].pid;
    const pending = consume(waiting).then(value => ({value}), error => ({error}));
    await waitForLock(pid);
    await new Promise(resolve => setTimeout(resolve, 550));
    await blocker.query('commit');
    const result = await pending;
    assert.match(result.error?.message || '', /RECOVERY_REVIEW_ADMISSION_REJECTED/);
  } finally {
    try { await blocker.query('rollback'); } catch (_error) {}
    blocker.release();
    waiting.release();
  }
  assert.deepEqual(await counters(), [{scope: 'GLOBAL', subject_id: GLOBAL, used: 0}]);
});
