'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const {PGlite} = require('@electric-sql/pglite');
const auth = require('../lib/dashboard-auth.js');
const {createAccountRecovery} = require('../lib/tenancy/account-recovery.js');
const {
  createAuthRequestAdmission,
  AuthRequestLimitError,
} = require('../lib/tenancy/auth-request-admission.js');

const KEY = 'test-only-auth-request-hmac-key-32-bytes';
const IPV4_HASH = '4fccb436109b317f9376d34e88fcf7623eeec03dbfa122a7742f3b7cb4ff22c9';
const IPV6_HASH = '70f731d94746fdd1f62c2e5b1b154dc1ec8e878d3c0d9997ad1e2302dfaa3181';
const SQL_FILE = path.join(__dirname, '../lib/tenancy/sql/auth-request-admission.sql');

function deferred() {
  let resolve;
  const promise = new Promise(done => {resolve = done;});
  return {promise, resolve};
}

async function firstIpHash(trustedClientIp) {
  const calls = [];
  const requestLimit = createAuthRequestAdmission({
    trustedClientIp,
    hmacKey: KEY,
    rpcClient: {rpc: async (name, args) => {
      calls.push({name, args});
      return {data: false, error: null};
    }},
  });
  await requestLimit({kind: 'LOGIN', subject: 'owner'});
  return calls[0].args.p_ip_hash;
}

test('literal IP fixtures canonicalize equivalent IPv6 and mapped IPv6 identities before HMAC', async () => {
  assert.equal(await firstIpHash('192.0.2.128'), IPV4_HASH);
  assert.equal(await firstIpHash('2001:0db8:0:0:0:0:0:1'), IPV6_HASH);
  assert.equal(await firstIpHash('2001:db8::1'), IPV6_HASH);
  assert.equal(await firstIpHash('::ffff:192.0.2.128'), IPV4_HASH);
  assert.equal(await firstIpHash('::FFFF:C000:0280'), IPV4_HASH);
});

test('construction rejects nonliteral IPs and unbounded keys without exposing their values', () => {
  const rpcClient = {rpc: async () => ({data: true, error: null})};
  for (const trustedClientIp of [
    undefined, null, '', ' 192.0.2.1', '192.0.2.1 ', 'host.example',
    '192.0.2.1:443', '[2001:db8::1]', 'fe80::1%eth0',
    '192.0.2.1,198.51.100.2', '999.0.0.1', '2001:db8::1/64',
  ]) {
    assert.throws(
      () => createAuthRequestAdmission({rpcClient, hmacKey: KEY, trustedClientIp}),
      error => error instanceof TypeError
        && (!trustedClientIp || !error.message.includes(String(trustedClientIp)))
    );
  }
  for (const hmacKey of [undefined, null, Buffer.alloc(32), 'x'.repeat(31), 'x'.repeat(1025)]) {
    assert.throws(
      () => createAuthRequestAdmission({rpcClient, hmacKey, trustedClientIp: '192.0.2.1'}),
      error => error instanceof TypeError && !error.message.includes(String(hmacKey))
    );
  }
});

test('IPv6 zone literal rejection does not retain the raw IP in the thrown error', () => {
  const rawIp = 'fe80::1%eth0';
  const rpcClient = {rpc: async () => ({data: true, error: null})};
  let error;
  assert.throws(
    () => createAuthRequestAdmission({rpcClient, hmacKey: KEY, trustedClientIp: rawIp}),
    thrown => {
      error = thrown;
      return thrown instanceof TypeError;
    }
  );

  assert.equal(error.message, 'An explicit literal trusted client IP is required.');
  assert.equal(JSON.stringify(error).includes(rawIp), false);
  for (const property of Object.getOwnPropertyNames(error)) {
    assert.equal(String(error[property]).includes(rawIp), false, property);
  }
});

