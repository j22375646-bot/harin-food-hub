'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {PGlite} = require('@electric-sql/pglite');
const {
  createRecoveryReviewResolver,
  RecoveryReviewResolutionError,
} = require('../lib/tenancy/recovery-review-resolver.js');
const {
  USER,
  OPERATOR,
  OTHER,
  OPERATION,
  RESOLUTION,
  install,
  seed,
} = require('./helpers/recovery-resolution-fixture.js');

const UPPER_USER = 'ABCDEFAB-CDEF-4ABC-8ABC-ABCDEFABCDEF';
const UPPER_OPERATOR = 'ABCDEFAB-CDEF-4ABC-9ABC-ABCDEFABCDE0';
const UPPER_OPERATION = 'ABCDEFAB-CDEF-4ABC-AABC-ABCDEFABCDE1';
const UPPER_RESOLUTION = 'ABCDEFAB-CDEF-4ABC-BABC-ABCDEFABCDE2';
const VERSION = 'a'.repeat(64);

function deferred() {
  let resolve;
  const promise = new Promise(done => {resolve = done;});
  return {promise, resolve};
}

function inspectResponse(overrides = {}) {
  return {
    userId: UPPER_USER.toLowerCase(),
    operationId: UPPER_OPERATION.toLowerCase(),
    status: 'PENDING',
    stage: null,
    version: VERSION,
    decision: 'CLOSE_NOT_STARTED',
    ...overrides,
  };
}

function resolveResponse(overrides = {}) {
  return {
    userId: UPPER_USER.toLowerCase(),
    operationId: UPPER_OPERATION.toLowerCase(),
    resolutionId: UPPER_RESOLUTION.toLowerCase(),
    status: 'REJECTED',
    ...overrides,
  };
}

function safeError(error) {
  return error instanceof RecoveryReviewResolutionError
    && error.code === 'RECOVERY_REVIEW_RESOLUTION_UNAVAILABLE'
    && error.status === 503
    && !error.cause
    && !/secret|password|token|owner@example/i.test(error.message);
}

test('resolver binds the trusted operator, normalizes UUIDs and maps action status', async () => {
  const calls = [];
  const resolver = createRecoveryReviewResolver({
    operatorId: UPPER_OPERATOR,
    rpcClient: {marker: true, async rpc(name, args) {
      assert.equal(this.marker, true);
      calls.push({name, args});
      return {
        data: name === 'moaon_inspect_recovery_review'
          ? inspectResponse({userId: UPPER_USER, operationId: UPPER_OPERATION})
          : resolveResponse({userId: UPPER_USER, operationId: UPPER_OPERATION, resolutionId: UPPER_RESOLUTION}),
        error: null,
      };
    }},
  });

  const inspection = await resolver.inspect({userId: UPPER_USER, operationId: UPPER_OPERATION});
  const resolution = await resolver.resolve({
    userId: UPPER_USER,
    operationId: UPPER_OPERATION,
    resolutionId: UPPER_RESOLUTION,
    expectedVersion: VERSION,
    action: 'CLOSE_NOT_STARTED',
  });

  assert.deepEqual(inspection, inspectResponse());
  assert.deepEqual(resolution, resolveResponse());
  assert.equal(Object.isFrozen(inspection), true);
  assert.equal(Object.isFrozen(resolution), true);
  assert.deepEqual(calls, [
    {name: 'moaon_inspect_recovery_review', args: {
      p_operator_id: UPPER_OPERATOR.toLowerCase(),
      p_user_id: UPPER_USER.toLowerCase(),
      p_operation_id: UPPER_OPERATION.toLowerCase(),
    }},
    {name: 'moaon_resolve_recovery_review', args: {
      p_operator_id: UPPER_OPERATOR.toLowerCase(),
      p_user_id: UPPER_USER.toLowerCase(),
      p_operation_id: UPPER_OPERATION.toLowerCase(),
      p_resolution_id: UPPER_RESOLUTION.toLowerCase(),
      p_expected_version: VERSION,
      p_action: 'CLOSE_NOT_STARTED',
    }},
  ]);
});

