'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {createHash} = require('node:crypto');
const auth = require('../lib/dashboard-auth.js');
const {
  createSessionLogout,
  SessionLogoutError,
} = require('../lib/tenancy/session-logout.js');

const USER = '20000000-0000-4000-8000-000000000001';
const SESSION = '50000000-0000-4000-8000-000000000001';
const SECRET = 'test-only-session-logout-secret-with-enough-entropy';

function withSecret(run) {
  const previous = process.env.DASHBOARD_SESSION_SECRET;
  process.env.DASHBOARD_SESSION_SECRET = SECRET;
  return Promise.resolve().then(run).finally(() => {
    if (previous === undefined) delete process.env.DASHBOARD_SESSION_SECRET;
    else process.env.DASHBOARD_SESSION_SECRET = previous;
  });
}

function sessionToken(overrides = {}) {
  return auth.createSessionToken({
    sessionId: SESSION,
    userId: USER,
    username: 'owner-a',
    displayName: 'Owner A',
    role: 'OWNER',
    ...overrides,
  });
}

function database({result = {error: null}, pending, throws, events = []} = {}) {
  const host = {
    marker: 'database-receiver',
    from(table) {
      assert.equal(this.marker, 'database-receiver');
      events.push(`db:from:${table}`);
      const filters = [];
      return {
        update(values) {
          events.push('db:update');
          assert.deepEqual(Reflect.ownKeys(values), ['revoked_at']);
          assert.ok(Number.isFinite(Date.parse(values.revoked_at)));
          return this;
        },
        eq(column, value) {
          filters.push([column, value]);
          events.push(`db:eq:${column}`);
          return this;
        },
        is(column, value) {
          filters.push([column, value]);
          events.push(`db:is:${column}`);
          assert.deepEqual(filters.map(([name]) => name), ['id', 'token_hash', 'revoked_at']);
          if (throws) throw throws;
          return pending || Promise.resolve(result);
        },
      };
    },
  };
  return host;
}

function storage({answer = true, pending, throws, events = [], inspect} = {}) {
  return {
    marker: 'storage-receiver',
    async revoke(identity) {
      assert.equal(this.marker, 'storage-receiver');
      events.push('storage:revoke');
      inspect?.(identity);
      if (throws) throw throws;
      return pending || answer;
    },
  };
}

function validConfiguration(overrides = {}) {
  return {db: database(), stepUpStorage: storage(), ...overrides};
}

function assertUnavailable(error, secrets = []) {
  assert.ok(error instanceof SessionLogoutError);
  assert.equal(error.name, 'SessionLogoutError');
  assert.equal(error.code, 'LOGOUT_UNAVAILABLE');
  assert.equal(error.status, 503);
  assert.equal(error.message, 'Logout is unavailable.');
  assert.equal(error.cause, undefined);
  for (const secret of secrets) assert.equal(`${error.name}:${error.message}`.includes(secret), false);
  return true;
}

test('factory rejects non-exact configuration without executing accessors', () => {
  const invalid = [
    undefined,
    null,
    [],
    {},
    {db: database()},
    {stepUpStorage: storage()},
    {...validConfiguration(), unknown: true},
    {...validConfiguration(), timeoutMs: 0},
    {...validConfiguration(), timeoutMs: 30001},
    {...validConfiguration(), timeoutMs: 1.5},
  ];
  for (const value of invalid) assert.throws(() => createSessionLogout(value), TypeError);

  let optionReads = 0;
  const accessor = {stepUpStorage: storage()};
  Object.defineProperty(accessor, 'db', {
    enumerable: true,
    get() { optionReads += 1; return database(); },
  });
  assert.throws(() => createSessionLogout(accessor), TypeError);
  assert.equal(optionReads, 0);

  const nonEnumerable = validConfiguration();
  Object.defineProperty(nonEnumerable, 'timeoutMs', {value: 100, enumerable: false});
  assert.throws(() => createSessionLogout(nonEnumerable), TypeError);

  const symbolConfiguration = validConfiguration();
  symbolConfiguration[Symbol('hidden')] = true;
  assert.throws(() => createSessionLogout(symbolConfiguration), TypeError);
});

