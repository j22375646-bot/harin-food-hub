'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const auth = require('../lib/dashboard-auth.js');
const {
  createVercelAuthRequestAdmission,
  AuthIngressError,
} = require('../lib/tenancy/vercel-auth-request-admission.js');

const KEY = 'test-only-auth-request-hmac-key-32-bytes';
const CONFIGURATION_ERROR = 'Exact Vercel auth request admission configuration is required.';
const IPV4_HASH = '4fccb436109b317f9376d34e88fcf7623eeec03dbfa122a7742f3b7cb4ff22c9';
const IPV6_HASH = '70f731d94746fdd1f62c2e5b1b154dc1ec8e878d3c0d9997ad1e2302dfaa3181';
const OWNER_HASH = '944b2297f75d75450720b717864a98e31c18ff4d035d3af821bdbd221dc7980f';

function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return {promise, resolve};
}

async function withProductionRuntime(run) {
  const vercel = process.env.VERCEL;
  const environment = process.env.VERCEL_ENV;
  process.env.VERCEL = '1';
  process.env.VERCEL_ENV = 'production';
  try {
    return await run();
  } finally {
    if (vercel === undefined) delete process.env.VERCEL;
    else process.env.VERCEL = vercel;
    if (environment === undefined) delete process.env.VERCEL_ENV;
    else process.env.VERCEL_ENV = environment;
  }
}

function trustedHeaders(ip = '192.0.2.128') {
  return new Headers({
    'x-vercel-forwarded-for': ip,
    'x-forwarded-for': ip,
  });
}

function nativeRequest({url = 'https://hub.example.test/login', headers = trustedHeaders(), signal,
  method = 'GET', body} = {}) {
  const init = {headers, method};
  if (signal) init.signal = signal;
  if (body !== undefined) {
    init.body = body;
    init.duplex = 'half';
  }
  return new Request(url, init);
}

function createAdmission(rpcClient, overrides = {}) {
  return createVercelAuthRequestAdmission({
    rpcClient,
    hmacKey: KEY,
    ingress: 'vercel-direct',
    timeoutMs: 1000,
    ...overrides,
  });
}

async function captureRejection(run) {
  try {
    await run();
  } catch (error) {
    return error;
  }
  assert.fail('Expected the operation to reject.');
}

function assertIngressError(error, secrets = []) {
  assert.equal(error instanceof AuthIngressError, true);
  assert.equal(error.name, 'AuthIngressError');
  assert.equal(error.code, 'AUTH_INGRESS_UNAVAILABLE');
  assert.equal(error.status, 503);
  assert.equal(error.message, 'Authentication ingress is unavailable.');
  assert.equal(Object.hasOwn(error, 'cause'), false);
  const serialized = JSON.stringify(error);
  for (const secret of secrets) assert.equal(serialized.includes(secret), false, secret);
}

test('native Vercel headers drive the actual IP then subject admission with canonical hashes', () =>
  withProductionRuntime(async () => {
    const calls = [];
    const admit = createAdmission({async rpc(name, args) {
      calls.push({name, args});
      return {data: true, error: null};
    }});

    const ipv4 = await admit(nativeRequest(), {kind: 'LOGIN', subject: 'owner'});
    const ipv6 = await admit(nativeRequest({
      headers: new Headers({
        'x-vercel-forwarded-for': '2001:0db8:0:0:0:0:0:1',
        'x-forwarded-for': '2001:db8::1',
        'x-real-ip': '2001:DB8::1',
      }),
    }), {kind: 'LOGIN', subject: 'owner'});
    const mapped = await admit(nativeRequest({
      headers: new Headers({
        'x-vercel-forwarded-for': '192.0.2.128',
        'x-forwarded-for': '::ffff:192.0.2.128',
        'x-real-ip': '::FFFF:C000:0280',
      }),
    }), {kind: 'LOGIN', subject: 'owner'});

    for (const result of [ipv4, ipv6, mapped]) {
      assert.deepEqual(result, {allowed: true});
      assert.equal(Object.isFrozen(result), true);
    }
    assert.deepEqual(calls, [
      {name: 'moaon_consume_auth_admission', args: {p_ip_hash: IPV4_HASH}},
      {name: 'moaon_consume_auth_request', args: {p_kind: 'LOGIN', p_subject_hash: OWNER_HASH}},
      {name: 'moaon_consume_auth_admission', args: {p_ip_hash: IPV6_HASH}},
      {name: 'moaon_consume_auth_request', args: {p_kind: 'LOGIN', p_subject_hash: OWNER_HASH}},
      {name: 'moaon_consume_auth_admission', args: {p_ip_hash: IPV4_HASH}},
      {name: 'moaon_consume_auth_request', args: {p_kind: 'LOGIN', p_subject_hash: OWNER_HASH}},
    ]);
    const observed = JSON.stringify({calls, ipv4, ipv6, mapped});
    for (const raw of [KEY, '192.0.2.128', '2001:db8::1', 'owner']) {
      assert.equal(observed.includes(raw), false, raw);
    }
  }));

