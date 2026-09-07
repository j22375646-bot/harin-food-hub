'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const {PGlite} = require('@electric-sql/pglite');
const {
  createAuthRequestRetention,
  AuthRequestRetentionError,
} = require('../lib/tenancy/auth-request-retention.js');

const REQUEST_SQL_FILE = path.join(__dirname, '../lib/tenancy/sql/auth-request-limit.sql');
const ADMISSION_SQL_FILE = path.join(__dirname, '../lib/tenancy/sql/auth-request-admission.sql');
const RETENTION_SQL_FILE = path.join(__dirname, '../lib/tenancy/sql/auth-request-retention.sql');

function deferred() {
  let resolve;
  const promise = new Promise(done => {resolve = done;});
  return {promise, resolve};
}

test('prune invokes only the fixed zero-argument RPC and returns a frozen count copy', async () => {
  const calls = [];
  const rpcData = {requestDeleted: 500, ipDeleted: 1};
  const retention = createAuthRequestRetention({
    rpcClient: {marker: 'bound', async rpc(name, args) {
      assert.equal(this.marker, 'bound');
      calls.push({name, args});
      return {data: rpcData, error: null};
    }},
  });

  const result = await retention.prune();

  assert.deepEqual(calls, [{name: 'moaon_prune_auth_request_limits', args: undefined}]);
  assert.deepEqual(result, {requestDeleted: 500, ipDeleted: 1});
  assert.notEqual(result, rpcData);
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(retention), true);
});

test('prune rejects caller knobs and accepts exactly two own bounded integer count keys', async () => {
  let calls = 0;
  const retention = createAuthRequestRetention({
    rpcClient: {rpc: async () => {
      calls++;
      return {data: {requestDeleted: 0, ipDeleted: 500}, error: null};
    }},
  });
  for (const args of [
    [undefined],
    [{}],
    [{cutoff: '2026-01-01T00:00:00.000Z'}],
    [{limit: 501}],
  ]) {
    await assert.rejects(() => retention.prune(...args), TypeError);
  }
  assert.equal(calls, 0);
  assert.deepEqual(await retention.prune(), {requestDeleted: 0, ipDeleted: 500});

  const inherited = Object.create({requestDeleted: 0});
  inherited.ipDeleted = 0;
  const invalidData = [
    null,
    [],
    {},
    {requestDeleted: 0},
    {requestDeleted: 0, ipDeleted: 0, extra: 0},
    inherited,
    {requestDeleted: -1, ipDeleted: 0},
    {requestDeleted: 501, ipDeleted: 0},
    {requestDeleted: 0.5, ipDeleted: 0},
    {requestDeleted: 0, ipDeleted: '0'},
  ];
  for (const data of invalidData) {
    const invalid = createAuthRequestRetention({
      rpcClient: {rpc: async () => ({data, error: null})},
    });
    await assert.rejects(
      () => invalid.prune(),
      error => error instanceof AuthRequestRetentionError
        && error.code === 'AUTH_REQUEST_RETENTION_UNAVAILABLE'
        && error.status === 503
    );
  }

  let reads = 0;
  const unstable = {ipDeleted: 0};
  Object.defineProperty(unstable, 'requestDeleted', {
    enumerable: true,
    get() {
      if (reads++ === 0) return 0;
      throw new Error('private accessor detail');
    },
  });
  const accessorResult = createAuthRequestRetention({
    rpcClient: {rpc: async () => ({data: unstable, error: null})},
  });
  assert.deepEqual(await accessorResult.prune(), {requestDeleted: 0, ipDeleted: 0});
  assert.equal(reads, 1);
});

