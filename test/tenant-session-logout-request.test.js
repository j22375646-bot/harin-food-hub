'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {createSessionLogoutRequestHandler} = require('../lib/tenancy/session-logout-request.js');

const ORIGIN = 'https://hub.example.test';
const SECOND_ORIGIN = 'https://admin.example.test:8443';
const TOKEN = 'eyJpZCI6InNlc3Npb24ifQ.signature_1';

function request({method = 'POST', url = `${ORIGIN}/internal/logout`, headers = {}, body, signal} = {}) {
  const mergedHeaders = {
    origin: ORIGIN,
    'sec-fetch-site': 'same-origin',
    cookie: `harin_dashboard_session=${TOKEN}`,
    ...headers,
  };
  for (const [key, value] of Object.entries(mergedHeaders)) {
    if (value === undefined) delete mergedHeaders[key];
  }
  const init = {method, headers: mergedHeaders};
  if (body !== undefined) {
    init.body = body;
    init.duplex = 'half';
  }
  if (signal) init.signal = signal;
  return new Request(url, init);
}

function setup(overrides = {}) {
  const calls = [];
  const logout = overrides.logout || (async token => { calls.push(token); return true; });
  const handler = createSessionLogoutRequestHandler({
    allowedOrigins: [ORIGIN, SECOND_ORIGIN],
    logout,
    timeoutMs: overrides.timeoutMs ?? 1000,
  });
  return {handler, calls};
}

async function body(response) { return response.json(); }

function assertCommon(response) {
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(response.headers.get('pragma'), 'no-cache');
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(response.headers.get('referrer-policy'), 'no-referrer');
  assert.equal(response.headers.get('content-type'), 'application/json');
  assert.equal(response.headers.has('access-control-allow-origin'), false);
}

function headerNames(response) {
  return [...response.headers.keys()].sort();
}

test('factory accepts only exact immutable explicit server configuration', () => {
  const origins = [ORIGIN];
  const logout = async () => true;
  const handler = createSessionLogoutRequestHandler({allowedOrigins: origins, logout});
  origins[0] = 'https://attacker.example';
  origins.push('https://attacker.example');
  assert.equal(typeof handler, 'function');

  const accessor = {allowedOrigins: [ORIGIN], logout};
  Object.defineProperty(accessor, 'timeoutMs', {enumerable: true, get() { throw new Error('secret'); }});
  const sparse = []; sparse[1] = ORIGIN;
  const originGetter = [];
  Object.defineProperty(originGetter, '0', {enumerable: true, get() { return ORIGIN; }});
  Object.defineProperty(originGetter, 'length', {value: 1});
  const symbolConfig = {allowedOrigins: [ORIGIN], logout};
  symbolConfig[Symbol('hidden')] = true;
  const invalid = [
    null, {}, {allowedOrigins: [ORIGIN]}, {allowedOrigins: [ORIGIN], logout, extra: true},
    accessor, symbolConfig, {allowedOrigins: sparse, logout}, {allowedOrigins: originGetter, logout},
    {allowedOrigins: [], logout}, {allowedOrigins: Array(17).fill(ORIGIN), logout},
    {allowedOrigins: [ORIGIN, ORIGIN], logout}, {allowedOrigins: ['http://hub.example.test'], logout},
    {allowedOrigins: [`${ORIGIN}/path`], logout}, {allowedOrigins: [`${ORIGIN}?x=1`], logout},
    {allowedOrigins: ['https://user@hub.example.test'], logout},
    {allowedOrigins: ['https://hub.example.test:443'], logout},
    {allowedOrigins: [ORIGIN], logout: {call() {}}},
    {allowedOrigins: [ORIGIN], logout, timeoutMs: 0},
    {allowedOrigins: [ORIGIN], logout, timeoutMs: 30001},
    {allowedOrigins: [ORIGIN], logout, timeoutMs: 1.5},
  ];
  for (const value of invalid) assert.throws(
    () => createSessionLogoutRequestHandler(value),
    error => error instanceof TypeError && !String(error.message).includes('secret'));
});

test('factory snapshots the origin allowlist rather than observing later mutation', async () => {
  const origins = [ORIGIN];
  let originalCalls = 0;
  let replacementCalls = 0;
  const config = {allowedOrigins: origins, logout: async () => { originalCalls += 1; return true; }};
  const handler = createSessionLogoutRequestHandler(config);
  origins[0] = 'https://attacker.example';
  config.logout = async () => { replacementCalls += 1; return true; };
  assert.equal((await handler(request())).status, 200);
  assert.equal((await handler(request({
    url: 'https://attacker.example/logout', headers: {origin: 'https://attacker.example'},
  }))).status, 403);
  assert.equal(originalCalls, 1);
  assert.equal(replacementCalls, 0);
});

