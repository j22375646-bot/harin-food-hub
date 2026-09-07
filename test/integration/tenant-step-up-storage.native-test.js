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
const name = `moaon_test_step_up_${process.pid}_${randomBytes(4).toString('hex')}`;
if (!/^moaon_test_step_up_[0-9]+_[0-9a-f]{8}$/.test(name)) throw Error('Unsafe test database name.');
const config = {
  ssl: false, max: 6, connectionTimeoutMillis: 2000, statement_timeout: 5000, allowExitOnIdle: true,
};
const supervisor = new Pool({...config, max: 2, connectionString: url.toString()});
let pool;
let created = false;
const roles = [];
const USER = '11111111-1111-4111-8111-111111111111';
const SESSION = '55555555-5555-4555-8555-555555555555';
const PROVIDER_SESSION = '22222222-2222-4222-8222-222222222222';
const FACTOR = '33333333-3333-4333-8333-333333333333';
const FIRST = '66666666-6666-4666-8666-666666666666';
const SECOND = '77777777-7777-4777-8777-777777777777';
const RESET = '88888888-8888-4888-8888-888888888888';
const HASH = 'a'.repeat(64);
const ENVELOPE = {v: 1, keyId: 'native-key', iv: 'A'.repeat(16), ciphertext: 'AA', tag: 'A'.repeat(22)};

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
  await pool.query(`create schema auth;
    create table auth.users(id uuid primary key);
    create table auth.sessions(id uuid primary key,user_id uuid not null);
    create table auth.mfa_factors(id uuid primary key,user_id uuid not null,status text not null,factor_type text not null);`);
  for (const file of [
    'supabase/migrations/20260812182508_add_dashboard_accounts_and_rbac.sql',
    'lib/tenancy/sql/auth-session-fence.sql',
    'lib/tenancy/sql/step-up-storage.sql',
  ]) await pool.query(await fs.readFile(path.join(__dirname, '../..', file), 'utf8'));
});

test.after(async () => {
  const errors = [];
  try { if (pool) await pool.end(); } catch (error) { errors.push(error); }
  let dropped = !created;
  if (created) {
    try {
      await supervisor.query('select pg_terminate_backend(pid) from pg_stat_activity where datname=$1', [name]);
      await supervisor.query(`drop database "${name}"`);
      dropped = true;
    } catch (error) { errors.push(error); }
  }
  if (dropped) for (const role of roles.reverse()) {
    try { await supervisor.query(`drop role ${role}`); } catch (error) { errors.push(error); }
  }
  try { await supervisor.end(); } catch (error) { errors.push(error); }
  if (errors.length) throw new AggregateError(errors, 'Disposable step-up resources could not be cleaned up.');
});

test.beforeEach(async () => {
  await pool.query(`truncate auth.sessions,auth.mfa_factors,auth.users cascade;
    insert into auth.users(id) values('${USER}');
    insert into auth.sessions(id,user_id) values('${PROVIDER_SESSION}','${USER}');
    insert into auth.mfa_factors(id,user_id,status,factor_type) values('${FACTOR}','${USER}','verified','totp');
    insert into public.dashboard_users(user_id,email,username,display_name,role)
      values('${USER}','native@example.test','native','Synthetic native','OWNER');
    insert into moaon_auth.account_state(user_id) values('${USER}');
    insert into public.dashboard_sessions(id,user_id,token_hash,username,display_name,role,expires_at,last_seen_at)
      values('${SESSION}','${USER}','${HASH}','native','Synthetic native','OWNER',clock_timestamp()+interval '1 hour',clock_timestamp());`);
});

