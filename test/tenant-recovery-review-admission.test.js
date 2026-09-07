'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const {
  createRecoveryReviewAdmission,
} = require('../lib/tenancy/recovery-review-admission.js');
const {prepareRequestDatabase} = require('./helpers/recovery-request-fixture.js');
const {preservedState} = require('./helpers/recovery-resolution-fixture.js');

const OPERATOR = '20000000-0000-4000-8000-000000000002';
const SESSION = '30000000-0000-4000-8000-000000000001';
const SQL_FILE = path.join(__dirname, '../lib/tenancy/sql/recovery-review-admission.sql');

function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return {promise, resolve};
}

test('admission sends one normalized fixed RPC and returns a frozen literal decision', async () => {
  const calls = [];
  const admission = createRecoveryReviewAdmission({
    rpcClient: {marker: 'bound-client', async rpc(name, args) {
      assert.equal(this.marker, 'bound-client');
      calls.push({name, args});
      return {data: true, error: null};
    }},
  });

  const decision = await admission({
    operatorId: OPERATOR.toUpperCase(),
    sessionId: SESSION.toUpperCase(),
    mode: 'inspect',
  });

  assert.deepEqual(decision, {allowed: true});
  assert.equal(Object.isFrozen(decision), true);
  assert.deepEqual(calls, [{
    name: 'moaon_consume_recovery_review',
    args: {p_operator_id: OPERATOR, p_session_id: SESSION, p_mode: 'inspect'},
  }]);
});

test('factory and admission reject non-exact input before transport', async () => {
  let calls = 0;
  const rpcClient = {async rpc() { calls += 1; return {data: true, error: null}; }};
  const symbol = Symbol('hidden');
  for (const options of [
    undefined,
    {},
    {rpcClient: {}},
    {rpcClient, timeoutMs: 0},
    {rpcClient, timeoutMs: 30001},
    {rpcClient, timeoutMs: 1.5},
    {rpcClient, extra: true},
    Object.assign({rpcClient}, {[symbol]: true}),
  ]) assert.throws(() => createRecoveryReviewAdmission(options), TypeError);

  const admission = createRecoveryReviewAdmission({rpcClient});
  for (const input of [
    undefined,
    {},
    {operatorId: OPERATOR, sessionId: SESSION, mode: 'inspect', extra: true},
    Object.assign({operatorId: OPERATOR, sessionId: SESSION, mode: 'inspect'}, {[symbol]: true}),
    {operatorId: 'bad', sessionId: SESSION, mode: 'inspect'},
    {operatorId: OPERATOR, sessionId: '30000000-0000-9000-8000-000000000001', mode: 'inspect'},
    {operatorId: OPERATOR, sessionId: SESSION, mode: 'INSPECT'},
    {operatorId: OPERATOR, sessionId: SESSION, mode: null},
  ]) await assert.rejects(() => admission(input), TypeError);
  assert.equal(calls, 0);
});

test('admission copies each input once and accepts only literal boolean provider data', async () => {
  const reads = new Map();
  const input = {};
  for (const [key, value] of Object.entries({operatorId: OPERATOR, sessionId: SESSION, mode: 'resolve'})) {
    Object.defineProperty(input, key, {
      enumerable: true,
      get() { reads.set(key, (reads.get(key) || 0) + 1); return value; },
    });
  }
  const admission = createRecoveryReviewAdmission({
    rpcClient: {rpc: async () => ({data: false, error: null})},
  });
  assert.deepEqual(await admission(input), {allowed: false});
  assert.deepEqual(Object.fromEntries(reads), {operatorId: 1, sessionId: 1, mode: 1});

  for (const rpc of [
    async () => ({data: 1, error: null}),
    async () => ({data: 'true', error: null}),
    async () => ({data: [true], error: null}),
    async () => ({data: true}),
    async () => ({data: true, error: {message: 'private database detail'}}),
    async () => { throw new Error('private provider detail'); },
  ]) {
    const unavailable = createRecoveryReviewAdmission({rpcClient: {rpc}});
    await assert.rejects(
      () => unavailable({operatorId: OPERATOR, sessionId: SESSION, mode: 'inspect'}),
      error => error?.name === 'RecoveryReviewAdmissionError'
        && error.code === 'RECOVERY_REVIEW_UNAVAILABLE'
        && error.status === 503
        && error.message === 'Recovery review admission is unavailable.'
        && !error.cause
        && !error.message.includes('private')
    );
  }
});