test('factory snapshots callable dependency methods without invoking getters', () => withSecret(async () => {
  let methodReads = 0;
  const getterDb = {};
  Object.defineProperty(getterDb, 'from', {
    enumerable: true,
    get() { methodReads += 1; return database().from; },
  });
  assert.throws(() => createSessionLogout({db: getterDb, stepUpStorage: storage()}), TypeError);
  assert.equal(methodReads, 0);

  const events = [];
  const db = database({events});
  const stepUpStorage = storage({events});
  const service = createSessionLogout({db, stepUpStorage});
  db.from = () => { throw new Error('mutated db method'); };
  stepUpStorage.revoke = () => { throw new Error('mutated storage method'); };
  assert.equal(await service.logout(sessionToken()), true);
  assert.deepEqual(events, [
    'db:from:dashboard_sessions', 'db:update', 'db:eq:id', 'db:eq:token_hash',
    'db:is:revoked_at', 'storage:revoke',
  ]);
  assert.ok(Object.isFrozen(service));
}));

test('factory and logout reject browser execution before dependency I/O', () => withSecret(async () => {
  const priorWindow = global.window;
  const events = [];
  try {
    global.window = {};
    assert.throws(() => createSessionLogout({db: database({events}), stepUpStorage: storage({events})}), TypeError);
  } finally {
    if (priorWindow === undefined) delete global.window;
    else global.window = priorWindow;
  }

  const service = createSessionLogout({db: database({events}), stepUpStorage: storage({events})});
  const priorDocument = global.document;
  try {
    global.document = {};
    await assert.rejects(() => service.logout(sessionToken()), TypeError);
  } finally {
    if (priorDocument === undefined) delete global.document;
    else global.document = priorDocument;
  }
  assert.deepEqual(events, []);
}));

test('non-string, oversized, expired, malformed, and non-UUID sessions return false without I/O', () => withSecret(async () => {
  const events = [];
  const service = createSessionLogout({db: database({events}), stepUpStorage: storage({events})});
  let coercions = 0;
  const coercible = {toString() { coercions += 1; return sessionToken(); }};
  const expired = sessionToken({expiresAt: '2020-01-01T00:00:00.000Z'});
  const nonUuid = sessionToken({sessionId: 'legacy-session', userId: 'legacy-user'});
  for (const token of [undefined, null, 1, new String('token'), coercible, '', 'malformed',
    '한'.repeat(5462), expired, nonUuid]) {
    assert.equal(await service.logout(token), false);
  }
  assert.equal(coercions, 0);
  assert.deepEqual(events, []);
}));