test('invalid configuration and exact-own-key input mistakes fail before RPC', async () => {
  let calls = 0;
  const rpcClient = {rpc: async () => {calls++; return {data: inspectResponse(), error: null};}};
  const symbol = Symbol('operator');
  for (const options of [
    undefined,
    {},
    {rpcClient: {}, operatorId: UPPER_OPERATOR},
    {rpcClient, operatorId: 'not-a-uuid'},
    {rpcClient, operatorId: UPPER_OPERATOR, timeoutMs: 0},
    {rpcClient, operatorId: UPPER_OPERATOR, timeoutMs: 30001},
    {rpcClient, operatorId: UPPER_OPERATOR, extra: true},
    Object.assign({rpcClient, operatorId: UPPER_OPERATOR}, {[symbol]: true}),
  ]) assert.throws(() => createRecoveryReviewResolver(options), TypeError);

  const resolver = createRecoveryReviewResolver({rpcClient, operatorId: UPPER_OPERATOR});
  const inspectInputs = [
    {},
    {userId: UPPER_USER},
    {userId: 'bad', operationId: UPPER_OPERATION},
    {userId: UPPER_USER, operationId: UPPER_OPERATION, operatorId: UPPER_OPERATOR},
    {userId: UPPER_USER, operationId: UPPER_OPERATION, extra: true},
    Object.assign({userId: UPPER_USER, operationId: UPPER_OPERATION}, {[symbol]: true}),
  ];
  for (const input of inspectInputs) await assert.rejects(() => resolver.inspect(input), TypeError);
  const valid = {
    userId: UPPER_USER,
    operationId: UPPER_OPERATION,
    resolutionId: UPPER_RESOLUTION,
    expectedVersion: VERSION,
    action: 'CLOSE_NOT_STARTED',
  };
  for (const input of [
    {...valid, operatorId: UPPER_OPERATOR},
    {...valid, expectedVersion: VERSION.toUpperCase()},
    {...valid, action: 'close_not_started'},
    {...valid, resolutionId: 'bad'},
    {...valid, extra: true},
    Object.assign({...valid}, {[symbol]: true}),
  ]) await assert.rejects(() => resolver.resolve(input), TypeError);
  assert.equal(calls, 0);
});

test('inspection accepts only compatible exact responses and reads every getter once', async () => {
  const compatible = [
    ['PENDING', null, 'CHECK_REQUIRED'],
    ['PENDING', null, 'KEEP_BLOCKED'],
    ['PENDING', null, 'CONFIRM_COMPLETED'],
    ['PENDING', null, 'CLOSE_NOT_STARTED'],
    ['REVIEW_REQUIRED', 'PASSWORD_UPDATE', 'CHECK_REQUIRED'],
    ['REVIEW_REQUIRED', 'FENCE_COMPLETE', 'CONFIRM_COMPLETED'],
    ['COMPLETED', 'PROVIDER_SIGNOUT', 'ALREADY_CLOSED'],
    ['REJECTED', null, 'ALREADY_CLOSED'],
  ];
  for (const [status, stage, decision] of compatible) {
    const values = inspectResponse({status, stage, decision});
    const reads = new Map();
    const data = {};
    for (const [key, value] of Object.entries(values)) Object.defineProperty(data, key, {
      enumerable: true,
      get() {reads.set(key, (reads.get(key) || 0) + 1); return value;},
    });
    const resolver = createRecoveryReviewResolver({
      operatorId: UPPER_OPERATOR,
      rpcClient: {rpc: async () => ({data, error: null})},
    });
    assert.deepEqual(await resolver.inspect({userId: UPPER_USER, operationId: UPPER_OPERATION}), values);
    assert.deepEqual(Object.fromEntries(reads), Object.fromEntries(Object.keys(values).map(key => [key, 1])));
  }
});