test('construction accepts only exact data configuration without executing accessors or RPC', () =>
  withProductionRuntime(async () => {
    let rpcCalls = 0;
    let getterCalls = 0;
    const rpcClient = {rpc: async () => { rpcCalls += 1; return {data: true, error: null}; }};
    const accessor = {rpcClient, hmacKey: KEY, ingress: 'vercel-direct'};
    Object.defineProperty(accessor, 'timeoutMs', {
      enumerable: true,
      get() { getterCalls += 1; throw new Error(`private ${KEY}`); },
    });
    const rpcAccessor = {};
    Object.defineProperty(rpcAccessor, 'rpc', {
      get() { getterCalls += 1; throw new Error(`private ${KEY}`); },
    });
    const prototypeAccessor = Object.create(Object.defineProperty({}, 'rpc', {
      get() { getterCalls += 1; throw new Error(`private ${KEY}`); },
    }));
    const symbolConfig = {rpcClient, hmacKey: KEY, ingress: 'vercel-direct'};
    symbolConfig[Symbol('hidden')] = true;
    const invalid = [
      undefined, null, [], {},
      {rpcClient, hmacKey: KEY},
      {rpcClient, hmacKey: KEY, ingress: 'other'},
      {rpcClient, hmacKey: 'short', ingress: 'vercel-direct'},
      {rpcClient: {}, hmacKey: KEY, ingress: 'vercel-direct'},
      {rpcClient: rpcAccessor, hmacKey: KEY, ingress: 'vercel-direct'},
      {rpcClient: prototypeAccessor, hmacKey: KEY, ingress: 'vercel-direct'},
      {rpcClient, hmacKey: KEY, ingress: 'vercel-direct', timeoutMs: 0},
      {rpcClient, hmacKey: KEY, ingress: 'vercel-direct', timeoutMs: 30001},
      {rpcClient, hmacKey: KEY, ingress: 'vercel-direct', timeoutMs: 1.5},
      {rpcClient, hmacKey: KEY, ingress: 'vercel-direct', extra: true},
      accessor, symbolConfig,
    ];
    for (const value of invalid) {
      assert.throws(
        () => createVercelAuthRequestAdmission(value),
        error => error instanceof TypeError
          && error.message === CONFIGURATION_ERROR
          && !error.cause
          && !error.message.includes(KEY)
      );
    }
    assert.equal(getterCalls, 0);
    assert.equal(rpcCalls, 0);
  }));

test('factory captures a prototype RPC data method with its receiver and snapshots call inputs', () =>
  withProductionRuntime(async () => {
    const first = deferred();
    const started = deferred();
    const calls = [];
    class Client {
      constructor() { this.marker = 'original-receiver'; }
      async rpc(name, args) {
        assert.equal(this.marker, 'original-receiver');
        calls.push({name, args});
        if (calls.length === 1) {
          started.resolve();
          return first.promise;
        }
        return {data: true, error: null};
      }
    }
    const rpcClient = new Client();
    const config = {rpcClient, hmacKey: KEY, ingress: 'vercel-direct', timeoutMs: 1000};
    const admit = createVercelAuthRequestAdmission(config);
    const headers = trustedHeaders();
    const request = nativeRequest({headers});
    const input = {kind: 'LOGIN', subject: 'owner'};
    const pending = admit(request, input);

    input.kind = 'UNKNOWN';
    input.subject = 'attacker';
    headers.set('x-vercel-forwarded-for', '203.0.113.9');
    headers.set('x-forwarded-for', '203.0.113.9');
    config.hmacKey = 'replacement-auth-request-hmac-key-32-bytes';
    config.timeoutMs = 1;
    rpcClient.rpc = async () => { throw new Error('replacement RPC must not run'); };
    await started.promise;
    first.resolve({data: true, error: null});

    assert.deepEqual(await pending, {allowed: true});
    assert.deepEqual(calls, [
      {name: 'moaon_consume_auth_admission', args: {p_ip_hash: IPV4_HASH}},
      {name: 'moaon_consume_auth_request', args: {p_kind: 'LOGIN', p_subject_hash: OWNER_HASH}},
    ]);
  }));

