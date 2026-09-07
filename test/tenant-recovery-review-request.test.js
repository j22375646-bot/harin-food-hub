'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  createRecoveryReviewRequestHandler,
} = require('../lib/tenancy/recovery-review-request.js');
const {
  DashboardIdentityError,
} = require('../lib/tenancy/dashboard-identity.js');

const ORIGIN = 'https://hub.example.test';
const NOW = Date.parse('2026-09-08T12:00:00.000Z');
const SESSION = '30000000-0000-4000-8000-000000000001';
const OPERATOR = '20000000-0000-4000-8000-000000000002';
const USER = '20000000-0000-4000-8000-000000000001';
const OPERATION = '50000000-0000-4000-8000-000000000001';
const RESOLUTION = '60000000-0000-4000-8000-000000000001';
const VERSION = 'a'.repeat(64);
const COOKIE = 'opaque-dashboard-session';

function identity(overrides = {}) {
  return {
    id: SESSION,
    userId: OPERATOR,
    email: 'operator@example.test',
    emailVerified: true,
    expiresAt: '2026-09-08T13:00:00.000Z',
    ...overrides,
  };
}

function inspection(overrides = {}) {
  return {
    userId: USER,
    operationId: OPERATION,
    status: 'PENDING',
    stage: null,
    version: VERSION,
    decision: 'CLOSE_NOT_STARTED',
    ...overrides,
  };
}

function validBody(overrides = {}) {
  return {mode: 'inspect', userId: USER, operationId: OPERATION, ...overrides};
}

function request(body = validBody(), overrides = {}) {
  const headers = {
    'content-type': 'application/json',
    cookie: `harin_dashboard_session=${COOKIE}`,
    origin: ORIGIN,
    ...overrides.headers,
  };
  return new Request(overrides.url || `${ORIGIN}/internal/recovery-review`, {
    method: overrides.method || 'POST',
    headers,
    body: overrides.body === undefined ? JSON.stringify(body) : overrides.body,
    signal: overrides.signal,
    duplex: overrides.duplex,
  });
}

function dependencies(overrides = {}) {
  return {
    allowedOrigin: ORIGIN,
    verifySession: async () => identity(),
    rpcClient: {async rpc(name) {
      return {data: name === 'moaon_inspect_recovery_review' ? inspection() : {
        userId: USER,
        operationId: OPERATION,
        resolutionId: RESOLUTION,
        status: 'REJECTED',
      }, error: null};
    }},
    now: () => NOW,
    ...overrides,
  };
}

async function expectError(response, status, code) {
  assert.equal(response.status, status);
  assert.deepEqual(await response.json(), {ok: false, code});
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(response.headers.get('vary'), 'Cookie');
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  assert.match(response.headers.get('content-type'), /^application\/json\b/);
  assert.equal(response.headers.has('access-control-allow-origin'), false);
  assert.equal(response.headers.has('set-cookie'), false);
  assert.equal(response.headers.has('location'), false);
}

test('missing dashboard cookie returns AUTH_REQUIRED without dispatching recovery SQL', async () => {
  let rpcCalls = 0;
  const handler = createRecoveryReviewRequestHandler({
    allowedOrigin: ORIGIN,
    verifySession: async () => { throw new Error('must not verify'); },
    rpcClient: {async rpc() { rpcCalls += 1; throw new Error('must not dispatch'); }},
  });

  const response = await handler(new Request(`${ORIGIN}/internal/recovery-review`, {
    method: 'POST',
    headers: {'content-type': 'application/json', origin: ORIGIN},
    body: JSON.stringify({
      mode: 'inspect',
      userId: '20000000-0000-4000-8000-000000000001',
      operationId: '50000000-0000-4000-8000-000000000001',
    }),
  }));

  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), {ok: false, code: 'AUTH_REQUIRED'});
  assert.equal(rpcCalls, 0);
});

test('factory requires exact trusted server dependencies and a canonical HTTPS origin', () => {
  const valid = dependencies();
  const symbol = Symbol('hidden');
  for (const options of [
    undefined,
    {},
    {...valid, verifySession: null},
    {...valid, rpcClient: {}},
    {...valid, allowedOrigin: 'http://hub.example.test'},
    {...valid, allowedOrigin: 'https://hub.example.test/'},
    {...valid, allowedOrigin: 'https://user@hub.example.test'},
    {...valid, allowedOrigin: 'https://hub.example.test/path'},
    {...valid, timeoutMs: 0},
    {...valid, timeoutMs: 30001},
    {...valid, timeoutMs: 1.5},
    {...valid, now: null},
    {...valid, extra: true},
    Object.assign({...valid}, {[symbol]: true}),
  ]) assert.throws(() => createRecoveryReviewRequestHandler(options), TypeError);
  assert.equal(typeof createRecoveryReviewRequestHandler(valid), 'function');
});

