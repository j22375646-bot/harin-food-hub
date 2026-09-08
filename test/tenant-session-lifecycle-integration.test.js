'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const auth = require('../lib/dashboard-auth.js');
const {createAuthSessionStore} = require('../lib/tenancy/auth-session-store.js');
const {createStepUpStorage} = require('../lib/tenancy/step-up-storage.js');
const {createSessionLogout, SessionLogoutError} = require('../lib/tenancy/session-logout.js');
const {
  USER_A,
  USER_B,
  PROFILE_A,
  PROFILE_B,
  PROVIDER_SESSION_A,
  PROVIDER_SESSION_B,
  FACTOR_A,
  FACTOR_B,
  OPERATION_A,
  OPERATION_B,
  ENCRYPTION_KEY,
  KEY_ID,
  prepareLifecycleDatabase,
  rpcFor,
  dashboardDbFor,
  passwordClient,
  mfaProvider,
} = require('./helpers/session-lifecycle-fixture.js');

function withSecret(run) {
  const previous = process.env.DASHBOARD_SESSION_SECRET;
  process.env.DASHBOARD_SESSION_SECRET = 'test-only-lifecycle-secret-with-enough-entropy';
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

function stepUpInput(login, profile, factorId, operationId) {
  return {
    userId: profile.user_id,
    sessionId: login.session.id,
    tokenHash: auth.tokenHash(login.token),
    operationId,
    accessToken: `synthetic-original-access-${profile.user_id}`,
    refreshToken: `synthetic-original-refresh-${profile.user_id}`,
    factorId,
    code: '123456',
  };
}

async function login(profile, dashboardDb, sessionFence) {
  return auth.authenticateAccount({
    account: profile.username,
    password: 'synthetic-password',
    ip: '192.0.2.10',
    userAgent: 'session-lifecycle-integration',
  }, dashboardDb, {authClient: passwordClient(profile), sessionFence, fenceTimeoutMs: 1000});
}

test('actual local login, MFA proof, and logout revoke only the derived session lifecycle', () => withSecret(async () => {
  const database = await prepareLifecycleDatabase();
  try {
    const rpcClient = rpcFor(database);
    const sessionFence = createAuthSessionStore({rpcClient, timeoutMs: 1000});
    const dashboard = dashboardDbFor(database);
    const storageA = storage(rpcClient, {userId: USER_A, providerSessionId: PROVIDER_SESSION_A, factorId: FACTOR_A});
    const storageB = storage(rpcClient, {userId: USER_B, providerSessionId: PROVIDER_SESSION_B, factorId: FACTOR_B});

    const loginA = await login(PROFILE_A, dashboard.db, sessionFence);
    const loginB = await login(PROFILE_B, dashboard.db, sessionFence);
    assert.equal((await auth.validateSession(loginA.token, {db: dashboard.db})).userId, USER_A);
    assert.equal((await auth.validateSession(loginB.token, {db: dashboard.db})).userId, USER_B);
    assert.equal(dashboard.directSessionInserts, 0);

    const proofA = await storageA.issue(stepUpInput(loginA, PROFILE_A, FACTOR_A, OPERATION_A));
    const proofB = await storageB.issue(stepUpInput(loginB, PROFILE_B, FACTOR_B, OPERATION_B));
    assert.equal((await storageA.verifyStepUp({userId: USER_A, sessionId: loginA.session.id})).sessionId, loginA.session.id);

    const logout = createSessionLogout({db: dashboard.db, stepUpStorage: storageA, timeoutMs: 1000});
    assert.equal(await logout.logout(loginA.token), true);
    assert.equal(await auth.validateSession(loginA.token, {db: dashboard.db}), null);
    await assert.rejects(
      () => storageA.verifyStepUp({userId: USER_A, sessionId: loginA.session.id}),
      error => error.code === 'STEP_UP_REQUIRED' && error.status === 403);
    const revoked = (await database.query(
      'select state,sealed_session from moaon_auth.step_up_attempts where session_id=$1', [loginA.session.id])).rows[0];
    assert.deepEqual(revoked, {state: 'REVOKED', sealed_session: null});
    assert.equal(await logout.logout(loginA.token), true);

    assert.equal((await auth.validateSession(loginB.token, {db: dashboard.db})).userId, USER_B);
    assert.deepEqual(
      await storageB.verifyStepUp({userId: USER_B, sessionId: loginB.session.id}),
      proofB);
    const otherRow = (await database.query(
      'select state,sealed_session from moaon_auth.step_up_attempts where session_id=$1', [loginB.session.id])).rows[0];
    assert.equal(otherRow.state, 'VERIFIED');
    assert.notEqual(otherRow.sealed_session, null);
    assert.equal(proofA.userId, USER_A);

    const freshA = await login(PROFILE_A, dashboard.db, sessionFence);
    assert.notEqual(freshA.session.id, loginA.session.id);
    assert.equal((await auth.validateSession(freshA.token, {db: dashboard.db})).userId, USER_A);
    await assert.rejects(
      () => storageA.verifyStepUp({userId: USER_A, sessionId: freshA.session.id}),
      error => error.code === 'STEP_UP_REQUIRED' && error.status === 403);

    const failingLogout = createSessionLogout({
      db: dashboard.db,
      stepUpStorage: {async revoke() { throw new Error('synthetic cleanup secret'); }},
      timeoutMs: 1000,
    });
    await assert.rejects(() => failingLogout.logout(freshA.token), error => {
      assert.ok(error instanceof SessionLogoutError);
      assert.equal(error.code, 'LOGOUT_UNAVAILABLE');
      assert.equal(error.status, 503);
      assert.equal(error.message.includes('synthetic cleanup secret'), false);
      assert.equal(error.cause, undefined);
      return true;
    });
    assert.equal(await auth.validateSession(freshA.token, {db: dashboard.db}), null);
    assert.equal((await auth.validateSession(loginB.token, {db: dashboard.db})).userId, USER_B);
  } finally {
    await database.close();
  }
}));