test('admission timeout dispatches once and never retries late completion', async () => {
  const late = deferred();
  let calls = 0;
  const admission = createRecoveryReviewAdmission({
    timeoutMs: 10,
    rpcClient: {rpc() { calls += 1; return late.promise; }},
  });
  await assert.rejects(
    () => admission({operatorId: OPERATOR, sessionId: SESSION, mode: 'inspect'}),
    error => error?.code === 'RECOVERY_REVIEW_UNAVAILABLE' && error.status === 503
  );
  late.resolve({data: true, error: null});
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal(calls, 1);
});

async function installAdmission(db) {
  const sql = await fs.readFile(SQL_FILE, 'utf8');
  await db.exec('reset role');
  await db.exec(sql);
  await db.exec(sql);
  await db.exec('set role service_role');
}

async function consume(db, mode = 'inspect', operatorId = OPERATOR, sessionId = SESSION) {
  return (await db.query(
    'select public.moaon_consume_recovery_review($1,$2,$3) as allowed',
    [operatorId, sessionId, mode]
  )).rows[0].allowed;
}

async function truncateLimits(db) {
  await db.exec('reset role');
  await db.exec('truncate moaon_auth.recovery_request_limits');
  await db.exec('set role service_role');
}

async function authState(db) {
  await db.exec('reset role');
  try { return await preservedState(db); }
  finally { await db.exec('set role service_role'); }
}

async function seedSession(db, {
  operatorId = OPERATOR,
  sessionId = SESSION,
  expiresAt = "clock_timestamp() + interval '1 hour'",
  revokedAt = 'null',
} = {}) {
  await db.exec('reset role');
  await db.query(`insert into public.dashboard_sessions
    (id,user_id,token_hash,username,display_name,role,expires_at,revoked_at,last_seen_at)
    values($1,$2,$3,'operator','Synthetic operator','VIEWER',${expiresAt},${revokedAt},clock_timestamp())`,
  [sessionId, operatorId, sessionId.replaceAll('-', '').padEnd(64, '0')]);
  await db.exec('set role service_role');
}

test('candidate SQL applies repeatedly and enforces exact operator inspect and resolve boundaries', async () => {
  const db = await prepareRequestDatabase();
  try {
    await seedSession(db);
    await installAdmission(db);
    for (let index = 0; index < 30; index += 1) assert.equal(await consume(db, 'inspect'), true);
    assert.equal(await consume(db, 'inspect'), false);
    for (let index = 0; index < 10; index += 1) assert.equal(await consume(db, 'resolve'), true);
    assert.equal(await consume(db, 'resolve'), false);
    assert.deepEqual((await db.query(
      `select scope,mode,used from moaon_auth.recovery_request_limits order by mode,scope`
    )).rows, [
      {scope: 'GLOBAL', mode: 'inspect', used: 30},
      {scope: 'OPERATOR', mode: 'inspect', used: 30},
      {scope: 'GLOBAL', mode: 'resolve', used: 10},
      {scope: 'OPERATOR', mode: 'resolve', used: 10},
    ]);
  } finally {
    await db.close();
  }
});

test('GLOBAL quota is shared and an exhausted half never increments the available half', async () => {
  const db = await prepareRequestDatabase();
  const other = '20000000-0000-4000-8000-000000000003';
  const otherSession = '30000000-0000-4000-8000-000000000003';
  try {
    await seedSession(db);
    await seedSession(db, {operatorId: other, sessionId: otherSession});
    await db.exec('reset role');
    await db.query('insert into moaon_auth.recovery_operators(user_id) values($1)', [other]);
    await db.exec('set role service_role');
    await installAdmission(db);

    await db.query(`insert into moaon_auth.recovery_request_limits(scope,subject_id,mode,used)
      values('GLOBAL','00000000-0000-0000-0000-000000000000','inspect',299)`);
    assert.equal(await consume(db, 'inspect'), true);
    assert.equal(await consume(db, 'inspect', other, otherSession), false);
    assert.deepEqual((await db.query(
      `select scope,subject_id::text as subject_id,used from moaon_auth.recovery_request_limits
       where mode='inspect' order by scope,subject_id`
    )).rows, [
      {scope: 'GLOBAL', subject_id: '00000000-0000-0000-0000-000000000000', used: 300},
      {scope: 'OPERATOR', subject_id: OPERATOR, used: 1},
      {scope: 'OPERATOR', subject_id: other, used: 0},
    ]);

    await truncateLimits(db);
    await db.query(`insert into moaon_auth.recovery_request_limits(scope,subject_id,mode,used) values
      ('GLOBAL','00000000-0000-0000-0000-000000000000','inspect',0),
      ('OPERATOR',$1,'inspect',30)`, [OPERATOR]);
    assert.equal(await consume(db, 'inspect'), false);
    assert.deepEqual((await db.query(
      `select scope,used from moaon_auth.recovery_request_limits order by scope`
    )).rows, [{scope: 'GLOBAL', used: 0}, {scope: 'OPERATOR', used: 30}]);
  } finally {
    await db.close();
  }
});

