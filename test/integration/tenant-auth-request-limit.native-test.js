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
const name = `moaon_test_auth_limit_${process.pid}_${randomBytes(4).toString('hex')}`;
if (!/^moaon_test_auth_limit_[0-9]+_[0-9a-f]{8}$/.test(name)) throw Error('Unsafe test database name.');
const config = {ssl:false, max:4, connectionTimeoutMillis:2000, statement_timeout:5000, allowExitOnIdle:true};
const supervisor = new Pool({...config, max:2, connectionString:url.toString()});
let pool;
let created = false;
const roles = [];
const hash = 'a'.repeat(64);

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
  pool = new Pool({...config, connectionString:url.toString()});
  await pool.query(await fs.readFile(path.join(__dirname, '../../lib/tenancy/sql/auth-request-limit.sql'), 'utf8'));
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
  if (errors.length) throw new AggregateError(errors, 'Disposable auth-limit resources could not be cleaned up.');
});

test.beforeEach(async () => {
  await pool.query('truncate moaon_auth.request_limits');
});

async function waitForLock(pid) {
  const until = Date.now() + 2000;
  while (Date.now() < until) {
    const result = await pool.query('select wait_event_type from pg_stat_activity where pid=$1', [pid]);
    if (result.rows[0]?.wait_event_type === 'Lock') return;
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  assert.fail('Competing auth-limit connection was not observed waiting for a row lock.');
}

async function consume(client, value = hash) {
  return (await client.query(
    'select public.moaon_consume_auth_request($1,$2) as allowed',
    ['LOGIN', value]
  )).rows[0].allowed;
}

test('different backends serialize one bucket and exactly ten of twenty calls are allowed', async t => {
  let first;
  let second;
  let pending;
  try {
    first = await pool.connect();
    second = await pool.connect();
    const firstPid = (await first.query('select pg_backend_pid() as pid')).rows[0].pid;
    const secondPid = (await second.query('select pg_backend_pid() as pid')).rows[0].pid;
    assert.notEqual(firstPid, secondPid);
    await first.query('begin');
    assert.equal(await consume(first), true);
    pending = consume(second);
    await waitForLock(secondPid);
    await first.query('commit');
    const outcomes = [true, await pending, ...await Promise.all(Array.from({length:18}, () => consume(pool)))];
    assert.equal(outcomes.filter(Boolean).length, 10);
    assert.equal(outcomes.filter(value => !value).length, 10);
    assert.deepEqual((await pool.query(
      'select used from moaon_auth.request_limits where kind=$1 and subject_hash=$2',
      ['LOGIN', hash]
    )).rows, [{used:10}]);
    t.diagnostic(`observed backend lock wait first_pid=${firstPid} waiting_pid=${secondPid}`);
  } finally {
    if (first) {await first.query('rollback'); first.release();}
    if (pending) await pending;
    if (second) second.release();
  }
});

test('rollback releases the budget and the waiter evaluates reset time after acquiring the lock', async t => {
  await pool.query(
    `insert into moaon_auth.request_limits(kind,subject_hash,started_at,used)
     values ('LOGIN',$1,clock_timestamp()-interval '901 seconds',10)`,
    [hash]
  );
  let first;
  let second;
  let pending;
  try {
    first = await pool.connect();
    second = await pool.connect();
    const firstPid = (await first.query('select pg_backend_pid() as pid')).rows[0].pid;
    const secondPid = (await second.query('select pg_backend_pid() as pid')).rows[0].pid;
    assert.notEqual(firstPid, secondPid);
    await first.query('begin');
    assert.equal(await consume(first), true);
    pending = consume(second);
    await waitForLock(secondPid);
    const releaseMarker = (await first.query('select clock_timestamp() as at')).rows[0].at;
    await first.query('rollback');
    assert.equal(await pending, true);
    const row = (await pool.query(
      'select used, started_at from moaon_auth.request_limits where kind=$1 and subject_hash=$2',
      ['LOGIN', hash]
    )).rows[0];
    assert.equal(row.used, 1);
    assert.equal(row.started_at >= releaseMarker, true);
    t.diagnostic(`rollback waiter first_pid=${firstPid} waiting_pid=${secondPid}`);
  } finally {
    if (first) {await first.query('rollback'); first.release();}
    if (pending) await pending;
    if (second) second.release();
  }
});