test('method and same-origin source guards run before authentication and never emit CORS or redirects', async () => {
  let verified = 0;
  const handler = createRecoveryReviewRequestHandler(dependencies({verifySession: async () => {verified += 1; return identity();}}));
  const cases = [
    [new Request(`${ORIGIN}/internal/recovery-review`, {method: 'GET', headers: {origin: ORIGIN}}), 405, 'METHOD_NOT_ALLOWED'],
    [request(undefined, {url: 'https://evil.example.test/internal/recovery-review'}), 403, 'SOURCE_REJECTED'],
    [request(undefined, {url: `${ORIGIN}/internal/recovery-review?operator=owner`}), 403, 'SOURCE_REJECTED'],
    [request(undefined, {url: `${ORIGIN}/internal/recovery-review?`}), 403, 'SOURCE_REJECTED'],
    [request(undefined, {url: `${ORIGIN}/internal/recovery-review#`}), 403, 'SOURCE_REJECTED'],
    [request(undefined, {headers: {origin: 'https://evil.example.test'}}), 403, 'SOURCE_REJECTED'],
    [request(undefined, {headers: {origin: ''}}), 403, 'SOURCE_REJECTED'],
    [request(undefined, {headers: {'sec-fetch-site': 'cross-site'}}), 403, 'SOURCE_REJECTED'],
  ];
  for (const [input, status, code] of cases) await expectError(await handler(input), status, code);
  const method = await handler(request(undefined, {method: 'PUT', body: undefined}));
  assert.equal(method.headers.get('allow'), 'POST');
  assert.equal(verified, 0);
});

