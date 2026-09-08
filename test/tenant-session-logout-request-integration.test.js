'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const auth = require('../lib/dashboard-auth.js');
const {createAuthSessionStore} = require('../lib/tenancy/auth-session-store.js');
const {createStepUpStorage} = require('../lib/tenancy/step-up-storage.js');
const {createSessionLogout} = require('../lib/tenancy/session-logout.js');
const {createSessionLogoutRequestHandler} = require('../lib/tenancy/session-logout-request.js');
const {
  USER_A, USER_B, PROFILE_A, PROFILE_B, PROVIDER_SESSION_A, PROVIDER_SESSION_B,
  FACTOR_A, FACTOR_B, OPERATION_A, OPERATION_B, ENCRYPTION_KEY, KEY_ID,
  prepareLifecycleDatabase, rpcFor, dashboardDbFor, passwordClient, mfaProvider,
} = require('./helpers/session-lifecycle-fixture.js');

const ORIGIN = 'https://hub.example.test';
const SECRET = 'test-only-http-logout-secret-with-enough-entropy';

function withSecret(run) {
  const previous = process.env.DASHBOARD_SESSION_SECRET;
  process.env.DASHBOARD_SESSION_SECRET = SECRET;
  return Promise.resolve().then(run).finally(() => {
    if (previous === undefined) delete process.env.DASHBOARD_SESSION_SECRET;
    else process.env.DASHBOARD_SESSION_SECRET = previous;
  });
}

function storage(rpcClient, identity) {
  return createStepUpStorage({
    rpcClient,
    provider: mfaProvider(identity),
    encryptionKey: ENCRYPTION_KEY,
    keyId: KEY_ID,
    timeoutMs: 1000,
  });
}

async function login(profile, dashboardDb, sessionFence) {
  return auth.authenticateAccount({
    account: profile.username,
    password: 'synthetic-password',
    ip: '192.0.2.20',
    userAgent: 'session-logout-request-integration',
  }, dashboardDb, {authClient: passwordClient(profile), sessionFence, fenceTimeoutMs: 1000});
}

function stepUpInput(loginResult, profile, factorId, operationId) {
  return {
    userId: profile.user_id,
    sessionId: loginResult.session.id,
    tokenHash: auth.tokenHash(loginResult.token),
    operationId,
    accessToken: `synthetic-original-access-${profile.user_id}`,
    refreshToken: `synthetic-original-refresh-${profile.user_id}`,
    factorId,
    code: '123456',
  };
}

function request(token, {origin = ORIGIN, urlOrigin = ORIGIN} = {}) {
  return new Request(`${urlOrigin}/internal/logout`, {method: 'POST', headers: {
    origin,
    'sec-fetch-site': 'same-origin',
    cookie: `harin_dashboard_session=${token}`,
  }});
}

function handler(logout) {
  return createSessionLogoutRequestHandler({allowedOrigins: [ORIGIN], logout, timeoutMs: 1000});
}

async function verifiedRow(database, sessionId) {
  return (await database.query(
    'select state,sealed_session from moaon_auth.step_up_attempts where session_id=$1', [sessionId])).rows[0];
}

test('native HTTP success revokes the real local session and MFA proof while preserving another account', () => withSecret(async () => {
  const database = await prepareLifecycleDatabase();
  try {
    const rpcClient = rpcFor(database);
    const sessionFence = createAuthSessionStore({rpcClient, timeoutMs: 1000});
    const dashboard = dashboardDbFor(database);
    const storageA = storage(rpcClient, {userId: USER_A, providerSessionId: PROVIDER_SESSION_A, factorId: FACTOR_A});
    const storageB = storage(rpcClient, {userId: USER_B, providerSessionId: PROVIDER_SESSION_B, factorId: FACTOR_B});
    const loginA = await login(PROFILE_A, dashboard.db, sessionFence);
    const loginB = await login(PROFILE_B, dashboard.db, sessionFence);
    await storageA.issue(stepUpInput(loginA, PROFILE_A, FACTOR_A, OPERATION_A));
    const proofB = await storageB.issue(stepUpInput(loginB, PROFILE_B, FACTOR_B, OPERATION_B));

    const service = createSessionLogout({db: dashboard.db, stepUpStorage: storageA, timeoutMs: 1000});
    const response = await handler(service.logout)(request(loginA.token));
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {ok: true});
    assert.equal(response.headers.get('set-cookie'),
      'harin_dashboard_session=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax');
    assert.equal(await auth.validateSession(loginA.token, {db: dashboard.db}), null);
    assert.deepEqual(await verifiedRow(database, loginA.session.id), {state: 'REVOKED', sealed_session: null});
    assert.equal((await auth.validateSession(loginB.token, {db: dashboard.db})).userId, USER_B);
    assert.deepEqual(await storageB.verifyStepUp({userId: USER_B, sessionId: loginB.session.id}), proofB);
    assert.notEqual((await verifiedRow(database, loginB.session.id)).sealed_session, null);
  } finally { await database.close(); }
}));

test('rejected native HTTP source preserves the original real session and MFA proof', () => withSecret(async () => {
  const database = await prepareLifecycleDatabase();
  try {
    const rpcClient = rpcFor(database);
    const sessionFence = createAuthSessionStore({rpcClient, timeoutMs: 1000});
    const dashboard = dashboardDbFor(database);
    const storageA = storage(rpcClient, {userId: USER_A, providerSessionId: PROVIDER_SESSION_A, factorId: FACTOR_A});
    const loginA = await login(PROFILE_A, dashboard.db, sessionFence);
    const proof = await storageA.issue(stepUpInput(loginA, PROFILE_A, FACTOR_A, OPERATION_A));
    const before = await verifiedRow(database, loginA.session.id);
    const service = createSessionLogout({db: dashboard.db, stepUpStorage: storageA, timeoutMs: 1000});

    const response = await handler(service.logout)(request(loginA.token, {origin: 'https://attacker.example'}));
    assert.equal(response.status, 403);
    assert.deepEqual(await response.json(), {ok: false, code: 'SOURCE_NOT_ALLOWED'});
    assert.equal(response.headers.has('set-cookie'), false);
    assert.equal((await auth.validateSession(loginA.token, {db: dashboard.db})).userId, USER_A);
    assert.deepEqual(await storageA.verifyStepUp({userId: USER_A, sessionId: loginA.session.id}), proof);
    assert.deepEqual(await verifiedRow(database, loginA.session.id), before);
  } finally { await database.close(); }
}));

test('cleanup failure after real session revoke returns 503 without claiming rollback or deleting the cookie', () => withSecret(async () => {
  const database = await prepareLifecycleDatabase();
  try {
    const rpcClient = rpcFor(database);
    const sessionFence = createAuthSessionStore({rpcClient, timeoutMs: 1000});
    const dashboard = dashboardDbFor(database);
    const loginA = await login(PROFILE_A, dashboard.db, sessionFence);
    const service = createSessionLogout({
      db: dashboard.db,
      stepUpStorage: {async revoke() { throw new Error('synthetic cleanup detail'); }},
      timeoutMs: 1000,
    });

    const response = await handler(service.logout)(request(loginA.token));
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), {ok: false, code: 'LOGOUT_UNAVAILABLE'});
    assert.equal(response.headers.has('set-cookie'), false);
    assert.equal(await auth.validateSession(loginA.token, {db: dashboard.db}), null);
  } finally { await database.close(); }
}));