test('SQL resets elapsed windows, rejects future clocks, and rolls back both increments together', async () => {
  const db = await prepareRequestDatabase();
  try {
    await seedSession(db);
    await installAdmission(db);
    await db.query(`insert into moaon_auth.recovery_request_limits(scope,subject_id,mode,started_at,used) values
      ('GLOBAL','00000000-0000-0000-0000-000000000000','resolve',clock_timestamp()-interval '60 seconds',100),
      ('OPERATOR',$1,'resolve',clock_timestamp()-interval '60 seconds',10)`, [OPERATOR]);
    assert.equal(await consume(db, 'resolve'), true);
    assert.deepEqual((await db.query(
      `select scope,used from moaon_auth.recovery_request_limits order by scope`
    )).rows, [{scope: 'GLOBAL', used: 1}, {scope: 'OPERATOR', used: 1}]);

    await truncateLimits(db);
    await db.query(`insert into moaon_auth.recovery_request_limits(scope,subject_id,mode,started_at,used) values
      ('GLOBAL','00000000-0000-0000-0000-000000000000','resolve',clock_timestamp(),0),
      ('OPERATOR',$1,'resolve',clock_timestamp()+interval '1 hour',0)`, [OPERATOR]);
    const beforeFuture = (await db.query(
      `select scope,started_at,used from moaon_auth.recovery_request_limits order by scope`
    )).rows;
    assert.equal(await consume(db, 'resolve'), false);
    assert.deepEqual((await db.query(
      `select scope,started_at,used from moaon_auth.recovery_request_limits order by scope`
    )).rows, beforeFuture);

    await truncateLimits(db);
    await db.exec('begin');
    assert.equal(await consume(db, 'inspect'), true);
    await db.exec('rollback');
    assert.equal((await db.query(
      'select count(*)::int as count from moaon_auth.recovery_request_limits'
    )).rows[0].count, 0);
  } finally {
    await db.close();
  }
});

test('SQL authority and live session failures preserve auth state and quota, with service-role-only access', async () => {
  const db = await prepareRequestDatabase();
  try {
    await seedSession(db);
    await installAdmission(db);
    const beforeAuth = await authState(db);

    for (const [operatorId, sessionId] of [
      ['20000000-0000-4000-8000-000000000003', SESSION],
      [OPERATOR, '30000000-0000-4000-8000-000000000009'],
    ]) await assert.rejects(() => consume(db, 'inspect', operatorId, sessionId), /REJECTED/);
    await assert.rejects(() => consume(db, 'unknown'), /REJECTED/);
    assert.equal((await db.query(
      'select count(*)::int as count from moaon_auth.recovery_request_limits'
    )).rows[0].count, 0);
    assert.deepEqual(await authState(db), beforeAuth);

    await db.exec('reset role');
    await db.query('update public.dashboard_sessions set revoked_at=clock_timestamp() where id=$1', [SESSION]);
    await db.exec('set role service_role');
    const beforeRevokedAttempt = await authState(db);
    await assert.rejects(() => consume(db), /REJECTED/);
    assert.deepEqual(await authState(db), beforeRevokedAttempt);
    await db.exec('reset role');
    await db.query(`update public.dashboard_sessions set revoked_at=null,
      expires_at=clock_timestamp()-interval '1 second' where id=$1`, [SESSION]);
    await db.exec('set role service_role');
    const beforeExpiredAttempt = await authState(db);
    await assert.rejects(() => consume(db), /REJECTED/);
    assert.equal((await db.query(
      'select count(*)::int as count from moaon_auth.recovery_request_limits'
    )).rows[0].count, 0);

    for (const role of ['anon', 'authenticated']) {
      for (const denied of [
        () => consume(db),
        () => db.query('select * from moaon_auth.recovery_request_limits'),
      ]) {
        await db.exec('begin');
        try {
          await db.exec(`set local role ${role}`);
          await assert.rejects(denied, /permission denied/i);
        } finally {
          await db.exec('rollback');
        }
      }
    }
    assert.deepEqual(await authState(db), beforeExpiredAttempt);
  } finally {
    await db.close();
  }
});
