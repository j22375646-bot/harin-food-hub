'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const {PGlite} = require('@electric-sql/pglite');
const {
  createAuthRequestLimit,
  AuthRequestLimitError,
} = require('../lib/tenancy/auth-request-limit.js');
const {createBoundedAuthRpc} = require('../lib/tenancy/bounded-auth-rpc.js');

const KEY = 'test-only-auth-request-hmac-key-32-bytes';
const SQL_FILE = path.join(__dirname, '../lib/tenancy/sql/auth-request-limit.sql');

function expectedHash(kind, subject) {
  return crypto.createHmac('sha256', KEY)
    .update(JSON.stringify([kind, subject]))
    .digest('hex');
}

function deferred() {
  let resolve;
  const promise = new Promise(done => {resolve = done;});
  return {promise, resolve};
}

test('adapter sends a scoped HMAC only, and distinct kind or subject changes it', async () => {
  const calls = [];
  const rpcClient = {marker: 'bound', async rpc(name, args) {
    assert.equal(this.marker, 'bound');
    calls.push({name, args});
    return {data: true, error: null};
  }};
  const limit = createAuthRequestLimit({rpcClient, hmacKey: KEY});

  assert.deepEqual(await limit({kind: 'LOGIN', subject: 'owner@example.test'}), {allowed: true});
  assert.deepEqual(await limit({kind: 'LOGIN', subject: 'other@example.test'}), {allowed: true});
  assert.deepEqual(await limit({kind: 'RECOVERY_MAIL', subject: 'owner@example.test'}), {allowed: true});

  assert.deepEqual(calls, [
    {name: 'moaon_consume_auth_request', args: {
      p_kind: 'LOGIN',
      p_subject_hash: expectedHash('LOGIN', 'owner@example.test'),
    }},
    {name: 'moaon_consume_auth_request', args: {
      p_kind: 'LOGIN',
      p_subject_hash: expectedHash('LOGIN', 'other@example.test'),
    }},
    {name: 'moaon_consume_auth_request', args: {
      p_kind: 'RECOVERY_MAIL',
      p_subject_hash: expectedHash('RECOVERY_MAIL', 'owner@example.test'),
    }},
  ]);
  assert.equal(new Set(calls.map(call => call.args.p_subject_hash)).size, 3);
  assert.equal(JSON.stringify(calls).includes('owner@example.test'), false);
  assert.equal(JSON.stringify(calls).includes(KEY), false);
});

test('invalid keys, kinds, and subjects fail before RPC access', async () => {
  let calls = 0;
  const rpcClient = {rpc: async () => {calls++; return {data: true, error: null};}};
  for (const hmacKey of [undefined, null, Buffer.alloc(32), 'x'.repeat(31), 'x'.repeat(1025)]) {
    assert.throws(() => createAuthRequestLimit({rpcClient, hmacKey}), TypeError);
  }
  const limit = createAuthRequestLimit({rpcClient, hmacKey: KEY});
  for (const kind of [undefined, '', 'login', 'UNKNOWN', {}, null]) {
    await assert.rejects(() => limit({kind, subject: 'owner'}), TypeError);
  }
  for (const subject of [undefined, '', null, {}, 'x'.repeat(4097)]) {
    await assert.rejects(() => limit({kind: 'LOGIN', subject}), TypeError);
  }
  assert.equal(calls, 0);
});

test('literal false remains a denial while malformed and transport failures are sanitized', async () => {
  const denied = createAuthRequestLimit({
    rpcClient: {rpc: async () => ({data: false, error: null})},
    hmacKey: KEY,
  });
  assert.deepEqual(await denied({kind: 'LOGIN', subject: 'owner'}), {allowed: false});

  for (const rpc of [
    async () => ({data: 1, error: null}),
    async () => ({data: [true], error: null}),
    async () => ({data: true}),
    async () => ({data: true, error: {message: 'secret database detail'}}),
    async () => {throw new Error(`secret ${KEY}`);},
  ]) {
    const limit = createAuthRequestLimit({rpcClient: {rpc}, hmacKey: KEY});
    await assert.rejects(
      () => limit({kind: 'LOGIN', subject: 'private-owner'}),
      error => error instanceof AuthRequestLimitError
        && error.code === 'AUTH_REQUEST_LIMIT_UNAVAILABLE'
        && error.status === 503
        && !error.message.includes('secret')
        && !error.message.includes(KEY)
        && !error.message.includes('private-owner')
        && !error.cause
    );
  }
});

test('timeout starts one RPC call and late success never retries', async () => {
  const late = deferred();
  let calls = 0;
  const limit = createAuthRequestLimit({
    rpcClient: {rpc: () => {calls++; return late.promise;}},
    hmacKey: KEY,
    timeoutMs: 10,
  });
  await assert.rejects(
    () => limit({kind: 'LOGIN', subject: 'owner'}),
    error => error.code === 'AUTH_REQUEST_LIMIT_UNAVAILABLE'
  );
  late.resolve({data: true, error: null});
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal(calls, 1);
});