test('malformed inspection identity, keys, enums and compatibility are sanitized', async () => {
  const symbol = Symbol('secret');
  const inherited = Object.create({decision: 'CLOSE_NOT_STARTED'});
  Object.assign(inherited, inspectResponse());
  delete inherited.decision;
  const malformed = [
    null,
    [inspectResponse()],
    {...inspectResponse(), extra: 'secret'},
    Object.assign(inspectResponse(), {[symbol]: 'secret'}),
    inherited,
    inspectResponse({userId: UPPER_OPERATOR}),
    inspectResponse({operationId: UPPER_RESOLUTION}),
    inspectResponse({status: 'UNKNOWN'}),
    inspectResponse({stage: 'PASSWORD'}),
    inspectResponse({status: 'PENDING', stage: 'PASSWORD_UPDATE'}),
    inspectResponse({status: 'REVIEW_REQUIRED', stage: null}),
    inspectResponse({status: 'COMPLETED', decision: 'CONFIRM_COMPLETED'}),
    inspectResponse({status: 'PENDING', decision: 'ALREADY_CLOSED'}),
    inspectResponse({version: 'A'.repeat(64)}),
  ];
  for (const data of malformed) {
    const resolver = createRecoveryReviewResolver({
      operatorId: UPPER_OPERATOR,
      rpcClient: {rpc: async () => ({data, error: null})},
    });
    await assert.rejects(() => resolver.inspect({userId: UPPER_USER, operationId: UPPER_OPERATION}), safeError);
  }
});

test('resolution accepts only matching identity and action-specific terminal status', async () => {
  for (const [action, status] of [['CONFIRM_COMPLETED', 'COMPLETED'], ['CLOSE_NOT_STARTED', 'REJECTED']]) {
    const values = resolveResponse({status});
    const reads = new Map();
    const data = {};
    for (const [key, value] of Object.entries(values)) Object.defineProperty(data, key, {
      enumerable: true,
      get() {reads.set(key, (reads.get(key) || 0) + 1); return value;},
    });
    const resolver = createRecoveryReviewResolver({
      operatorId: UPPER_OPERATOR,
      rpcClient: {rpc: async () => ({data, error: null})},
    });
    const result = await resolver.resolve({
      userId: UPPER_USER,
      operationId: UPPER_OPERATION,
      resolutionId: UPPER_RESOLUTION,
      expectedVersion: VERSION,
      action,
    });
    assert.equal(result.status, status);
    assert.equal(Object.isFrozen(result), true);
    assert.deepEqual(Object.fromEntries(reads), Object.fromEntries(Object.keys(values).map(key => [key, 1])));
  }

  const symbol = Symbol('secret');
  for (const data of [
    {...resolveResponse(), extra: true},
    Object.assign(resolveResponse(), {[symbol]: true}),
    resolveResponse({userId: UPPER_OPERATOR}),
    resolveResponse({operationId: UPPER_RESOLUTION}),
    resolveResponse({resolutionId: UPPER_OPERATION}),
    resolveResponse({status: 'COMPLETED'}),
    resolveResponse({status: 'PENDING'}),
  ]) {
    const resolver = createRecoveryReviewResolver({
      operatorId: UPPER_OPERATOR,
      rpcClient: {rpc: async () => ({data, error: null})},
    });
    await assert.rejects(() => resolver.resolve({
      userId: UPPER_USER,
      operationId: UPPER_OPERATION,
      resolutionId: UPPER_RESOLUTION,
      expectedVersion: VERSION,
      action: 'CLOSE_NOT_STARTED',
    }), safeError);
  }
});

test('RPC failure, malformed envelope and timeout are sanitized without retry or late continuation', async () => {
  const late = deferred();
  let calls = 0;
  const cases = [
    async () => {throw Error('provider password token secret owner@example.test');},
    async () => ({data: inspectResponse(), error: {message: 'database secret'}}),
    async () => ({data: inspectResponse()}),
  ];
  for (const rpc of cases) {
    const resolver = createRecoveryReviewResolver({rpcClient: {rpc}, operatorId: UPPER_OPERATOR});
    await assert.rejects(() => resolver.inspect({userId: UPPER_USER, operationId: UPPER_OPERATION}), safeError);
  }
  const resolver = createRecoveryReviewResolver({
    rpcClient: {rpc: () => {calls++; return late.promise;}},
    operatorId: UPPER_OPERATOR,
    timeoutMs: 10,
  });
  await assert.rejects(() => resolver.inspect({userId: UPPER_USER, operationId: UPPER_OPERATION}), safeError);
  late.resolve({data: inspectResponse(), error: null});
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal(calls, 1);
});

