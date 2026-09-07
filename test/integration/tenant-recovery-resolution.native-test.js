'use strict';
// Explicit opt-in, synthetic random database on the fixed local PostgreSQL only.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const {randomBytes} = require('node:crypto');
const {Pool} = require('pg');
const {cleanupNativeResources} = require('./postgres-native-harness-safety');
const {USER, OPERATOR, OTHER, OPERATION, CANDIDATE, root, install, seed, inspect, resolve, preservedState} = require('../helpers/recovery-resolution-fixture');

let url;
try {url = new URL(process.env.MOAON_AUTH_TEST_POSTGRES_URL || 'invalid:');} catch {throw Error('An isolated loopback test cluster URL is required.');}
if (!['postgres:', 'postgresql:'].includes(url.protocol) || url.hostname !== '127.0.0.1'
  || url.port !== '55437' || url.username !== 'moaon_test_admin' || !url.password
  || url.pathname !== '/postgres' || url.search || url.hash) throw Error('An isolated loopback test cluster URL is required.');
const databaseName = `moaon_test_control_resolution_${process.pid}_${randomBytes(4).toString('hex')}`;
if (!/^moaon_test_control_resolution_[0-9]+_[0-9a-f]{8}$/.test(databaseName)) throw Error('Unsafe synthetic database name.');
const config = {ssl: false, max: 5, connectionTimeoutMillis: 2000, statement_timeout: 7000, allowExitOnIdle: true};
const supervisor = new Pool({...config, connectionString: url.toString()});
let pool;
let created = false;
let createdServiceRole = false;
const createdRoles = [];
test.before(async () => {
  // Track only roles this suite creates; never alter moaon_test_supervisor.
  if (!(await supervisor.query("select 1 from pg_roles where rolname='service_role'")).rowCount) {
    await supervisor.query('create role service_role bypassrls');
    createdServiceRole = true;
  }
  assert.equal((await supervisor.query("select rolbypassrls from pg_roles where rolname='service_role'")).rows[0]?.rolbypassrls, true,
    'Dedicated local cluster must provide service_role BYPASSRLS.');
  for (const role of ['anon', 'authenticated']) {
    if (!(await supervisor.query('select 1 from pg_roles where rolname=$1', [role])).rowCount) {
      await supervisor.query(`create role ${role}`);
      createdRoles.push(role);
    }
  }
  await supervisor.query(`create database "${databaseName}"`);
  created = true;
  const databaseUrl = new URL(url.toString());
  databaseUrl.pathname = `/${databaseName}`;
  pool = new Pool({...config, connectionString: databaseUrl.toString()});
  await pool.query("create schema auth; create table auth.users(id uuid primary key, encrypted_password text default 'synthetic-password-hash')");
  await install(pool);
});
test.after(async () => {
  try {
    await cleanupNativeResources({adminPool: pool, supervisorPool: {query: supervisor.query.bind(supervisor)},
      databaseCreated: created, databaseName, createdAuxiliaryRoles: createdRoles});
    if (createdServiceRole) await supervisor.query('drop role service_role');
  } finally {await supervisor.end();}
});
test.beforeEach(async () => {
  await pool.query('truncate auth.users cascade; truncate moaon_auth.recovery_resolutions');
  await seed(pool);
});

async function waitForLock(pid, blockerPid) {
  const until = Date.now() + 2500;
  while (Date.now() < until) {
    const result = await pool.query('select wait_event_type, $2::int=any(pg_blocking_pids(pid)) as blocked_by_first from pg_stat_activity where pid=$1', [pid, blockerPid]);
    if (result.rows[0]?.wait_event_type === 'Lock' && result.rows[0].blocked_by_first) return;
    await new Promise(done => setTimeout(done, 10));
  }
  assert.fail('Expected competing backend lock was not observed.');
}
async function race(context, firstAction, secondAction, {secondPrivileged = false, firstPrivileged = false} = {}) {
  let first, second, pending;
  try {
    first = await pool.connect(); second = await pool.connect();
    const firstPid = (await first.query('select pg_backend_pid() as pid')).rows[0].pid;
    const secondPid = (await second.query('select pg_backend_pid() as pid')).rows[0].pid;
    assert.notEqual(firstPid, secondPid);
    await first.query('begin');
    if (!firstPrivileged) await first.query('set local role service_role');
    if (!secondPrivileged) await second.query('set role service_role');
    const firstResult = await firstAction(first);
    pending = secondAction(second).then(value => ({value}), error => ({error}));
    await waitForLock(secondPid, firstPid);
    context.diagnostic(`Observed lock contention: first PID ${firstPid}, waiting PID ${secondPid}`);
    await first.query('commit');
    return {firstResult, secondResult: await pending};
  } finally {
    if (first) {await first.query('rollback'); first.release();}
    if (pending) await pending;
    if (second) {await second.query('reset role'); second.release();}
  }
}