test('handler is server-only at construction and invocation', async () => {
  const oldWindow = global.window;
  global.window = {};
  try {
    assert.throws(() => createSessionLogoutRequestHandler({allowedOrigins: [ORIGIN], logout: async () => true}), TypeError);
  } finally {
    if (oldWindow === undefined) delete global.window;
    else global.window = oldWindow;
  }
  const {handler, calls} = setup();
  global.document = {};
  try {
    const response = await handler(request());
    assert.equal(response.status, 503);
    assert.deepEqual(await body(response), {ok: false, code: 'LOGOUT_UNAVAILABLE'});
    assert.equal(calls.length, 0);
  } finally { delete global.document; }
});

test('successful logout passes the raw token once and emits only the deletion cookie', async () => {
  const {handler, calls} = setup();
  const response = await handler(request({headers: {cookie: `theme=dark; harin_dashboard_session=${TOKEN}; locale=ko`}}));
  assert.equal(response.status, 200);
  assert.deepEqual(await body(response), {ok: true});
  assert.deepEqual(calls, [TOKEN]);
  assert.equal(response.headers.get('set-cookie'),
    'harin_dashboard_session=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax');
  assertCommon(response);
  assert.deepEqual(headerNames(response), [
    'cache-control', 'content-type', 'pragma', 'referrer-policy', 'set-cookie', 'x-content-type-options',
  ]);
});

test('method and invalid native request failures are fixed and perform no I/O', async () => {
  const {handler, calls} = setup();
  const invalid = await handler({method: 'POST'});
  assert.equal(invalid.status, 400);
  assert.deepEqual(await body(invalid), {ok: false, code: 'INVALID_REQUEST'});
  const method = await handler(request({method: 'GET'}));
  assert.equal(method.status, 405);
  assert.equal(method.headers.get('allow'), 'POST');
  assert.deepEqual(await body(method), {ok: false, code: 'METHOD_NOT_ALLOWED'});
  assert.equal(calls.length, 0);
  assertCommon(invalid);
  assertCommon(method);
});

test('strict source validation ignores spoofed proxy, referer, host and IP evidence', async t => {
  const cases = [
    ['missing origin', {origin: undefined}],
    ['empty origin', {origin: ''}],
    ['null origin', {origin: 'null'}],
    ['foreign origin', {origin: 'https://attacker.example'}],
    ['cross site', {'sec-fetch-site': 'cross-site'}],
    ['same site', {'sec-fetch-site': 'same-site'}],
    ['none', {'sec-fetch-site': 'none'}],
    ['malformed origin', {origin: 'https://hub.example.test/path'}],
  ];
  for (const [name, changed] of cases) await t.test(name, async () => {
    const headers = {
      referer: `${ORIGIN}/trusted`, host: 'hub.example.test',
      'x-forwarded-host': 'hub.example.test', 'x-forwarded-proto': 'https',
      'x-forwarded-for': '127.0.0.1', 'cf-connecting-ip': '127.0.0.1',
    };
    for (const [key, value] of Object.entries(changed)) headers[key] = value;
    const {handler, calls} = setup();
    const response = await handler(request({headers}));
    assert.equal(response.status, 403);
    assert.deepEqual(await body(response), {ok: false, code: 'SOURCE_NOT_ALLOWED'});
    assert.equal(calls.length, 0);
  });
  const {handler, calls} = setup();
  const response = await handler(request({url: 'https://unknown.example/internal/logout'}));
  assert.equal(response.status, 403);
  assert.equal(calls.length, 0);
});

test('absent Sec-Fetch-Site and each configured exact request origin are accepted', async () => {
  const first = setup();
  const response = await first.handler(request({headers: {'sec-fetch-site': undefined}}));
  assert.equal(response.status, 200);
  const second = setup();
  const response2 = await second.handler(request({
    url: `${SECOND_ORIGIN}/logout`,
    headers: {origin: SECOND_ORIGIN, 'sec-fetch-site': 'same-origin'},
  }));
  assert.equal(response2.status, 200);
});