test('capturing an RPC data method does not inspect accessor properties on the function object', () =>
  withProductionRuntime(async () => {
    let accessorCalls = 0;
    const calls = [];
    const rpc = async function rpc(name, args) {
      assert.equal(this.marker, 'safe-receiver');
      calls.push({name, args});
      return {data: false, error: null};
    };
    Object.defineProperty(rpc, 'bind', {
      get() { accessorCalls += 1; throw new Error(`private ${KEY}`); },
    });
    const admit = createAdmission({marker: 'safe-receiver', rpc});
    assert.deepEqual(await admit(nativeRequest(), {kind: 'LOGIN', subject: 'owner'}), {allowed: false});
    assert.equal(accessorCalls, 0);
    assert.deepEqual(calls, [
      {name: 'moaon_consume_auth_admission', args: {p_ip_hash: IPV4_HASH}},
    ]);
  }));

test('call rejects non-native, non-HTTPS, aborted, malformed input and untrusted runtime before RPC', () =>
  withProductionRuntime(async () => {
    let calls = 0;
    const admit = createAdmission({rpc: async () => { calls += 1; return {data: true, error: null}; }});
    const controller = new AbortController();
    controller.abort();
    const invalid = [
      [{url: 'https://hub.example.test/login'}, {kind: 'LOGIN', subject: 'owner'}],
      [nativeRequest({url: 'http://hub.example.test/login'}), {kind: 'LOGIN', subject: 'owner'}],
      [nativeRequest({signal: controller.signal}), {kind: 'LOGIN', subject: 'owner'}],
      [nativeRequest(), undefined],
      [nativeRequest(), {kind: 'UNKNOWN', subject: 'owner'}],
      [nativeRequest(), {kind: 'LOGIN', subject: ''}],
    ];
    const errors = [];
    for (const [request, input] of invalid) {
      const error = await captureRejection(() => admit(request, input));
      assertIngressError(error, [KEY, 'owner', '192.0.2.128']);
      errors.push(error);
    }
    assert.equal(new Set(errors).size, errors.length);
    delete process.env.VERCEL;
    const spoofed = nativeRequest({headers: new Headers({
      'x-vercel-forwarded-for': '192.0.2.128',
      'x-forwarded-for': '192.0.2.128',
      'x-vercel-id': 'trusted-looking-marker',
      forwarded: 'for=192.0.2.128',
      'cf-connecting-ip': '192.0.2.128',
      'true-client-ip': '192.0.2.128',
      'x-client-ip': '192.0.2.128',
      host: 'hub.example.test',
    })});
    assertIngressError(await captureRejection(() => admit(spoofed, {kind: 'LOGIN', subject: 'owner'})));
    assert.equal(calls, 0);
  }));

test('selected IP headers must be one bounded matching literal and ignored headers never substitute', () =>
  withProductionRuntime(async () => {
    let calls = 0;
    const admit = createAdmission({rpc: async () => { calls += 1; return {data: true, error: null}; }});
    const malformed = [
      new Headers({'x-forwarded-for': '192.0.2.128'}),
      new Headers({'x-vercel-forwarded-for': '192.0.2.128'}),
      new Headers({'x-vercel-forwarded-for': '', 'x-forwarded-for': ''}),
      new Headers({'x-vercel-forwarded-for': '192.0.2.128,198.51.100.2', 'x-forwarded-for': '192.0.2.128'}),
      new Headers({'x-vercel-forwarded-for': '192.0.2.128:443', 'x-forwarded-for': '192.0.2.128:443'}),
      new Headers({'x-vercel-forwarded-for': '[2001:db8::1]', 'x-forwarded-for': '[2001:db8::1]'}),
      new Headers({'x-vercel-forwarded-for': 'fe80::1%eth0', 'x-forwarded-for': 'fe80::1%eth0'}),
      new Headers({'x-vercel-forwarded-for': 'client.example.test', 'x-forwarded-for': 'client.example.test'}),
      new Headers({'x-vercel-forwarded-for': '999.0.0.1', 'x-forwarded-for': '999.0.0.1'}),
      new Headers({'x-vercel-forwarded-for': '1'.repeat(65), 'x-forwarded-for': '1'.repeat(65)}),
      new Headers({'x-vercel-forwarded-for': '192.0.2.128', 'x-forwarded-for': '198.51.100.2'}),
      new Headers({'x-vercel-forwarded-for': '192.0.2.128', 'x-forwarded-for': '192.0.2.128', 'x-real-ip': '198.51.100.2'}),
      new Headers({'x-vercel-forwarded-for': '192.0.2.128', 'x-forwarded-for': '192.0.2.128', 'x-real-ip': 'client.example.test'}),
      new Headers({forwarded: 'for=192.0.2.128', 'cf-connecting-ip': '192.0.2.128'}),
    ];
    const duplicate = trustedHeaders();
    duplicate.append('x-vercel-forwarded-for', '198.51.100.2');
    malformed.push(duplicate);
    for (const headers of malformed) {
      assertIngressError(await captureRejection(
        () => admit(nativeRequest({headers}), {kind: 'LOGIN', subject: 'private-owner'}),
      ), [KEY, 'private-owner']);
    }
    assert.equal(calls, 0);
  }));