test('native begin before CLOSE_NOT_STARTED keeps blocked journal and rejects stale resolution', async context => {
  const expectedVersion = (await inspect(pool)).version;
  const {secondResult} = await race(context,
    db => db.query('select public.moaon_begin_password_change($1,$2)', [USER, OPERATION]),
    db => resolve(db, {expectedVersion}));
  assert.equal(secondResult.error?.message, 'RECOVERY_REVIEW_RESOLUTION_REJECTED');
  assert.equal((await inspect(pool)).decision, 'KEEP_BLOCKED');
  assert.equal((await pool.query('select count(*)::int as n from moaon_auth.recovery_resolutions')).rows[0].n, 0);
});

test('native CLOSE_NOT_STARTED before begin closes journal and prevents any fence mutation', async context => {
  const expectedVersion = (await inspect(pool)).version;
  const before = await preservedState(pool);
  const {secondResult} = await race(context,
    db => resolve(db, {expectedVersion}),
    db => db.query('select public.moaon_begin_password_change($1,$2)', [USER, OPERATION]));
  assert.equal(secondResult.error?.message, 'AUTH_TRANSITION_REJECTED');
  assert.equal((await inspect(pool)).status, 'REJECTED');
  assert.deepEqual(await preservedState(pool), before);
});

test('native concurrent same-ID resolution returns exact replay with one audit row', async context => {
  const expectedVersion = (await inspect(pool)).version;
  const {firstResult, secondResult} = await race(context,
    db => resolve(db, {expectedVersion}), db => resolve(db, {expectedVersion}));
  assert.equal(secondResult.error, undefined);
  assert.deepEqual(secondResult.value, firstResult);
  assert.equal((await pool.query('select count(*)::int as n from moaon_auth.recovery_resolutions')).rows[0].n, 1);
});

test('native same-ID conflict across accounts leaves the second journal unchanged', async context => {
  const otherOperation = '50000000-0000-4000-8000-000000000002';
  await pool.query('select public.moaon_start_recovery_review($1,$2)', [OTHER, otherOperation]);
  const expectedVersion = (await inspect(pool)).version;
  const other = await inspect(pool, {userId: OTHER, operationId: otherOperation});
  const before = await preservedState(pool);
  const {secondResult} = await race(context, db => resolve(db, {expectedVersion}),
    db => resolve(db, {userId: OTHER, operationId: otherOperation, expectedVersion: other.version}));
  assert.equal(secondResult.error?.message, 'RECOVERY_REVIEW_RESOLUTION_REJECTED');
  assert.deepEqual(await inspect(pool, {userId: OTHER, operationId: otherOperation}), other);
  assert.deepEqual(await preservedState(pool), before);
  assert.equal((await pool.query('select count(*)::int as n from moaon_auth.recovery_resolutions')).rows[0].n, 1);
});

for (const conflict of [{action: 'CONFIRM_COMPLETED'}, {resolutionId: '60000000-0000-4000-8000-000000000002'}]) {
  test(`native conflicting resolution ${Object.keys(conflict)[0]} cannot partially mutate`, async context => {
    const expectedVersion = (await inspect(pool)).version;
    const before = await preservedState(pool);
    const {secondResult} = await race(context,
      db => resolve(db, {expectedVersion}), db => resolve(db, {expectedVersion, ...conflict}));
    assert.equal(secondResult.error?.message, 'RECOVERY_REVIEW_RESOLUTION_REJECTED');
    assert.equal((await inspect(pool)).status, 'REJECTED');
    assert.deepEqual(await preservedState(pool), before);
    assert.equal((await pool.query('select count(*)::int as n from moaon_auth.recovery_resolutions')).rows[0].n, 1);
  });
}