test('all supported kinds validate before IP quota and run fixed IP before subject quota', async () => {
  const calls = [];
  const requestLimit = createAuthRequestAdmission({
    trustedClientIp: '192.0.2.128',
    hmacKey: KEY,
    rpcClient: {marker: 'bound', async rpc(name, args) {
      assert.equal(this.marker, 'bound');
      calls.push({name, args});
      return {data: true, error: null};
    }},
  });
  for (const kind of ['LOGIN', 'RECOVERY_MAIL', 'RECOVERY_COMPLETE', 'EMAIL_CONFIRM']) {
    const answer = await requestLimit({
      kind,
      subject: `subject-${kind}`,
      trustedClientIp: '203.0.113.99',
      timeoutMs: 1,
      policy: {global: 999999},
    });
    assert.deepEqual(answer, {allowed: true});
    assert.equal(Object.isFrozen(answer), true);
  }
  assert.deepEqual(calls.map(call => call.name), [
    'moaon_consume_auth_admission', 'moaon_consume_auth_request',
    'moaon_consume_auth_admission', 'moaon_consume_auth_request',
    'moaon_consume_auth_admission', 'moaon_consume_auth_request',
    'moaon_consume_auth_admission', 'moaon_consume_auth_request',
  ]);
  for (const call of calls.filter(call => call.name === 'moaon_consume_auth_admission')) {
    assert.deepEqual(call.args, {p_ip_hash: IPV4_HASH});
  }
  assert.equal(JSON.stringify(calls).includes('192.0.2.128'), false);
  assert.equal(JSON.stringify(calls).includes('203.0.113.99'), false);
  assert.equal(JSON.stringify(calls).includes(KEY), false);

  const beforeInvalid = calls.length;
  for (const kind of [undefined, '', 'login', 'UNKNOWN', {}, null]) {
    await assert.rejects(() => requestLimit({kind, subject: 'owner'}), TypeError);
  }
  for (const subject of [undefined, '', null, {}, 'x'.repeat(4097)]) {
    await assert.rejects(() => requestLimit({kind: 'LOGIN', subject}), TypeError);
  }
  assert.equal(calls.length, beforeInvalid);
});

test('IP denial is frozen and stops the subject limiter while subject denial keeps the IP charge', async () => {
  const deniedCalls = [];
  const denied = createAuthRequestAdmission({
    trustedClientIp: '192.0.2.128', hmacKey: KEY,
    rpcClient: {rpc: async (name, args) => {
      deniedCalls.push({name, args});
      return {data: false, error: null};
    }},
  });
  const answer = await denied({kind: 'LOGIN', subject: 'private-owner'});
  assert.deepEqual(answer, {allowed: false});
  assert.equal(Object.isFrozen(answer), true);
  assert.deepEqual(deniedCalls.map(call => call.name), ['moaon_consume_auth_admission']);

  const subjectCalls = [];
  const subjectDenied = createAuthRequestAdmission({
    trustedClientIp: '192.0.2.128', hmacKey: KEY,
    rpcClient: {rpc: async name => {
      subjectCalls.push(name);
      return {data: name === 'moaon_consume_auth_admission', error: null};
    }},
  });
  assert.deepEqual(await subjectDenied({kind: 'LOGIN', subject: 'private-owner'}), {allowed: false});
  assert.deepEqual(subjectCalls, ['moaon_consume_auth_admission', 'moaon_consume_auth_request']);
});

test('malformed, failed, and timed-out IP admission is sanitized and never starts subject quota', async () => {
  for (const rpc of [
    async () => ({data: 1, error: null}),
    async () => ({data: [true], error: null}),
    async () => ({data: true}),
    async () => ({data: true, error: {message: 'database secret'}}),
    async () => {throw new Error(`private 192.0.2.128 ${KEY}`);},
  ]) {
    let calls = 0;
    const requestLimit = createAuthRequestAdmission({
      trustedClientIp: '192.0.2.128', hmacKey: KEY,
      rpcClient: {rpc: (...args) => {calls++; return rpc(...args);}},
    });
    await assert.rejects(
      () => requestLimit({kind: 'LOGIN', subject: 'private-owner'}),
      error => error instanceof AuthRequestLimitError
        && error.code === 'AUTH_REQUEST_LIMIT_UNAVAILABLE'
        && error.status === 503
        && !error.message.includes('192.0.2.128')
        && !error.message.includes(KEY)
        && !error.message.includes('private-owner')
        && !error.cause
    );
    assert.equal(calls, 1);
  }

  const late = deferred();
  let timeoutCalls = 0;
  const timedOut = createAuthRequestAdmission({
    trustedClientIp: '192.0.2.128', hmacKey: KEY, timeoutMs: 10,
    rpcClient: {rpc: () => {timeoutCalls++; return late.promise;}},
  });
  await assert.rejects(
    () => timedOut({kind: 'LOGIN', subject: 'private-owner'}),
    error => error instanceof AuthRequestLimitError
  );
  late.resolve({data: true, error: null});
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal(timeoutCalls, 1);
});