test('proxy identity headers are ignored and cannot replace the single opaque cookie', async () => {
  let verifiedCredential;
  const handler = createRecoveryReviewRequestHandler(dependencies({
    verifySession: async value => {verifiedCredential = value; return identity();},
  }));
  const forged = {
    cookie: '',
    'x-harin-user-id': OPERATOR,
    'x-harin-session-verified': '1',
    'x-harin-role': 'OWNER',
    forwarded: `host=${ORIGIN}`,
    host: 'proxy.example.test',
  };
  await expectError(await handler(request(undefined, {headers: forged})), 401, 'AUTH_REQUIRED');
  const accepted = await handler(request(undefined, {headers: {
    'x-harin-user-id': USER,
    'x-harin-session-verified': '1',
    'x-harin-role': 'OWNER',
    forwarded: 'for=203.0.113.8;host=evil.example.test',
    host: 'evil.example.test',
  }}));
  assert.equal(accepted.status, 200);
  assert.equal(verifiedCredential, COOKIE);
  assert.equal(accepted.headers.get('cache-control'), 'no-store');
  assert.equal(accepted.headers.get('vary'), 'Cookie');
  assert.equal(accepted.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(accepted.headers.has('access-control-allow-origin'), false);
  assert.equal(accepted.headers.has('set-cookie'), false);
});

test('media, encoding and declared/body byte limits reject before identity or SQL', async () => {
  let verified = 0;
  let calls = 0;
  const handler = createRecoveryReviewRequestHandler(dependencies({
    verifySession: async () => {verified += 1; return identity();},
    rpcClient: {async rpc() {calls += 1; return {data: inspection(), error: null};}},
  }));
  for (const contentType of ['text/plain', 'application/json; charset=latin1', 'application/json; charset=utf-8; profile=x', 'application/json, text/plain']) {
    await expectError(await handler(request(undefined, {headers: {'content-type': contentType}})), 415, 'UNSUPPORTED_MEDIA_TYPE');
  }
  assert.equal((await handler(request(undefined, {headers: {'content-type': ' Application/JSON ; Charset = UTF-8 '}}))).status, 200);
  await expectError(await handler(request(undefined, {headers: {'content-encoding': 'gzip'}})), 415, 'UNSUPPORTED_MEDIA_TYPE');
  for (const length of ['-1', '+2', '4.2', '1e2', '999999999999999999999999']) {
    await expectError(await handler(request(undefined, {headers: {'content-length': length}})), 400, 'INVALID_REQUEST');
  }
  await expectError(await handler(request(undefined, {headers: {'content-length': '4097'}})), 413, 'REQUEST_TOO_LARGE');
  await expectError(await handler(request(undefined, {body: JSON.stringify({pad: 'x'.repeat(5000)})})), 413, 'REQUEST_TOO_LARGE');
  assert.equal(calls, 1);
  assert.equal(verified, 1);
});

test('cookie parsing rejects duplication, mixing and ambiguous values while passing the raw cookie octets', async () => {
  let credential;
  const handler = createRecoveryReviewRequestHandler(dependencies({verifySession: async value => {credential = value; return identity();}}));
  const invalidHeaders = [
    {authorization: 'Bearer mixed'},
    {cookie: 'other=1'},
    {cookie: 'harin_dashboard_session='},
    {cookie: 'harin_dashboard_session=one; harin_dashboard_session=two'},
    {cookie: 'harin_dashboard_session="quoted"'},
    {cookie: 'harin_dashboard_session=a,b'},
    {cookie: 'harin_dashboard_session=has space'},
    {cookie: `harin_dashboard_session=${'a'.repeat(4097)}`},
    {cookie: `other=${'a'.repeat(16385)}; harin_dashboard_session=ok`},
  ];
  for (const headers of invalidHeaders) await expectError(await handler(request(undefined, {headers})), 401, 'AUTH_REQUIRED');
  const raw = 'opaque%2Ecookie_value-~';
  const response = await handler(request(undefined, {headers: {cookie: `other=1; harin_dashboard_session=${raw}`}}));
  assert.equal(response.status, 200);
  assert.equal(credential, raw);
});

test('fatal UTF-8, JSON shape, identifiers and unknown fields are rejected before identity and SQL', async () => {
  let verified = 0;
  const handler = createRecoveryReviewRequestHandler(dependencies({verifySession: async () => {verified += 1; return identity();}}));
  const invalidBodies = [
    '',
    '{',
    '[]',
    'null',
    '{}',
    JSON.stringify({mode: 'inspect', userId: USER, operationId: OPERATION, operatorId: OPERATOR}),
    JSON.stringify({mode: 'inspect', userId: 'bad', operationId: OPERATION}),
    JSON.stringify({mode: 'inspect', userId: USER, operationId: `${OPERATION} `}),
    JSON.stringify({mode: 'resolve', userId: USER, operationId: OPERATION}),
    JSON.stringify({mode: 'resolve', userId: USER, operationId: OPERATION, resolutionId: RESOLUTION, expectedVersion: 'A'.repeat(64), action: 'CLOSE_NOT_STARTED'}),
    JSON.stringify({mode: 'resolve', userId: USER, operationId: OPERATION, resolutionId: RESOLUTION, expectedVersion: VERSION, action: 'RETRY'}),
  ];
  for (const body of invalidBodies) await expectError(await handler(request(undefined, {body})), 400, 'INVALID_REQUEST');
  await expectError(await handler(request(undefined, {body: new Uint8Array([0xc3, 0x28])})), 400, 'INVALID_REQUEST');
  assert.equal(verified, 0);
});

test('the last duplicate JSON key is validated and copied values alone reach fresh identity and resolver', async () => {
  const reads = new Map();
  const source = {};
  for (const [key, value] of Object.entries(identity())) Object.defineProperty(source, key, {
    enumerable: true,
    get() { reads.set(key, (reads.get(key) || 0) + 1); return value; },
  });
  const calls = [];
  const handler = createRecoveryReviewRequestHandler(dependencies({
    verifySession: async value => {assert.equal(value, COOKIE); return source;},
    rpcClient: {async rpc(name, args) {calls.push({name, args}); return {data: inspection(), error: null};}},
  }));
  const duplicate = `{"mode":"resolve","mode":"inspect","userId":"${USER.toUpperCase()}","operationId":"${OPERATION.toUpperCase()}"}`;
  const response = await handler(request(undefined, {body: duplicate}));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {ok: true, data: inspection()});
  assert.deepEqual(Object.fromEntries(reads), Object.fromEntries(Object.keys(identity()).map(key => [key, 1])));
  assert.deepEqual(calls, [{name: 'moaon_inspect_recovery_review', args: {
    p_operator_id: OPERATOR,
    p_user_id: USER,
    p_operation_id: OPERATION,
  }}]);
});

test('resolve uses only the freshly verified userId and preserves the existing resolver result', async () => {
  const calls = [];
  const handler = createRecoveryReviewRequestHandler(dependencies({
    rpcClient: {async rpc(name, args) {
      calls.push({name, args});
      return {data: {userId: USER, operationId: OPERATION, resolutionId: RESOLUTION, status: 'REJECTED'}, error: null};
    }},
  }));
  const body = {mode: 'resolve', userId: USER, operationId: OPERATION, resolutionId: RESOLUTION,
    expectedVersion: VERSION, action: 'CLOSE_NOT_STARTED'};
  const response = await handler(request(body));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {ok: true, data: {
    userId: USER, operationId: OPERATION, resolutionId: RESOLUTION, status: 'REJECTED',
  }});
  assert.equal(calls.length, 1);
  assert.equal(calls[0].args.p_operator_id, OPERATOR);
});