test('transport failures are sanitized and timeout makes no retry or late follow-up', async () => {
  for (const rpc of [
    async () => null,
    async () => ({data: {requestDeleted: 0, ipDeleted: 0}}),
    async () => ({data: {requestDeleted: 0, ipDeleted: 0}, error: {message: 'private SQL'}}),
    async () => {throw new Error('private transport detail');},
  ]) {
    const retention = createAuthRequestRetention({rpcClient: {rpc}});
    await assert.rejects(
      () => retention.prune(),
      error => error instanceof AuthRequestRetentionError
        && error.code === 'AUTH_REQUEST_RETENTION_UNAVAILABLE'
        && error.status === 503
        && !error.message.includes('private')
        && !error.cause
    );
  }

  const late = deferred();
  let calls = 0;
  const retention = createAuthRequestRetention({
    rpcClient: {rpc: () => {calls++; return late.promise;}},
    timeoutMs: 10,
  });
  await assert.rejects(
    () => retention.prune(),
    error => error instanceof AuthRequestRetentionError
  );
  late.resolve({data: {requestDeleted: 0, ipDeleted: 0}, error: null});
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal(calls, 1);
});

test('construction rejects invalid configuration and browser globals', () => {
  const rpcClient = {rpc: async () => ({data: {requestDeleted: 0, ipDeleted: 0}, error: null})};
  for (const options of [
    undefined,
    {},
    {rpcClient: {}},
    {rpcClient, timeoutMs: 0},
    {rpcClient, timeoutMs: 30001},
    {rpcClient, timeoutMs: 1.5},
  ]) {
    assert.throws(() => createAuthRequestRetention(options), TypeError);
  }

  const previousWindow = global.window;
  global.window = {};
  try {
    assert.throws(() => createAuthRequestRetention({rpcClient}), TypeError);
  } finally {
    if (previousWindow === undefined) delete global.window;
    else global.window = previousWindow;
  }
});

async function prepareDatabase(db) {
  await db.exec('create role anon; create role authenticated; create role service_role bypassrls; create role moaon_test_public;');
  await db.exec(await fs.readFile(REQUEST_SQL_FILE, 'utf8'));
  await db.exec(await fs.readFile(ADMISSION_SQL_FILE, 'utf8'));
  const retentionSql = await fs.readFile(RETENTION_SQL_FILE, 'utf8');
  await db.exec(retentionSql);
  await db.exec(retentionSql);
}

async function prune(db) {
  const result = await db.query('select public.moaon_prune_auth_request_limits() as counts');
  return result.rows[0].counts;
}

test('SQL prunes at most 500 stale subject and IP rows per call and preserves current, GLOBAL, and future rows', async () => {
  const db = new PGlite();
  try {
    await prepareDatabase(db);
    await db.exec(`
      insert into moaon_auth.request_limits(kind,subject_hash,started_at,used)
      select 'LOGIN',lpad(to_hex(value),64,'0'),clock_timestamp()-interval '25 hours'-value*interval '1 millisecond',1
      from generate_series(1,501) as value;
      insert into moaon_auth.request_limits(kind,subject_hash,started_at,used) values
        ('LOGIN',repeat('c',64),clock_timestamp()-interval '24 hours 1 minute',1),
        ('LOGIN',repeat('d',64),clock_timestamp()-interval '23 hours 59 minutes',1),
        ('LOGIN',repeat('f',64),clock_timestamp()-interval '1 hour',1),
        ('LOGIN',repeat('e',64),clock_timestamp()+interval '1 hour',1);

      insert into moaon_auth.admission_limits(scope,key_hash,started_at,used)
      select 'IP',lpad(to_hex(value),64,'0'),clock_timestamp()-interval '25 hours'-value*interval '1 millisecond',1
      from generate_series(1,501) as value;
      insert into moaon_auth.admission_limits(scope,key_hash,started_at,used) values
        ('GLOBAL',repeat('0',64),clock_timestamp()-interval '25 hours',1),
        ('IP',repeat('c',64),clock_timestamp()-interval '24 hours 1 minute',1),
        ('IP',repeat('d',64),clock_timestamp()-interval '23 hours 59 minutes',1),
        ('IP',repeat('f',64),clock_timestamp()-interval '1 hour',1),
        ('IP',repeat('e',64),clock_timestamp()+interval '1 hour',1);
    `);

    assert.deepEqual(await prune(db), {requestDeleted: 500, ipDeleted: 500});
    assert.deepEqual(await prune(db), {requestDeleted: 2, ipDeleted: 2});
    assert.deepEqual(await prune(db), {requestDeleted: 0, ipDeleted: 0});
    assert.deepEqual((await db.query(`
      select kind,subject_hash from moaon_auth.request_limits order by subject_hash
    `)).rows, [
      {kind: 'LOGIN', subject_hash: 'd'.repeat(64)},
      {kind: 'LOGIN', subject_hash: 'e'.repeat(64)},
      {kind: 'LOGIN', subject_hash: 'f'.repeat(64)},
    ]);
    assert.deepEqual((await db.query(`
      select scope,key_hash from moaon_auth.admission_limits order by scope,key_hash
    `)).rows, [
      {scope: 'GLOBAL', key_hash: '0'.repeat(64)},
      {scope: 'IP', key_hash: 'd'.repeat(64)},
      {scope: 'IP', key_hash: 'e'.repeat(64)},
      {scope: 'IP', key_hash: 'f'.repeat(64)},
    ]);
  } finally {
    await db.close();
  }
});