test('body and transfer metadata are rejected without reading the stream or logout I/O', async t => {
  const metadata = [
    ['content length nonzero', {'content-length': '1'}],
    ['content length nonliteral', {'content-length': '00'}],
    ['transfer encoding', {'transfer-encoding': 'chunked'}],
    ['content encoding', {'content-encoding': 'identity'}],
  ];
  for (const [name, headers] of metadata) await t.test(name, async () => {
    const {handler, calls} = setup();
    const response = await handler(request({headers}));
    assert.equal(response.status, 400);
    assert.deepEqual(await body(response), {ok: false, code: 'INVALID_REQUEST'});
    assert.equal(calls.length, 0);
  });
  let pulls = 0;
  const stream = new ReadableStream({pull() { pulls += 1; }});
  const {handler, calls} = setup();
  const streamedRequest = request({body: stream});
  await new Promise(resolve => setImmediate(resolve));
  const pullsBeforeHandler = pulls;
  const response = await handler(streamedRequest);
  assert.equal(response.status, 400);
  assert.equal(pulls, pullsBeforeHandler);
  assert.equal(calls.length, 0);
});

test('authorization, malformed cookies and bad target credentials reject before I/O', async t => {
  const cases = [
    ['authorization', {authorization: 'Bearer secret'}],
    ['missing', {cookie: undefined}],
    ['empty', {cookie: 'harin_dashboard_session='}],
    ['duplicate', {cookie: `harin_dashboard_session=${TOKEN}; harin_dashboard_session=${TOKEN}`}],
    ['comma folded', {cookie: `a=1, harin_dashboard_session=${TOKEN}`}],
    ['malformed pair', {cookie: `broken; harin_dashboard_session=${TOKEN}`}],
    ['quoted target', {cookie: `harin_dashboard_session="${TOKEN}"`}],
    ['percent target', {cookie: `harin_dashboard_session=${TOKEN}%2E`}],
    ['unsigned target', {cookie: 'harin_dashboard_session=only_payload'}],
    ['empty signature', {cookie: 'harin_dashboard_session=payload.'}],
  ];
  for (const [name, headers] of cases) await t.test(name, async () => {
    const {handler, calls} = setup();
    const response = await handler(request({headers}));
    assert.equal(response.status, 401);
    assert.deepEqual(await body(response), {ok: false, code: 'AUTH_REQUIRED'});
    assert.equal(response.headers.has('set-cookie'), false);
    assert.equal(calls.length, 0);
  });
});

test('only the Cookie header has a 16384-byte authentication cap', async () => {
  const prefix = 'harin_dashboard_session=';
  const exactToken = `${'a'.repeat(16_384 - Buffer.byteLength(prefix, 'utf8') - 2)}.b`;

  const exact = setup();
  const accepted = await exact.handler(request({headers: {cookie: `${prefix}${exactToken}`}}));
  assert.equal(accepted.status, 200);
  assert.deepEqual(exact.calls, [exactToken]);

  const oversized = setup();
  const rejected = await oversized.handler(request({headers: {cookie: `${prefix}a${exactToken}`}}));
  assert.equal(rejected.status, 401);
  assert.deepEqual(await body(rejected), {ok: false, code: 'AUTH_REQUIRED'});
  assert.equal(rejected.headers.has('set-cookie'), false);
  assert.equal(oversized.calls.length, 0);

  const unrelated = setup();
  const unrelatedResponse = await unrelated.handler(request({headers: {'x-padding': 'x'.repeat(20_000)}}));
  assert.equal(unrelatedResponse.status, 200);
  assert.deepEqual(unrelated.calls, [TOKEN]);
});

test('only literal true is success; false is auth failure and every other outcome is unavailable', async t => {
  const scenarios = [
    ['false', false, 401, 'AUTH_REQUIRED'],
    ['undefined', undefined, 503, 'LOGOUT_UNAVAILABLE'],
    ['truthy object', {ok: true, status: 200}, 503, 'LOGOUT_UNAVAILABLE'],
    ['forged status error', Object.assign(new Error('private token'), {status: 200, code: 'OK'}), 503, 'LOGOUT_UNAVAILABLE', true],
  ];
  for (const [name, outcome, status, code, throws] of scenarios) await t.test(name, async () => {
    let calls = 0;
    const handler = createSessionLogoutRequestHandler({allowedOrigins: [ORIGIN], logout: async () => {
      calls += 1;
      if (throws) throw outcome;
      return outcome;
    }});
    const response = await handler(request());
    assert.equal(response.status, status);
    assert.deepEqual(await body(response), {ok: false, code});
    assert.equal(response.headers.has('set-cookie'), false);
    assert.equal(calls, 1);
    assert.equal(JSON.stringify({ok: false, code}).includes('private token'), false);
    assertCommon(response);
    assert.deepEqual(headerNames(response), [
      'cache-control', 'content-type', 'pragma', 'referrer-policy', 'x-content-type-options',
    ]);
  });
});