function begin(client, operation = FIRST) {
  return client.query('select public.moaon_begin_step_up($1,$2,$3,$4) as data', [USER, SESSION, HASH, operation]);
}
function commit(client, operation = FIRST) {
  return client.query(`select public.moaon_commit_step_up($1,$2,$3,$4,$5,$6,
    date_trunc('milliseconds',clock_timestamp()),
    date_trunc('milliseconds',clock_timestamp()+interval '4 minutes'),$7) as data`,
  [USER, SESSION, HASH, operation, PROVIDER_SESSION, FACTOR, ENVELOPE]);
}
function revoke(client) {
  return client.query('select public.moaon_revoke_step_up($1,$2,$3) as data', [USER, SESSION, HASH]);
}
async function startServiceTransaction(client) {
  await client.query('begin');
  await client.query('set local role service_role');
}
async function waitForLock(pid, label) {
  const until = Date.now() + 2000;
  while (Date.now() < until) {
    const result = await supervisor.query('select wait_event_type from pg_stat_activity where pid=$1', [pid]);
    if (result.rows[0]?.wait_event_type === 'Lock') return;
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  assert.fail(`${label} was not observed waiting for the database lock.`);
}
async function state() {
  return (await pool.query(`select operation_id,state,sealed_session is null as cipher_cleared
    from moaon_auth.step_up_attempts order by operation_id`)).rows;
}

test('native concurrent begin serializes on the hub session and approves only one operation', async context => {
  const first = await pool.connect();
  const second = await pool.connect();
  let pending;
  try {
    await startServiceTransaction(first);
    await startServiceTransaction(second);
    const secondPid = (await second.query('select pg_backend_pid() as pid')).rows[0].pid;
    await begin(first, FIRST);
    pending = begin(second, SECOND).then(result => ({result}), error => ({error}));
    await waitForLock(secondPid, 'Competing begin');
    context.diagnostic(`Observed competing begin lock wait on PID ${secondPid}`);
    await first.query('commit');
    const outcome = await pending;
    assert.match(outcome.error?.message || '', /STEP_UP_REQUIRED/);
    await second.query('rollback');
    assert.deepEqual(await state(), [{operation_id: FIRST, state: 'PENDING', cipher_cleared: true}]);
  } finally {
    try { await first.query('rollback'); } catch (_error) {}
    try { await second.query('rollback'); } catch (_error) {}
    if (pending) await pending;
    first.release();
    second.release();
  }
});

for (const commitFirst of [true, false]) {
  test(commitFirst
    ? 'native revoke waits for commit then removes its ciphertext'
    : 'native commit waits for revoke then is denied without ciphertext', async context => {
    await begin(pool);
    const first = await pool.connect();
    const second = await pool.connect();
    let pending;
    try {
      await startServiceTransaction(first);
      await startServiceTransaction(second);
      const secondPid = (await second.query('select pg_backend_pid() as pid')).rows[0].pid;
      await (commitFirst ? commit(first) : revoke(first));
      pending = (commitFirst ? revoke(second) : commit(second)).then(result => ({result}), error => ({error}));
      await waitForLock(secondPid, commitFirst ? 'Revoke after commit' : 'Commit after revoke');
      context.diagnostic(`Observed ${commitFirst ? 'revoke' : 'commit'} lock wait on PID ${secondPid}`);
      await first.query('commit');
      const outcome = await pending;
      if (commitFirst) {
        assert.equal(outcome.result?.rows[0].data, true);
        await second.query('commit');
      } else {
        assert.match(outcome.error?.message || '', /STEP_UP_REQUIRED/);
        await second.query('rollback');
      }
      assert.deepEqual(await state(), [{operation_id: FIRST, state: 'REVOKED', cipher_cleared: true}]);
    } finally {
      try { await first.query('rollback'); } catch (_error) {}
      try { await second.query('rollback'); } catch (_error) {}
      if (pending) await pending;
      first.release();
      second.release();
    }
  });
}

test('native password reset account lock denies a late commit and read without ciphertext', async context => {
  await begin(pool);
  const resetter = await pool.connect();
  const committer = await pool.connect();
  let pending;
  try {
    await startServiceTransaction(resetter);
    await startServiceTransaction(committer);
    const committerPid = (await committer.query('select pg_backend_pid() as pid')).rows[0].pid;
    await resetter.query('select public.moaon_begin_password_change($1,$2)', [USER, RESET]);
    pending = commit(committer).then(result => ({result}), error => ({error}));
    await waitForLock(committerPid, 'Commit after password reset');
    context.diagnostic(`Observed password-reset account lock wait on PID ${committerPid}`);
    await resetter.query('commit');
    const outcome = await pending;
    assert.match(outcome.error?.message || '', /STEP_UP_REQUIRED/);
    await committer.query('rollback');
    assert.deepEqual(await state(), [{operation_id: FIRST, state: 'PENDING', cipher_cleared: true}]);
    assert.equal((await pool.query('select public.moaon_read_step_up($1,$2,true) as data', [USER, SESSION])).rows[0].data, null);
  } finally {
    try { await resetter.query('rollback'); } catch (_error) {}
    try { await committer.query('rollback'); } catch (_error) {}
    if (pending) await pending;
    resetter.release();
    committer.release();
  }
});