test('SQL uses service-role-only execution and rollback restores both deleted counters', async () => {
  const db = new PGlite();
  try {
    await prepareDatabase(db);
    await db.exec(`
      insert into moaon_auth.request_limits(kind,subject_hash,started_at,used)
      values ('LOGIN',repeat('a',64),clock_timestamp()-interval '25 hours',1);
      insert into moaon_auth.admission_limits(scope,key_hash,started_at,used)
      values ('IP',repeat('b',64),clock_timestamp()-interval '25 hours',1);
    `);

    for (const role of ['moaon_test_public', 'anon', 'authenticated']) {
      await db.exec('begin');
      try {
        await db.exec(`set local role ${role}`);
        await assert.rejects(() => prune(db), /permission denied/i);
      } finally {
        await db.exec('rollback');
      }
    }

    await db.exec('begin');
    await db.exec('set local role service_role');
    assert.deepEqual(await prune(db), {requestDeleted: 1, ipDeleted: 1});
    assert.deepEqual((await db.query(`
      select
        (select count(*)::integer from moaon_auth.request_limits) as request_count,
        (select count(*)::integer from moaon_auth.admission_limits) as admission_count
    `)).rows, [{request_count: 0, admission_count: 0}]);
    await db.exec('rollback');

    assert.deepEqual((await db.query(`
      select
        (select count(*)::integer from moaon_auth.request_limits) as request_count,
        (select count(*)::integer from moaon_auth.admission_limits) as admission_count
    `)).rows, [{request_count: 1, admission_count: 1}]);
    assert.deepEqual((await db.query(`
      select
        has_table_privilege('service_role','moaon_auth.request_limits','delete') as request_delete,
        has_table_privilege('service_role','moaon_auth.admission_limits','delete') as admission_delete,
        has_schema_privilege('service_role','moaon_auth','usage') as service_schema,
        has_schema_privilege('moaon_test_public','moaon_auth','usage') as public_schema,
        has_function_privilege('service_role','public.moaon_prune_auth_request_limits()','execute') as service_execute,
        has_function_privilege('anon','public.moaon_prune_auth_request_limits()','execute') as anon_execute,
        has_function_privilege('authenticated','public.moaon_prune_auth_request_limits()','execute') as authenticated_execute,
        has_function_privilege('moaon_test_public','public.moaon_prune_auth_request_limits()','execute') as public_execute
    `)).rows, [{
      request_delete: true,
      admission_delete: true,
      service_schema: true,
      public_schema: false,
      service_execute: true,
      anon_execute: false,
      authenticated_execute: false,
      public_execute: false,
    }]);
  } finally {
    await db.close();
  }
});

