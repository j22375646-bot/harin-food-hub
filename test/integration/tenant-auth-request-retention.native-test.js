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
const databaseName = `moaon_test_control_retention_${process.pid}_${randomBytes(4).toString('hex')}`;
if (!/^moaon_test_control_[a-z0-9_]{1,40}$/.test(databaseName)) {
  throw Error('Unsafe test database name.');
}
const publicRole = `moaon_test_public_${process.pid}`;
const config = {
  ssl: false,
  max: 4,
  connectionTimeoutMillis: 2000,
  statement_timeout: 10000,
  allowExitOnIdle: true,
};
const supervisorPool = new Pool({...config, max: 2, connectionString: url.toString()});
let adminPool;
let databaseCreated = false;
const createdAuxiliaryRoles = [];
let serviceRoleCreated = false;

test.before(async () => {
  for (const role of ['anon', 'authenticated', 'service_role', publicRole]) {
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
  for (const sqlFile of [
    'auth-request-limit.sql',
    'auth-request-admission.sql',
    'auth-request-retention.sql',
  ]) {
    await adminPool.query(await fs.readFile(
      path.join(__dirname, '../../lib/tenancy/sql', sqlFile),
      'utf8'
    ));
  }
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
  await adminPool.query('truncate moaon_auth.request_limits, moaon_auth.admission_limits');
});

async function waitForLock(pid) {
  const until = Date.now() + 3000;
  while (Date.now() < until) {
    const result = await adminPool.query(
      'select wait_event_type from pg_stat_activity where pid=$1',
      [pid]
    );
    if (result.rows[0]?.wait_event_type === 'Lock') return;
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  assert.fail('Competing auth-retention connection was not observed waiting for a row lock.');
}

async function prune(client) {
  return (await client.query(
    'select public.moaon_prune_auth_request_limits() as counts'
  )).rows[0].counts;
}

const SUBJECT_HASH = 'a'.repeat(64);
const IP_HASH = 'b'.repeat(64);
const targets = [
  {
    name: 'subject',
    deletedKey: 'requestDeleted',
    async insertStale(client) {
      await client.query(`
        insert into moaon_auth.request_limits(kind,subject_hash,started_at,used)
        values ('LOGIN',$1,clock_timestamp()-interval '25 hours',10)
      `, [SUBJECT_HASH]);
    },
    async insertNearWindow(client) {
      await client.query(`
        insert into moaon_auth.request_limits(kind,subject_hash,started_at,used)
        values ('LOGIN',$1,clock_timestamp()-interval '899 seconds',10)
      `, [SUBJECT_HASH]);
    },
    async lock(client) {
      await client.query(`
        select 1 from moaon_auth.request_limits
        where kind='LOGIN' and subject_hash=$1 for update
      `, [SUBJECT_HASH]);
    },
    async consume(client) {
      return (await client.query(
        'select public.moaon_consume_auth_request($1,$2) as allowed',
        ['LOGIN', SUBJECT_HASH]
      )).rows[0].allowed;
    },
    async read(client) {
      return (await client.query(`
        select used,started_at from moaon_auth.request_limits
        where kind='LOGIN' and subject_hash=$1
      `, [SUBJECT_HASH])).rows;
    },
  },
  {
    name: 'IP',
    deletedKey: 'ipDeleted',
    async insertStale(client) {
      await client.query(`
        insert into moaon_auth.admission_limits(scope,key_hash,started_at,used)
        values ('IP',$1,clock_timestamp()-interval '25 hours',30)
      `, [IP_HASH]);
    },
    async insertNearWindow(client) {
      await client.query(`
        insert into moaon_auth.admission_limits(scope,key_hash,started_at,used)
        values ('IP',$1,clock_timestamp()-interval '299 seconds',30)
      `, [IP_HASH]);
    },
    async lock(client) {
      await client.query(`
        select 1 from moaon_auth.admission_limits
        where scope='IP' and key_hash=$1 for update
      `, [IP_HASH]);
    },
    async consume(client) {
      return (await client.query(
        'select public.moaon_consume_auth_admission($1) as allowed',
        [IP_HASH]
      )).rows[0].allowed;
    },
    async read(client) {
      return (await client.query(`
        select used,started_at from moaon_auth.admission_limits
        where scope='IP' and key_hash=$1
      `, [IP_HASH])).rows;
    },
  },
];

for (const target of targets) {
  test(`a ${target.name} consumer owns its stale counter before prune and prune skips it`, async t => {
    await target.insertStale(adminPool);
    let consumer;
    let pruner;
    try {
      consumer = await adminPool.connect();
      pruner = await adminPool.connect();
      const consumerPid = (await consumer.query('select pg_backend_pid() as pid')).rows[0].pid;
      const prunerPid = (await pruner.query('select pg_backend_pid() as pid')).rows[0].pid;
      assert.notEqual(consumerPid, prunerPid);
      await consumer.query('begin');
      assert.equal(await target.consume(consumer), true);
      const counts = await prune(pruner);
      assert.equal(counts[target.deletedKey], 0);
      await consumer.query('commit');
      assert.deepEqual((await target.read(adminPool)).map(row => row.used), [1]);
      t.diagnostic(`consumer-first ${target.name} consumer_pid=${consumerPid} pruner_pid=${prunerPid}`);
    } finally {
      if (consumer) {await consumer.query('rollback'); consumer.release();}
      if (pruner) pruner.release();
    }
  });

  test(`prune owns a stale ${target.name} counter and the waiting consumer recreates it after commit`, async t => {
    await target.insertStale(adminPool);
    let pruner;
    let consumer;
    let pending;
    try {
      pruner = await adminPool.connect();
      consumer = await adminPool.connect();
      const prunerPid = (await pruner.query('select pg_backend_pid() as pid')).rows[0].pid;
      const consumerPid = (await consumer.query('select pg_backend_pid() as pid')).rows[0].pid;
      assert.notEqual(prunerPid, consumerPid);
      await pruner.query('begin');
      const counts = await prune(pruner);
      assert.equal(counts[target.deletedKey], 1);
      pending = target.consume(consumer);
      await waitForLock(consumerPid);
      const releaseMarker = (await pruner.query('select clock_timestamp() as at')).rows[0].at;
      await pruner.query('commit');
      assert.equal(await pending, true);
      const rows = await target.read(adminPool);
      assert.equal(rows.length, 1);
      assert.equal(rows[0].used, 1);
      assert.equal(rows[0].started_at >= releaseMarker, true);
      t.diagnostic(`prune-first ${target.name} pruner_pid=${prunerPid} consumer_pid=${consumerPid}`);
    } finally {
      if (pruner) {await pruner.query('rollback'); pruner.release();}
      if (pending) await pending;
      if (consumer) consumer.release();
    }
  });

  test(`${target.name} consumer samples DB time only after acquiring its counter lock`, async t => {
    await target.insertNearWindow(adminPool);
    let locker;
    let consumer;
    let pending;
    try {
      locker = await adminPool.connect();
      consumer = await adminPool.connect();
      const lockerPid = (await locker.query('select pg_backend_pid() as pid')).rows[0].pid;
      const consumerPid = (await consumer.query('select pg_backend_pid() as pid')).rows[0].pid;
      assert.notEqual(lockerPid, consumerPid);
      await locker.query('begin');
      await target.lock(locker);
      pending = target.consume(consumer);
      await waitForLock(consumerPid);
      await new Promise(resolve => setTimeout(resolve, 1200));
      const releaseMarker = (await locker.query('select clock_timestamp() as at')).rows[0].at;
      await locker.query('commit');
      assert.equal(await pending, true);
      const rows = await target.read(adminPool);
      assert.equal(rows[0].used, 1);
      assert.equal(rows[0].started_at >= releaseMarker, true);
      t.diagnostic(`post-lock clock ${target.name} locker_pid=${lockerPid} consumer_pid=${consumerPid}`);
    } finally {
      if (locker) {await locker.query('rollback'); locker.release();}
      if (pending) await pending;
      if (consumer) consumer.release();
    }
  });
}

test('prune rollback restores both stale records', async () => {
  await targets[0].insertStale(adminPool);
  await targets[1].insertStale(adminPool);
  const client = await adminPool.connect();
  try {
    await client.query('begin');
    assert.deepEqual(await prune(client), {requestDeleted: 1, ipDeleted: 1});
    assert.equal((await targets[0].read(client)).length, 0);
    assert.equal((await targets[1].read(client)).length, 0);
    await client.query('rollback');
    assert.equal((await targets[0].read(adminPool)).length, 1);
    assert.equal((await targets[1].read(adminPool)).length, 1);
  } finally {
    await client.query('rollback');
    client.release();
  }
});

test('concurrent pruners claim stale rows once and retain fresh subject, IP, and GLOBAL counts', async t => {
  await adminPool.query(`
    insert into moaon_auth.request_limits(kind,subject_hash,started_at,used)
    select 'LOGIN',lpad(to_hex(value),64,'0'),clock_timestamp()-interval '25 hours',1
    from generate_series(1,750) as value;
    insert into moaon_auth.request_limits(kind,subject_hash,started_at,used) values
      ('LOGIN',repeat('e',64),clock_timestamp()-interval '1 hour',7),
      ('LOGIN',repeat('f',64),clock_timestamp()+interval '1 hour',8);
    insert into moaon_auth.admission_limits(scope,key_hash,started_at,used)
    select 'IP',lpad(to_hex(value),64,'0'),clock_timestamp()-interval '25 hours',1
    from generate_series(1,750) as value;
    insert into moaon_auth.admission_limits(scope,key_hash,started_at,used) values
      ('GLOBAL',repeat('0',64),clock_timestamp()-interval '25 hours',9),
      ('IP',repeat('e',64),clock_timestamp()-interval '1 hour',7),
      ('IP',repeat('f',64),clock_timestamp()+interval '1 hour',8);
  `);
  const first = await adminPool.connect();
  const second = await adminPool.connect();
  try {
    const firstPid = (await first.query('select pg_backend_pid() as pid')).rows[0].pid;
    const secondPid = (await second.query('select pg_backend_pid() as pid')).rows[0].pid;
    assert.notEqual(firstPid, secondPid);
    const results = await Promise.all([prune(first), prune(second)]);
    assert.equal(results.reduce((sum, item) => sum + item.requestDeleted, 0), 750);
    assert.equal(results.reduce((sum, item) => sum + item.ipDeleted, 0), 750);
    assert.equal(results.every(item => item.requestDeleted <= 500 && item.ipDeleted <= 500), true);
    assert.deepEqual((await adminPool.query(`
      select subject_hash,used from moaon_auth.request_limits order by subject_hash
    `)).rows, [
      {subject_hash: 'e'.repeat(64), used: 7},
      {subject_hash: 'f'.repeat(64), used: 8},
    ]);
    assert.deepEqual((await adminPool.query(`
      select scope,key_hash,used from moaon_auth.admission_limits order by scope,key_hash
    `)).rows, [
      {scope: 'GLOBAL', key_hash: '0'.repeat(64), used: 9},
      {scope: 'IP', key_hash: 'e'.repeat(64), used: 7},
      {scope: 'IP', key_hash: 'f'.repeat(64), used: 8},
    ]);
    t.diagnostic(`concurrent pruners first_pid=${firstPid} second_pid=${secondPid}`);
  } finally {
    first.release();
    second.release();
  }
});