test('subject failure after allowed IP remains sanitized and late completion is never retried', async () => {
  const late = deferred();
  const calls = [];
  const requestLimit = createAuthRequestAdmission({
    trustedClientIp: '192.0.2.128', hmacKey: KEY, timeoutMs: 10,
    rpcClient: {rpc: async name => {
      calls.push(name);
      if (name === 'moaon_consume_auth_admission') return {data: true, error: null};
      return late.promise;
    }},
  });
  await assert.rejects(
    () => requestLimit({kind: 'LOGIN', subject: 'private-owner'}),
    error => error instanceof AuthRequestLimitError
  );
  late.resolve({data: true, error: null});
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.deepEqual(calls, ['moaon_consume_auth_admission', 'moaon_consume_auth_request']);
});

test('composed admission denial stops actual login and recovery seams before profile or provider work', async () => {
  const requestLimit = createAuthRequestAdmission({
    trustedClientIp: '192.0.2.128', hmacKey: KEY,
    rpcClient: {rpc: async () => ({data: false, error: null})},
  });
  const loginDownstream = [];
  await assert.rejects(
    () => auth.authenticateAccount(
      {account: 'owner-a', password: '123456'},
      {from(table) {loginDownstream.push(`db:${table}`); throw new Error('must not run');}},
      {requestLimit, authClient: {auth: {signInWithPassword: async () => {
        loginDownstream.push('provider');
        return {data: null, error: null};
      }}}}
    ),
    error => error.code === 'LOGIN_RATE_LIMITED' && error.status === 429
  );
  assert.deepEqual(loginDownstream, []);

  const recoveryDownstream = [];
  const recovery = createAccountRecovery({
    requestLimit,
    provider: {
      requestRecoveryEmail: async () => recoveryDownstream.push('mail'),
      confirmEmail: async () => recoveryDownstream.push('confirm'),
      openRecovery: async () => recoveryDownstream.push('open'),
    },
    profiles: {
      findActiveByEmail: async () => recoveryDownstream.push('profile-mail'),
      getByUserId: async () => recoveryDownstream.push('profile-id'),
    },
    sessionStore: {
      beginPasswordChange: async () => recoveryDownstream.push('begin'),
      completePasswordChange: async () => recoveryDownstream.push('complete'),
    },
    randomUUID: () => '10000000-0000-4000-8000-000000000001',
  });
  await assert.rejects(
    () => recovery.requestRecovery({email: 'owner@example.test'}),
    error => error.code === 'RECOVERY_UNAVAILABLE' && error.status === 503
  );
  assert.deepEqual(recoveryDownstream, []);
});

async function prepareDatabase(db) {
  await db.exec('create role anon; create role authenticated; create role service_role bypassrls;');
  const sql = await fs.readFile(SQL_FILE, 'utf8');
  await db.exec(sql);
  await db.exec(sql);
}

async function consume(db, hash) {
  const result = await db.query('select public.moaon_consume_auth_admission($1) as allowed', [hash]);
  return result.rows[0].allowed;
}

test('candidate SQL applies repeatedly and enforces exact IP 30/31 and global 500/501 caps', async () => {
  const db = new PGlite();
  try {
    await prepareDatabase(db);
    const oneIp = 'a'.repeat(64);
    for (let index = 0; index < 30; index++) assert.equal(await consume(db, oneIp), true);
    assert.equal(await consume(db, oneIp), false);
    assert.deepEqual((await db.query(
      'select scope,used from moaon_auth.admission_limits order by scope'
    )).rows, [{scope: 'GLOBAL', used: 31}, {scope: 'IP', used: 30}]);

    await db.exec('truncate moaon_auth.admission_limits');
    for (let index = 0; index < 500; index++) {
      assert.equal(await consume(db, index.toString(16).padStart(64, '0')), true);
    }
    assert.equal(await consume(db, 'f'.repeat(64)), false);
    assert.deepEqual((await db.query(
      `select used from moaon_auth.admission_limits
       where scope='GLOBAL' and key_hash=$1`, ['0'.repeat(64)]
    )).rows, [{used: 500}]);
    assert.equal((await db.query(
      `select count(*)::int as count from moaon_auth.admission_limits where scope='IP'`
    )).rows[0].count, 500);
  } finally {
    await db.close();
  }
});