function rpcFor(db) {
  return {async rpc(name, args) {
    try {
      const values = name === 'moaon_inspect_recovery_review'
        ? [args.p_operator_id, args.p_user_id, args.p_operation_id]
        : [args.p_operator_id, args.p_user_id, args.p_operation_id, args.p_resolution_id,
          args.p_expected_version, args.p_action];
      const parameters = values.map((_, index) => `$${index + 1}`).join(',');
      const result = await db.query(`select public.${name}(${parameters}) as data`, values);
      return {data: result.rows[0].data, error: null};
    } catch (error) {
      return {data: null, error: {code: error.code, message: error.message}};
    }
  }};
}

async function prepareDatabase() {
  const db = new PGlite();
  await db.exec('create role anon; create role authenticated; create role service_role bypassrls; create schema auth; create table auth.users(id uuid primary key);');
  await install(db);
  await seed(db);
  await db.exec('set role service_role');
  return db;
}

test('real adapter and installed PGlite SQL inspect, close, reject stale/untrusted requests and replay exactly', async () => {
  const db = await prepareDatabase();
  try {
    const resolver = createRecoveryReviewResolver({rpcClient: rpcFor(db), operatorId: OPERATOR});
    const inspection = await resolver.inspect({userId: USER, operationId: OPERATION});
    assert.equal(inspection.decision, 'CLOSE_NOT_STARTED');
    const request = {userId: USER, operationId: OPERATION, resolutionId: RESOLUTION,
      expectedVersion: inspection.version, action: 'CLOSE_NOT_STARTED'};
    assert.deepEqual(await resolver.resolve(request), {
      userId: USER, operationId: OPERATION, resolutionId: RESOLUTION, status: 'REJECTED',
    });
    assert.deepEqual(await resolver.resolve(request), {
      userId: USER, operationId: OPERATION, resolutionId: RESOLUTION, status: 'REJECTED',
    });
    await assert.rejects(() => resolver.resolve({...request, resolutionId: '60000000-0000-4000-8000-000000000002'}), safeError);

    const untrusted = createRecoveryReviewResolver({rpcClient: rpcFor(db), operatorId: OTHER});
    await assert.rejects(() => untrusted.inspect({userId: USER, operationId: OPERATION}), safeError);
    await assert.rejects(() => resolver.inspect({userId: OTHER, operationId: OPERATION}), safeError);
  } finally {await db.close();}
});

test('real adapter confirms completed evidence and rejects a stale inspection version', async () => {
  const db = await prepareDatabase();
  try {
    const resolver = createRecoveryReviewResolver({rpcClient: rpcFor(db), operatorId: OPERATOR});
    await db.exec('reset role');
    await db.query(`insert into moaon_auth.password_changes(user_id,id,status,completed_at)
      values($1,$2,'COMPLETED',clock_timestamp())`, [USER, OPERATION]);
    await db.exec('set role service_role');
    const completed = await resolver.inspect({userId: USER, operationId: OPERATION});
    assert.equal(completed.decision, 'CONFIRM_COMPLETED');
    await db.exec('reset role');
    await db.query('update moaon_auth.account_state set generation=generation+1 where user_id=$1', [USER]);
    await db.exec('set role service_role');
    await assert.rejects(() => resolver.resolve({
      userId: USER, operationId: OPERATION, resolutionId: RESOLUTION,
      expectedVersion: completed.version, action: 'CONFIRM_COMPLETED',
    }), safeError);
    const fresh = await resolver.inspect({userId: USER, operationId: OPERATION});
    assert.deepEqual(await resolver.resolve({
      userId: USER, operationId: OPERATION, resolutionId: RESOLUTION,
      expectedVersion: fresh.version, action: 'CONFIRM_COMPLETED',
    }), {userId: USER, operationId: OPERATION, resolutionId: RESOLUTION, status: 'COMPLETED'});
  } finally {await db.close();}
});
