'use strict';
// Explicit opt-in, disposable loopback PostgreSQL only; excluded from the default glob.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const {randomBytes} = require('node:crypto');
const {Pool} = require('pg');
const {cleanupNativeResources} = require('./postgres-native-harness-safety.js');

const url = new URL(process.env.MOAON_AUTH_TEST_POSTGRES_URL || 'invalid:');
if (!['postgres:', 'postgresql:'].includes(url.protocol) || url.hostname !== '127.0.0.1'
  || url.port !== '55437' || url.username !== 'moaon_test_admin' || !url.password
  || url.pathname !== '/postgres' || url.search || url.hash) {
  throw Error('An explicit isolated loopback test cluster URL is required.');
}
const databaseName = `moaon_test_control_admission_${process.pid}_${randomBytes(4).toString('hex')}`;
if (!/^moaon_test_control_[a-z0-9_]{1,40}$/.test(databaseName)) {
  throw Error('Unsafe test database name.');
}
const config = {
  ssl: false, max: 4, connectionTimeoutMillis: 2000,
  statement_timeout: 10000, allowExitOnIdle: true,
};
const supervisorPool = new Pool({...config, max: 2, connectionString: url.toString()});
let adminPool;
let databaseCreated = false;
const createdAuxiliaryRoles = [];
let serviceRoleCreated = false;

test.before(async () => {
  for (const role of ['anon', 'authenticated', 'service_role']) {
    const found = await supervisorPool.query('select 1 from pg_roles where rolname=$1', [role]);
    if (!found.rowCount) {
      await supervisorPool.query(`create role ${role}${role === 'service_role' ? ' bypassrls' : ''}`);
      if (role === 'service_role') serviceRoleCreated = true;
      else createdAuxiliaryRoles.push(role);
    }
  }
  await supervisorPool.query(`create database "${databaseName}"`);
  databaseCreated = true;
  url.pathname = `/${databaseName}`;
  adminPool = new Pool({...config, connectionString: url.toString()});
  await adminPool.query(await fs.readFile(
    path.join(__dirname, '../../lib/tenancy/sql/auth-request-admission.sql'), 'utf8'
  ));
});

test.after(async () => {
  const cleanupSupervisorPool = {
    query: supervisorPool.query.bind(supervisorPool),
    async end() {
      let roleError;
      try {
        if (serviceRoleCreated) await supervisorPool.query('drop role if exists service_role');
      } catch (error) {
        roleError = error;
      }
      try {
        await supervisorPool.end();
      } catch (error) {
        if (!roleError) roleError = error;
      }
      if (roleError) throw roleError;
    },
  };
  await cleanupNativeResources({
    adminPool,
    supervisorPool: cleanupSupervisorPool,
    databaseCreated,
    databaseName,
    createdAuxiliaryRoles,
  });
});

test.beforeEach(async () => {
  await adminPool.query('truncate moaon_auth.admission_limits');
});

async function waitForLock(pid) {
  const until = Date.now() + 3000;
  while (Date.now() < until) {
    const result = await adminPool.query(
      'select wait_event_type from pg_stat_activity where pid=$1', [pid]
    );
    if (result.rows[0]?.wait_event_type === 'Lock') return;
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  assert.fail('Competing auth-admission connection was not observed waiting for a row lock.');
}

async function consume(client, hash) {
  return (await client.query(
    'select public.moaon_consume_auth_admission($1) as allowed', [hash]
  )).rows[0].allowed;
}

test('same-IP backends lock one bucket and allow exactly thirty of forty calls', async t => {
  const hash = 'a'.repeat(64);
  let first;
  let second;
  let pending;
  try {
    first = await adminPool.connect();
    second = await adminPool.connect();
    const secondPid = (await second.query('select pg_backend_pid() as pid')).rows[0].pid;
    await first.query('begin');
    assert.equal(await consume(first, hash), true);
    pending = consume(second, hash);
    await waitForLock(secondPid);
    await first.query('commit');
    const outcomes = [true, await pending, ...await Promise.all(
      Array.from({length: 38}, () => consume(adminPool, hash))
    )];
    assert.equal(outcomes.filter(Boolean).length, 30);
    assert.equal(outcomes.filter(value => !value).length, 10);
    assert.deepEqual((await adminPool.query(
      `select scope,used from moaon_auth.admission_limits order by scope`
    )).rows, [{scope: 'GLOBAL', used: 40}, {scope: 'IP', used: 30}]);
    t.diagnostic(`observed same-IP lock wait waiting_pid=${secondPid}`);
  } finally {
    if (first) {await first.query('rollback'); first.release();}
    if (pending) await pending;
    if (second) second.release();
  }
});

test('different-IP backends share the global lock and allow exactly five hundred of 501 calls', async t => {
  let first;
  let second;
  let pending;
  try {
    first = await adminPool.connect();
    second = await adminPool.connect();
    const secondPid = (await second.query('select pg_backend_pid() as pid')).rows[0].pid;
    await first.query('begin');
    assert.equal(await consume(first, '1'.padStart(64, '0')), true);
    pending = consume(second, '2'.padStart(64, '0'));
    await waitForLock(secondPid);
    await first.query('commit');
    const outcomes = [true, await pending, ...await Promise.all(
      Array.from({length: 499}, (_, index) => consume(
        adminPool, (index + 3).toString(16).padStart(64, '0')
      ))
    )];
    assert.equal(outcomes.filter(Boolean).length, 500);
    assert.equal(outcomes.filter(value => !value).length, 1);
    assert.deepEqual((await adminPool.query(
      `select used from moaon_auth.admission_limits where scope='GLOBAL'`
    )).rows, [{used: 500}]);
    t.diagnostic(`observed cross-IP global lock wait waiting_pid=${secondPid}`);
  } finally {
    if (first) {await first.query('rollback'); first.release();}
    if (pending) await pending;
    if (second) second.release();
  }
});

test('rollback releases both budgets and waiter samples reset time after locks', async t => {
  const hash = 'f'.repeat(64);
  await adminPool.query(
    `insert into moaon_auth.admission_limits(scope,key_hash,started_at,used) values
     ('GLOBAL',$1,clock_timestamp()-interval '301 seconds',500),
     ('IP',$2,clock_timestamp()-interval '301 seconds',30)`,
    ['0'.repeat(64), hash]
  );
  let first;
  let second;
  let pending;
  try {
    first = await adminPool.connect();
    second = await adminPool.connect();
    const secondPid = (await second.query('select pg_backend_pid() as pid')).rows[0].pid;
    await first.query('begin');
    assert.equal(await consume(first, hash), true);
    pending = consume(second, hash);
    await waitForLock(secondPid);
    const releaseMarker = (await first.query('select clock_timestamp() as at')).rows[0].at;
    await first.query('rollback');
    assert.equal(await pending, true);
    const rows = (await adminPool.query(
      `select scope,used,started_at from moaon_auth.admission_limits order by scope`
    )).rows;
    assert.deepEqual(rows.map(row => ({scope: row.scope, used: row.used})), [
      {scope: 'GLOBAL', used: 1}, {scope: 'IP', used: 1},
    ]);
    assert.equal(rows.every(row => row.started_at >= releaseMarker), true);
    t.diagnostic(`observed rollback lock wait waiting_pid=${secondPid}`);
  } finally {
    if (first) {await first.query('rollback'); first.release();}
    if (pending) await pending;
    if (second) second.release();
  }
});