test('method and body remain caller concerns and admission does not consume the body', () =>
  withProductionRuntime(async () => {
    const calls = [];
    const admit = createAdmission({rpc: async (name, args) => {
      calls.push({name, args});
      return {data: true, error: null};
    }});
    const request = nativeRequest({method: 'POST', body: 'credential-body'});
    assert.equal(request.bodyUsed, false);
    assert.deepEqual(await admit(request, {kind: 'LOGIN', subject: 'owner'}), {allowed: true});
    assert.equal(request.bodyUsed, false);
    assert.equal(calls.length, 2);
  }));

test('IP and subject denials preserve order, frozen results and exact charge semantics', () =>
  withProductionRuntime(async () => {
    const ipCalls = [];
    const ipDenied = createAdmission({rpc: async (name, args) => {
      ipCalls.push({name, args});
      return {data: false, error: null};
    }});
    const ipResult = await ipDenied(nativeRequest(), {kind: 'LOGIN', subject: 'owner'});
    assert.deepEqual(ipResult, {allowed: false});
    assert.equal(Object.isFrozen(ipResult), true);
    assert.deepEqual(ipCalls.map(call => call.name), ['moaon_consume_auth_admission']);

    const subjectCalls = [];
    const subjectDenied = createAdmission({rpc: async (name, args) => {
      subjectCalls.push({name, args});
      return {data: name === 'moaon_consume_auth_admission', error: null};
    }});
    const subjectResult = await subjectDenied(nativeRequest(), {kind: 'LOGIN', subject: 'owner'});
    assert.deepEqual(subjectResult, {allowed: false});
    assert.equal(Object.isFrozen(subjectResult), true);
    assert.deepEqual(subjectCalls.map(call => call.name), [
      'moaon_consume_auth_admission', 'moaon_consume_auth_request',
    ]);
  }));

test('initial and mid-flight aborts fail closed without starting a later RPC', () =>
  withProductionRuntime(async () => {
    const first = deferred();
    const firstStarted = deferred();
    const calls = [];
    const controller = new AbortController();
    const admit = createAdmission({rpc: async (name, args) => {
      calls.push({name, args});
      firstStarted.resolve();
      return first.promise;
    }});
    const pending = admit(nativeRequest({signal: controller.signal}), {kind: 'LOGIN', subject: 'owner'});
    await firstStarted.promise;
    controller.abort();
    first.resolve({data: true, error: null});
    assertIngressError(await captureRejection(() => pending));
    assert.deepEqual(calls.map(call => call.name), ['moaon_consume_auth_admission']);

    const subject = deferred();
    const subjectStarted = deferred();
    const secondController = new AbortController();
    const subjectCalls = [];
    const subjectAdmit = createAdmission({rpc: async (name, args) => {
      subjectCalls.push({name, args});
      if (name === 'moaon_consume_auth_admission') return {data: true, error: null};
      subjectStarted.resolve();
      return subject.promise;
    }});
    const subjectPending = subjectAdmit(
      nativeRequest({signal: secondController.signal}),
      {kind: 'LOGIN', subject: 'owner'},
    );
    await subjectStarted.promise;
    secondController.abort();
    subject.resolve({data: true, error: null});
    assertIngressError(await captureRejection(() => subjectPending));
    assert.deepEqual(subjectCalls.map(call => call.name), [
      'moaon_consume_auth_admission', 'moaon_consume_auth_request',
    ]);
  }));