test('global is shared across IPs, IP denial commits global charge, and exhausted global creates no IP row', async () => {
  const db = new PGlite();
  try {
    await prepareDatabase(db);
    await db.query(
      `insert into moaon_auth.admission_limits(scope,key_hash,used)
       values ('IP',$1,30)`, ['a'.repeat(64)]
    );
    assert.equal(await consume(db, 'a'.repeat(64)), false);
    assert.equal((await db.query(
      `select used from moaon_auth.admission_limits where scope='GLOBAL'`
    )).rows[0].used, 1);

    await db.exec('truncate moaon_auth.admission_limits');
    await db.query(
      `insert into moaon_auth.admission_limits(scope,key_hash,used)
       values ('GLOBAL',$1,500)`, ['0'.repeat(64)]
    );
    assert.equal(await consume(db, 'b'.repeat(64)), false);
    assert.equal((await db.query(
      `select count(*)::int as count from moaon_auth.admission_limits where scope='IP'`
    )).rows[0].count, 0);
  } finally {
    await db.close();
  }
});

test('SQL resets only fully elapsed buckets, resists clock regression, and rollback restores both charges', async () => {
  const db = new PGlite();
  try {
    await prepareDatabase(db);
    const expired = 'c'.repeat(64);
    await db.query(
      `insert into moaon_auth.admission_limits(scope,key_hash,started_at,used) values
       ('GLOBAL',$1,clock_timestamp()-interval '300 seconds',500),
       ('IP',$2,clock_timestamp()-interval '300 seconds',30)`,
      ['0'.repeat(64), expired]
    );
    assert.equal(await consume(db, expired), true);
    assert.deepEqual((await db.query(
      'select scope,used from moaon_auth.admission_limits order by scope'
    )).rows, [{scope: 'GLOBAL', used: 1}, {scope: 'IP', used: 1}]);

    await db.exec('truncate moaon_auth.admission_limits');
    const future = 'd'.repeat(64);
    await db.query(
      `insert into moaon_auth.admission_limits(scope,key_hash,started_at,used) values
       ('GLOBAL',$1,clock_timestamp(),0),
       ('IP',$2,clock_timestamp()+interval '1 hour',30)`,
      ['0'.repeat(64), future]
    );
    assert.equal(await consume(db, future), false);
    assert.deepEqual((await db.query(
      'select scope,used from moaon_auth.admission_limits order by scope'
    )).rows, [{scope: 'GLOBAL', used: 1}, {scope: 'IP', used: 30}]);

    await db.exec('truncate moaon_auth.admission_limits');
    await db.exec('begin');
    assert.equal(await consume(db, 'e'.repeat(64)), true);
    await db.exec('rollback');
    assert.equal((await db.query(
      'select count(*)::int as count from moaon_auth.admission_limits'
    )).rows[0].count, 0);
  } finally {
    await db.close();
  }
});

test('invalid SQL writes nothing and only service_role receives schema, table, and function privileges', async () => {
  const db = new PGlite();
  try {
    await prepareDatabase(db);
    for (const hash of [null, '', 'short', 'A'.repeat(64), 'g'.repeat(64)]) {
      await assert.rejects(() => consume(db, hash), /AUTH_REQUEST_ADMISSION_REJECTED/);
    }
    assert.equal((await db.query(
      'select count(*)::int as count from moaon_auth.admission_limits'
    )).rows[0].count, 0);
    assert.deepEqual((await db.query(
      `select relrowsecurity as enabled from pg_class
       where oid='moaon_auth.admission_limits'::regclass`
    )).rows, [{enabled: true}]);

    for (const role of ['anon', 'authenticated']) {
      for (const deniedOperation of [
        () => consume(db, 'a'.repeat(64)),
        () => db.query('select * from moaon_auth.admission_limits'),
      ]) {
        await db.exec('begin');
        try {
          await db.exec(`set local role ${role}`);
          await assert.rejects(deniedOperation, /permission denied/i);
        } finally {
          await db.exec('rollback');
        }
      }
    }
    await db.exec('begin');
    try {
      await db.exec('set local role service_role');
      assert.equal(await consume(db, 'a'.repeat(64)), true);
    } finally {
      await db.exec('rollback');
    }
  } finally {
    await db.close();
  }
});