test('shared bounded RPC validates server dependencies and preserves false data', async () => {
  const errorFactory = () => new Error('sanitized');
  for (const options of [
    undefined,
    {},
    {rpcClient: {}, timeoutMs: 1, errorFactory},
    {rpcClient: {rpc: async () => ({data: true, error: null})}, timeoutMs: 0, errorFactory},
    {rpcClient: {rpc: async () => ({data: true, error: null})}, timeoutMs: 30001, errorFactory},
    {rpcClient: {rpc: async () => ({data: true, error: null})}, timeoutMs: 1.5, errorFactory},
    {rpcClient: {rpc: async () => ({data: true, error: null})}, timeoutMs: 1, errorFactory: null},
  ]) {
    assert.throws(() => createBoundedAuthRpc(options), TypeError);
  }
  const transport = createBoundedAuthRpc({
    rpcClient: {rpc: async () => ({data: false, error: null})},
    timeoutMs: 100,
    errorFactory,
  });
  assert.equal(await transport.call('fixed_rpc', {p_value: 'safe'}), false);

  const previousWindow = global.window;
  global.window = {};
  try {
    assert.throws(() => createBoundedAuthRpc({
      rpcClient: {rpc: async () => ({data: true, error: null})},
      timeoutMs: 100,
      errorFactory,
    }), TypeError);
  } finally {
    if (previousWindow === undefined) delete global.window;
    else global.window = previousWindow;
  }
});

async function prepareDatabase(db) {
  await db.exec('create role anon; create role authenticated; create role service_role bypassrls;');
  await db.exec(await fs.readFile(SQL_FILE, 'utf8'));
}

async function consume(db, kind, hash) {
  const result = await db.query(
    'select public.moaon_consume_auth_request($1,$2) as allowed',
    [kind, hash]
  );
  return result.rows[0].allowed;
}

test('candidate SQL enforces fixed limits and keeps kinds and subjects independent', async () => {
  const db = new PGlite();
  try {
    await prepareDatabase(db);
    const a = 'a'.repeat(64);
    const b = 'b'.repeat(64);
    for (let index = 0; index < 10; index++) assert.equal(await consume(db, 'LOGIN', a), true);
    assert.equal(await consume(db, 'LOGIN', a), false);
    assert.equal(await consume(db, 'LOGIN', b), true);
    for (let index = 0; index < 3; index++) assert.equal(await consume(db, 'RECOVERY_MAIL', a), true);
    assert.equal(await consume(db, 'RECOVERY_MAIL', a), false);
    for (let index = 0; index < 5; index++) {
      assert.equal(await consume(db, 'RECOVERY_COMPLETE', a), true);
    }
    assert.equal(await consume(db, 'RECOVERY_COMPLETE', a), false);
    assert.equal(await consume(db, 'EMAIL_CONFIRM', a), true);
  } finally {
    await db.close();
  }
});

test('expired windows reset, backward clock movement cannot reset early, and rollback does not consume', async () => {
  const db = new PGlite();
  try {
    await prepareDatabase(db);
    const expired = 'c'.repeat(64);
    await db.query(
      `insert into moaon_auth.request_limits(kind,subject_hash,started_at,used)
       values ('RECOVERY_MAIL',$1,clock_timestamp()-interval '3600 seconds',3)`,
      [expired]
    );
    assert.equal(await consume(db, 'RECOVERY_MAIL', expired), true);
    assert.deepEqual((await db.query(
      'select used, started_at > clock_timestamp()-interval \'5 seconds\' as reset from moaon_auth.request_limits where kind=$1 and subject_hash=$2',
      ['RECOVERY_MAIL', expired]
    )).rows[0], {used: 1, reset: true});

    const future = 'd'.repeat(64);
    await db.query(
      `insert into moaon_auth.request_limits(kind,subject_hash,started_at,used)
       values ('LOGIN',$1,clock_timestamp()+interval '1 hour',10)`,
      [future]
    );
    assert.equal(await consume(db, 'LOGIN', future), false);

    const rolledBack = 'e'.repeat(64);
    await db.exec('begin');
    assert.equal(await consume(db, 'LOGIN', rolledBack), true);
    await db.exec('rollback');
    assert.equal((await db.query(
      'select count(*)::int as count from moaon_auth.request_limits where subject_hash=$1',
      [rolledBack]
    )).rows[0].count, 0);
  } finally {
    await db.close();
  }
});

test('invalid SQL requests write no rows and only service_role may execute the RPC', async () => {
  const db = new PGlite();
  try {
    await prepareDatabase(db);
    for (const [kind, hash] of [
      ['UNKNOWN', 'a'.repeat(64)],
      ['LOGIN', 'A'.repeat(64)],
      ['LOGIN', 'short'],
      [null, 'a'.repeat(64)],
    ]) {
      await assert.rejects(() => consume(db, kind, hash), /AUTH_REQUEST_LIMIT_REJECTED/);
    }
    assert.equal((await db.query('select count(*)::int as count from moaon_auth.request_limits')).rows[0].count, 0);

    for (const role of ['anon', 'authenticated']) {
      await db.exec('begin');
      try {
        await db.exec(`set local role ${role}`);
        await assert.rejects(() => consume(db, 'LOGIN', 'a'.repeat(64)), /permission denied/i);
      } finally {
        await db.exec('rollback');
      }
    }
    await db.exec('begin');
    try {
      await db.exec('set local role service_role');
      assert.equal(await consume(db, 'LOGIN', 'a'.repeat(64)), true);
    } finally {
      await db.exec('rollback');
    }
  } finally {
    await db.close();
  }
});

test('file-backed PGlite retains an exhausted budget after close and reopen', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'moaon-auth-limit-'));
  const dataDir = path.join(root, 'pgdata');
  let db;
  try {
    db = new PGlite(dataDir);
    await prepareDatabase(db);
    for (let index = 0; index < 5; index++) {
      assert.equal(await consume(db, 'EMAIL_CONFIRM', 'f'.repeat(64)), true);
    }
    assert.equal(await consume(db, 'EMAIL_CONFIRM', 'f'.repeat(64)), false);
    await db.close();
    db = null;

    db = new PGlite(dataDir);
    assert.equal(await consume(db, 'EMAIL_CONFIRM', 'f'.repeat(64)), false);
  } finally {
    if (db) await db.close();
    await fs.rm(root, {recursive: true, force: true});
  }
});