test('missing signing configuration is sanitized and cannot become logout success', async () => {
  const previousSecret = process.env.DASHBOARD_SESSION_SECRET;
  const previousServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  delete process.env.DASHBOARD_SESSION_SECRET;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  const events = [];
  try {
    const service = createSessionLogout({db: database({events}), stepUpStorage: storage({events})});
    await assert.rejects(() => service.logout('payload.signature'), error => assertUnavailable(error));
  } finally {
    if (previousSecret === undefined) delete process.env.DASHBOARD_SESSION_SECRET;
    else process.env.DASHBOARD_SESSION_SECRET = previousSecret;
    if (previousServiceKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = previousServiceKey;
  }
  assert.deepEqual(events, []);
});

test('valid signed token revokes the hub session before exact frozen derived step-up identity', () => withSecret(async () => {
  const events = [];
  const token = sessionToken();
  const expectedHash = createHash('sha256').update(token, 'utf8').digest('hex');
  let received;
  const service = createSessionLogout({
    db: database({events}),
    stepUpStorage: storage({events, inspect(identity) { received = identity; }}),
  });

  assert.equal(await service.logout(token), true);
  assert.deepEqual(events, [
    'db:from:dashboard_sessions', 'db:update', 'db:eq:id', 'db:eq:token_hash',
    'db:is:revoked_at', 'storage:revoke',
  ]);
  assert.deepEqual(received, {userId: USER, sessionId: SESSION, tokenHash: expectedHash});
  assert.deepEqual(Reflect.ownKeys(received), ['userId', 'sessionId', 'tokenHash']);
  assert.ok(Object.isFrozen(received));
}));

test('tampering and cross-session substitutions cannot dispatch either revocation stage', () => withSecret(async () => {
  const events = [];
  const service = createSessionLogout({db: database({events}), stepUpStorage: storage({events})});
  const token = sessionToken();
  const tampered = `${token.slice(0, -1)}${token.endsWith('a') ? 'b' : 'a'}`;
  const other = sessionToken({
    sessionId: '50000000-0000-4000-8000-000000000002',
    userId: '20000000-0000-4000-8000-000000000002',
  });
  assert.equal(await service.logout(tampered, {userId: USER, sessionId: SESSION}), false);
  assert.deepEqual(events, []);
  assert.equal(await service.logout(other), true);
  assert.equal(events.filter(event => event === 'storage:revoke').length, 1);
}));

test('database failure is sanitized and never dispatches step-up cleanup', () => withSecret(async () => {
  for (const failure of [
    {result: {error: {message: 'database-secret-detail'}}},
    {throws: new Error('database-throw-secret')},
  ]) {
    const events = [];
    const service = createSessionLogout({db: database({...failure, events}), stepUpStorage: storage({events})});
    await assert.rejects(() => service.logout(sessionToken()), error =>
      assertUnavailable(error, ['database-secret-detail', 'database-throw-secret']));
    assert.equal(events.includes('storage:revoke'), false);
  }
}));

test('false, malformed, or throwing cleanup outcomes are sanitized without retry', () => withSecret(async () => {
  for (const outcome of [false, null, {ok: true}]) {
    const events = [];
    const service = createSessionLogout({db: database({events}), stepUpStorage: storage({events, answer: outcome})});
    await assert.rejects(() => service.logout(sessionToken()), error => assertUnavailable(error));
    assert.equal(events.filter(event => event === 'storage:revoke').length, 1);
  }
  const events = [];
  const service = createSessionLogout({
    db: database({events}),
    stepUpStorage: storage({events, throws: new Error('sealed-provider-secret')}),
  });
  await assert.rejects(() => service.logout(sessionToken()), error =>
    assertUnavailable(error, ['sealed-provider-secret']));
  assert.equal(events.filter(event => event === 'storage:revoke').length, 1);
}));

test('one total deadline stops a late database completion from dispatching cleanup', () => withSecret(async () => {
  let resolveDatabase;
  const pending = new Promise(resolve => { resolveDatabase = resolve; });
  const events = [];
  const service = createSessionLogout({
    db: database({events, pending}),
    stepUpStorage: storage({events}),
    timeoutMs: 10,
  });
  await assert.rejects(() => service.logout(sessionToken()), error => assertUnavailable(error));
  resolveDatabase({error: null});
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal(events.includes('storage:revoke'), false);
}));

test('one total deadline bounds hanging cleanup and never retries it', () => withSecret(async () => {
  const events = [];
  const pending = new Promise(() => {});
  const service = createSessionLogout({
    db: database({events}),
    stepUpStorage: storage({events, pending}),
    timeoutMs: 10,
  });
  await assert.rejects(() => service.logout(sessionToken()), error => assertUnavailable(error));
  assert.equal(events.filter(event => event === 'storage:revoke').length, 1);
}));

test('legacy session parsing, validation, and revocation retain their public behavior', () => withSecret(async () => {
  const token = sessionToken();
  assert.equal(auth.parseSession(token).id, SESSION);
  assert.equal(await auth.validateSession('malformed', {db: {from() { throw new Error('must not read'); }}}), null);
  assert.equal(await auth.revokeSession('malformed', {from() { throw new Error('must not write'); }}), false);
}));