test('consumer first use starts zero buckets after acquisition while future zero and nonzero windows stay unchanged', async () => {
  const db = new PGlite();
  try {
    await prepareDatabase(db);
    const requestCurrent = '1'.repeat(64);
    const requestFuture = '2'.repeat(64);
    const requestUsed = '3'.repeat(64);
    await db.query(`
      insert into moaon_auth.request_limits(kind,subject_hash,started_at,used) values
        ('LOGIN',$1,clock_timestamp()-interval '1 minute',0),
        ('LOGIN',$2,clock_timestamp()+interval '1 hour',0),
        ('LOGIN',$3,clock_timestamp()-interval '1 minute',2)
    `, [requestCurrent, requestFuture, requestUsed]);
    const requestBefore = (await db.query(`
      select subject_hash,started_at from moaon_auth.request_limits order by subject_hash
    `)).rows;
    const requestMarker = (await db.query('select clock_timestamp() as at')).rows[0].at;
    for (const hash of [requestCurrent, requestFuture, requestUsed]) {
      assert.equal((await db.query(
        'select public.moaon_consume_auth_request($1,$2) as allowed',
        ['LOGIN', hash]
      )).rows[0].allowed, true);
    }
    const requestAfter = (await db.query(`
      select subject_hash,started_at,used from moaon_auth.request_limits order by subject_hash
    `)).rows;
    assert.equal(requestAfter[0].started_at >= requestMarker, true);
    assert.deepEqual(requestAfter.map(row => row.used), [1, 1, 3]);
    assert.equal(requestAfter[1].started_at.getTime(), requestBefore[1].started_at.getTime());
    assert.equal(requestAfter[2].started_at.getTime(), requestBefore[2].started_at.getTime());

    const globalKey = '0'.repeat(64);
    await db.query(`
      insert into moaon_auth.admission_limits(scope,key_hash,started_at,used) values
        ('GLOBAL',$1,clock_timestamp()-interval '1 minute',0),
        ('IP',$2,clock_timestamp()-interval '1 minute',0)
    `, [globalKey, requestCurrent]);
    const admissionMarker = (await db.query('select clock_timestamp() as at')).rows[0].at;
    assert.equal((await db.query(
      'select public.moaon_consume_auth_admission($1) as allowed',
      [requestCurrent]
    )).rows[0].allowed, true);
    const currentAdmission = (await db.query(`
      select scope,started_at,used from moaon_auth.admission_limits order by scope
    `)).rows;
    assert.equal(currentAdmission.every(row => row.started_at >= admissionMarker), true);
    assert.deepEqual(currentAdmission.map(row => row.used), [1, 1]);

    await db.exec('truncate moaon_auth.admission_limits');
    await db.query(`
      insert into moaon_auth.admission_limits(scope,key_hash,started_at,used) values
        ('GLOBAL',$1,clock_timestamp()+interval '1 hour',0),
        ('IP',$2,clock_timestamp()+interval '1 hour',0)
    `, [globalKey, requestFuture]);
    const futureBefore = (await db.query(`
      select scope,started_at from moaon_auth.admission_limits order by scope
    `)).rows;
    assert.equal((await db.query(
      'select public.moaon_consume_auth_admission($1) as allowed',
      [requestFuture]
    )).rows[0].allowed, true);
    const futureAfter = (await db.query(`
      select scope,started_at,used from moaon_auth.admission_limits order by scope
    `)).rows;
    assert.deepEqual(futureAfter.map(row => row.used), [1, 1]);
    assert.deepEqual(
      futureAfter.map(row => row.started_at.getTime()),
      futureBefore.map(row => row.started_at.getTime())
    );

    await db.exec('truncate moaon_auth.admission_limits');
    await db.query(`
      insert into moaon_auth.admission_limits(scope,key_hash,started_at,used) values
        ('GLOBAL',$1,clock_timestamp()-interval '1 minute',2),
        ('IP',$2,clock_timestamp()-interval '1 minute',2)
    `, [globalKey, requestUsed]);
    const usedBefore = (await db.query(`
      select scope,started_at from moaon_auth.admission_limits order by scope
    `)).rows;
    assert.equal((await db.query(
      'select public.moaon_consume_auth_admission($1) as allowed',
      [requestUsed]
    )).rows[0].allowed, true);
    const usedAfter = (await db.query(`
      select scope,started_at,used from moaon_auth.admission_limits order by scope
    `)).rows;
    assert.deepEqual(usedAfter.map(row => row.used), [3, 3]);
    assert.deepEqual(
      usedAfter.map(row => row.started_at.getTime()),
      usedBefore.map(row => row.started_at.getTime())
    );
  } finally {
    await db.close();
  }
});