test('a getter-bearing forged outcome is not trusted or inspected', async () => {
  let getterCalls = 0;
  const forged = {};
  Object.defineProperty(forged, 'status', {enumerable: true, get() {
    getterCalls += 1;
    throw new Error('private getter detail');
  }});
  const handler = createSessionLogoutRequestHandler({allowedOrigins: [ORIGIN], logout: async () => forged});
  const response = await handler(request());
  assert.equal(response.status, 503);
  assert.deepEqual(await body(response), {ok: false, code: 'LOGOUT_UNAVAILABLE'});
  assert.equal(getterCalls, 0);
  assert.equal(response.headers.has('set-cookie'), false);
});

test('pre-abort, late abort, hang and timeout are sanitized and never retry or delete cookie', async t => {
  await t.test('pre-abort', async () => {
    const controller = new AbortController(); controller.abort();
    const {handler, calls} = setup();
    const response = await handler(request({signal: controller.signal}));
    assert.equal(response.status, 503);
    assert.equal(calls.length, 0);
  });
  await t.test('late abort', async () => {
    const controller = new AbortController();
    let calls = 0; let resolve;
    const handler = createSessionLogoutRequestHandler({allowedOrigins: [ORIGIN], timeoutMs: 500,
      logout: () => { calls += 1; return new Promise(r => { resolve = r; }); }});
    const pending = handler(request({signal: controller.signal}));
    await new Promise(r => setImmediate(r));
    controller.abort();
    const response = await pending;
    resolve(true);
    await new Promise(r => setImmediate(r));
    assert.equal(response.status, 503);
    assert.equal(response.headers.has('set-cookie'), false);
    assert.equal(calls, 1);
  });
  await t.test('hang timeout', async () => {
    let calls = 0;
    const handler = createSessionLogoutRequestHandler({allowedOrigins: [ORIGIN], timeoutMs: 20,
      logout: () => { calls += 1; return new Promise(() => {}); }});
    const response = await handler(request());
    assert.equal(response.status, 503);
    assert.equal(response.headers.has('set-cookie'), false);
    assert.equal(calls, 1);
  });
});

test('deadline uses a monotonic clock rather than mutable wall time', async () => {
  const originalNow = Date.now;
  const originalSetTimeout = global.setTimeout;
  const originalClearTimeout = global.clearTimeout;
  const performance = require('node:perf_hooks').performance;
  const originalPerformanceNow = Object.getOwnPropertyDescriptor(performance, 'now');
  let wallClock = originalNow();
  let monotonicClock = 100;
  let timerId = 0;
  const timers = new Map();
  let calls = 0;
  let resolveLogout;
  let markDispatched;
  const dispatched = new Promise(resolve => { markDispatched = resolve; });
  const logoutPending = new Promise(resolve => { resolveLogout = resolve; });
  Object.defineProperty(performance, 'now', {configurable: true, value: () => monotonicClock});
  global.setTimeout = (callback, delay) => {
    const id = ++timerId;
    timers.set(id, {callback, delay});
    return id;
  };
  global.clearTimeout = id => { timers.delete(id); };
  Date.now = () => wallClock;
  const handler = createSessionLogoutRequestHandler({allowedOrigins: [ORIGIN], timeoutMs: 30,
    logout: () => {
      calls += 1;
      markDispatched();
      return logoutPending;
    }});
  try {
    const pending = handler(request());
    await dispatched;
    assert.deepEqual([...timers.values()].map(timer => timer.delay), [30]);
    wallClock -= 60_000;
    monotonicClock = 130;
    resolveLogout(true);
    const response = await pending;
    assert.equal(response.status, 503);
    assert.deepEqual(await body(response), {ok: false, code: 'LOGOUT_UNAVAILABLE'});
    assert.equal(response.headers.has('set-cookie'), false);
    assert.equal(calls, 1);
  } finally {
    Date.now = originalNow;
    global.setTimeout = originalSetTimeout;
    global.clearTimeout = originalClearTimeout;
    if (originalPerformanceNow) Object.defineProperty(performance, 'now', originalPerformanceNow);
    else delete performance.now;
    resolveLogout?.(true);
  }
});