test('identity authentication failures map narrowly to 401; malformed and general failures map to sanitized 503', async () => {
  const cases = [
    [async () => null, 401, 'AUTH_REQUIRED'],
    [async () => false, 401, 'AUTH_REQUIRED'],
    [async () => {throw new DashboardIdentityError('AUTH_REQUIRED', 401, 'private token');}, 401, 'AUTH_REQUIRED'],
    [async () => {throw Object.assign(new Error('private provider SQL'), {code: 'AUTH_REQUIRED', status: 401});}, 503, 'RECOVERY_REVIEW_UNAVAILABLE'],
    [async () => identity({expiresAt: '2026-09-08T12:00:00.000Z'}), 401, 'AUTH_REQUIRED'],
    [async () => identity({expiresAt: '2026-09-08T13:00:00Z'}), 503, 'RECOVERY_REVIEW_UNAVAILABLE'],
    [async () => identity({emailVerified: false}), 401, 'AUTH_REQUIRED'],
    [async () => ({...identity(), extra: true}), 503, 'RECOVERY_REVIEW_UNAVAILABLE'],
  ];
  for (const [verifySession, status, code] of cases) {
    const handler = createRecoveryReviewRequestHandler(dependencies({verifySession}));
    await expectError(await handler(request()), status, code);
  }
});

function deferred() {
  let resolve;
  const promise = new Promise(done => {resolve = done;});
  return {promise, resolve};
}

test('one deadline bounds pending identity and late verification cannot start SQL', async () => {
  const pending = deferred();
  let calls = 0;
  const handler = createRecoveryReviewRequestHandler(dependencies({
    verifySession: () => pending.promise,
    rpcClient: {async rpc() {calls += 1; return {data: inspection(), error: null};}},
    timeoutMs: 15,
    now: Date.now,
  }));
  await expectError(await handler(request()), 503, 'RECOVERY_REVIEW_UNAVAILABLE');
  pending.resolve(identity({expiresAt: new Date(Date.now() + 60_000).toISOString()}));
  await new Promise(resolve => setTimeout(resolve, 10));
  assert.equal(calls, 0);
});

test('abort before dispatch and during verification prevents SQL; RPC timeout dispatches once without retry', async () => {
  let calls = 0;
  const controller = new AbortController();
  controller.abort();
  const handler = createRecoveryReviewRequestHandler(dependencies({
    rpcClient: {async rpc() {calls += 1; return {data: inspection(), error: null};}},
    now: Date.now,
  }));
  await expectError(await handler(request(undefined, {signal: controller.signal})), 503, 'RECOVERY_REVIEW_UNAVAILABLE');

  const pendingIdentity = deferred();
  const during = new AbortController();
  const waiting = createRecoveryReviewRequestHandler(dependencies({
    verifySession: () => pendingIdentity.promise,
    rpcClient: {async rpc() {calls += 1; return {data: inspection(), error: null};}},
    now: Date.now,
  }))(request(undefined, {signal: during.signal}));
  during.abort();
  await expectError(await waiting, 503, 'RECOVERY_REVIEW_UNAVAILABLE');
  pendingIdentity.resolve(identity({expiresAt: new Date(Date.now() + 60_000).toISOString()}));
  await new Promise(resolve => setTimeout(resolve, 5));
  assert.equal(calls, 0);

  const pendingRpc = deferred();
  const timed = createRecoveryReviewRequestHandler(dependencies({
    rpcClient: {rpc() {calls += 1; return pendingRpc.promise;}},
    timeoutMs: 15,
    now: Date.now,
    verifySession: async () => identity({expiresAt: new Date(Date.now() + 60_000).toISOString()}),
  }));
  await expectError(await timed(request()), 503, 'RECOVERY_REVIEW_UNAVAILABLE');
  pendingRpc.resolve({data: inspection(), error: null});
  await new Promise(resolve => setTimeout(resolve, 10));
  assert.equal(calls, 1);
});

test('pending body read times out, cancels its reader without hanging, and never verifies identity', async () => {
  let cancelled = 0;
  let verified = 0;
  const body = new ReadableStream({
    pull() { return new Promise(() => {}); },
    cancel() { cancelled += 1; return new Promise(() => {}); },
  });
  const handler = createRecoveryReviewRequestHandler(dependencies({
    verifySession: async () => {verified += 1; return identity();},
    timeoutMs: 15,
    now: Date.now,
  }));
  await expectError(await handler(request(undefined, {body, duplex: 'half'})), 503, 'RECOVERY_REVIEW_UNAVAILABLE');
  assert.equal(cancelled, 1);
  assert.equal(verified, 0);
});

test('invalid clock is sanitized before identity and SQL', async () => {
  let verified = 0;
  const handler = createRecoveryReviewRequestHandler(dependencies({
    now: () => Number.NaN,
    verifySession: async () => {verified += 1; return identity();},
  }));
  await expectError(await handler(request()), 503, 'RECOVERY_REVIEW_UNAVAILABLE');
  assert.equal(verified, 0);
});