test('runtime loss after an RPC result prevents a later quota dispatch', () =>
  withProductionRuntime(async () => {
    const first = deferred();
    const started = deferred();
    const calls = [];
    const admit = createAdmission({rpc: async (name, args) => {
      calls.push({name, args});
      started.resolve();
      return first.promise;
    }});
    const pending = admit(nativeRequest(), {kind: 'LOGIN', subject: 'owner'});
    await started.promise;
    process.env.VERCEL_ENV = 'preview';
    first.resolve({data: true, error: null});
    assertIngressError(await captureRejection(() => pending));
    assert.deepEqual(calls.map(call => call.name), ['moaon_consume_auth_admission']);
  }));

test('malformed, throwing and timed-out RPCs are sanitized and never retried', () =>
  withProductionRuntime(async () => {
    const failures = [
      async () => ({data: 1, error: null}),
      async () => ({data: true}),
      async () => ({data: true, error: {message: `private ${KEY}`}}),
      async () => { throw new Error(`private 192.0.2.128 owner ${KEY}`); },
    ];
    for (const rpc of failures) {
      let calls = 0;
      const admit = createAdmission({rpc: (...args) => { calls += 1; return rpc(...args); }});
      const error = await captureRejection(
        () => admit(nativeRequest(), {kind: 'LOGIN', subject: 'owner'}),
      );
      assertIngressError(error, [KEY, '192.0.2.128', 'owner', 'private']);
      assert.equal(calls, 1);
    }

    const never = deferred();
    let timeoutCalls = 0;
    const timed = createAdmission({rpc: () => { timeoutCalls += 1; return never.promise; }}, {timeoutMs: 10});
    assertIngressError(await captureRejection(
      () => timed(nativeRequest(), {kind: 'LOGIN', subject: 'owner'}),
    ));
    assert.equal(timeoutCalls, 1);
    never.resolve({data: true, error: null});
  }));

test('actual login seam stops ingress failure and denial before profile, provider or session writes', () =>
  withProductionRuntime(async () => {
    const request = nativeRequest();
    const downstream = [];
    const db = {from(table) { downstream.push(`db:${table}`); throw new Error('must not run'); }};
    const authClient = {auth: {async signInWithPassword() {
      downstream.push('provider');
      return {data: null, error: null};
    }}};

    const deniedAdmission = createAdmission({rpc: async () => ({data: false, error: null})});
    await assert.rejects(
      () => auth.authenticateAccount(
        {account: 'owner-a', password: '123456'},
        db,
        {requestLimit: input => deniedAdmission(request, input), authClient},
      ),
      error => error.code === 'LOGIN_RATE_LIMITED' && error.status === 429,
    );
    assert.deepEqual(downstream, []);

    let unavailableRpc = 0;
    const unavailableAdmission = createAdmission({rpc: async () => {
      unavailableRpc += 1;
      return {data: true, error: null};
    }});
    process.env.VERCEL_ENV = 'preview';
    await assert.rejects(
      () => auth.authenticateAccount(
        {account: 'owner-a', password: '123456'},
        db,
        {requestLimit: input => unavailableAdmission(request, input), authClient},
      ),
      error => error.code === 'LOGIN_AUTH_UNAVAILABLE' && error.status === 503,
    );
    assert.equal(unavailableRpc, 0);
    assert.deepEqual(downstream, []);
  }));

test('factory and returned closure enforce production server runtime at both boundaries', () =>
  withProductionRuntime(async () => {
    const config = {
      rpcClient: {rpc: async () => ({data: true, error: null})},
      hmacKey: KEY,
      ingress: 'vercel-direct',
    };
    const oldWindow = Object.getOwnPropertyDescriptor(global, 'window');
    Object.defineProperty(global, 'window', {value: {}, configurable: true, writable: true});
    try {
      assert.throws(
        () => createVercelAuthRequestAdmission(config),
        error => error instanceof TypeError && error.message === CONFIGURATION_ERROR,
      );
    } finally {
      if (oldWindow) Object.defineProperty(global, 'window', oldWindow);
      else delete global.window;
    }

    process.env.VERCEL_ENV = 'preview';
    assert.throws(
      () => createVercelAuthRequestAdmission(config),
      error => error instanceof TypeError && error.message === CONFIGURATION_ERROR,
    );
    process.env.VERCEL_ENV = 'production';

    const admit = createVercelAuthRequestAdmission(config);
    const oldDocument = Object.getOwnPropertyDescriptor(global, 'document');
    Object.defineProperty(global, 'document', {value: {}, configurable: true, writable: true});
    try {
      assertIngressError(await captureRejection(
        () => admit(nativeRequest(), {kind: 'LOGIN', subject: 'owner'}),
      ));
    } finally {
      if (oldDocument) Object.defineProperty(global, 'document', oldDocument);
      else delete global.document;
    }
  }));