for (const revoke of ['allowlist', 'profile', 'truncate']) {
  const revokeSql = revoke === 'allowlist' ? `delete from moaon_auth.recovery_operators where user_id='${OPERATOR}'`
    : revoke === 'profile' ? `update public.dashboard_users set active=false where user_id='${OPERATOR}'`
      : 'truncate moaon_auth.recovery_operators';
  for (const revokeFirst of [false, true]) {
    test(`native ${revoke} revocation ${revokeFirst ? 'before' : 'after'} inspection serializes authorization`, async context => {
      const {secondResult} = await race(context,
        db => revokeFirst ? db.query(revokeSql) : inspect(db),
        db => revokeFirst ? inspect(db) : db.query(revokeSql),
        {firstPrivileged: revokeFirst, secondPrivileged: !revokeFirst});
      if (revokeFirst) assert.equal(secondResult.error?.message, 'RECOVERY_REVIEW_RESOLUTION_REJECTED');
      else assert.equal(secondResult.error, undefined);
      await assert.rejects(inspect(pool), /RECOVERY_REVIEW_RESOLUTION_REJECTED/);
      assert.equal((await pool.query('select count(*)::int as n from moaon_auth.recovery_resolutions')).rows[0].n, 0);
    });
  }
}

test('native revocation waits for resolution commit then denies even an exact replay', async context => {
  const expectedVersion = (await inspect(pool)).version;
  const {secondResult} = await race(context, db => resolve(db, {expectedVersion}),
    db => db.query('delete from moaon_auth.recovery_operators where user_id=$1', [OPERATOR]), {secondPrivileged: true});
  assert.equal(secondResult.error, undefined);
  await assert.rejects(resolve(pool, {expectedVersion}), /RECOVERY_REVIEW_RESOLUTION_REJECTED/);
  assert.equal((await pool.query('select count(*)::int as n from moaon_auth.recovery_resolutions')).rows[0].n, 1);
});

for (const isolation of ['repeatable read', 'serializable']) {
  for (const method of ['inspect', 'resolve']) {
    test(`native ${isolation} ${method} rejects a stale allowlist snapshot after revocation`, async () => {
      const expectedVersion = (await inspect(pool)).version;
      const client = await pool.connect();
      try {
        await client.query(`begin isolation level ${isolation}`);
        await client.query('set local role service_role');
        assert.equal((await client.query('select count(*)::int as n from moaon_auth.recovery_operators')).rows[0].n, 1);
        await pool.query('delete from moaon_auth.recovery_operators where user_id=$1', [OPERATOR]);
        await assert.rejects(method === 'inspect' ? inspect(client) : resolve(client, {expectedVersion}),
          error => error.message === 'RECOVERY_REVIEW_RESOLUTION_REJECTED');
      } finally {await client.query('rollback'); client.release();}
      assert.equal((await pool.query('select status from moaon_auth.recovery_reviews')).rows[0].status, 'PENDING');
      assert.equal((await pool.query('select count(*)::int as n from moaon_auth.recovery_resolutions')).rows[0].n, 0);
    });
  }
}

test('native completed REVIEW_REQUIRED reconciliation and reinstall preserve auth and audit data', async () => {
  await pool.query('select public.moaon_begin_password_change($1,$2)', [USER, OPERATION]);
  await pool.query('select public.moaon_complete_password_change($1,$2)', [USER, OPERATION]);
  await pool.query("select public.moaon_require_recovery_review($1,$2,'FENCE_COMPLETE')", [USER, OPERATION]);
  const review = await inspect(pool);
  const before = await preservedState(pool);
  assert.equal(review.decision, 'CONFIRM_COMPLETED');
  const resolved = await resolve(pool, {expectedVersion: review.version, action: 'CONFIRM_COMPLETED'});
  assert.equal(resolved.status, 'COMPLETED');
  assert.deepEqual(await preservedState(pool), before);
  await pool.query(await fs.readFile(path.join(root, CANDIDATE), 'utf8'));
  assert.deepEqual(await resolve(pool, {expectedVersion: review.version, action: 'CONFIRM_COMPLETED'}), resolved);
  assert.equal((await pool.query('select count(*)::int as n from moaon_auth.recovery_resolutions')).rows[0].n, 1);
});
