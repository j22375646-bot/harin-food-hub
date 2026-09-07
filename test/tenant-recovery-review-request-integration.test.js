'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const dashboardAuth = require('../lib/dashboard-auth.js');
const {createDashboardIdentityVerifier} = require('../lib/tenancy/dashboard-identity.js');
const {createRecoveryReviewRequestHandler} = require('../lib/tenancy/recovery-review-request.js');
const {preservedState} = require('./helpers/recovery-resolution-fixture.js');
const {
  USER,
  OPERATOR,
  OTHER,
  OPERATION,
  RESOLUTION,
  createPostgrestReader,
  rpcFor,
  issueSession,
  prepareRequestDatabase,
  authUser,
} = require('./helpers/recovery-request-fixture.js');

const ORIGIN = 'https://hub.example.test';
const TEST_SECRET = 'p1-04-9-local-synthetic-session-secret-with-entropy';

function webRequest(token, body) {
  return new Request(`${ORIGIN}/internal/recovery-review`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json; charset=utf-8',
      cookie: `harin_dashboard_session=${token}`,
      origin: ORIGIN,
      'sec-fetch-site': 'same-origin',
    },
    body: JSON.stringify(body),
  });
}

function createHandler(db, token, {userId = OPERATOR, authOverrides = {}, authAdmin, onRpc = () => {}} = {}) {
  const reader = createPostgrestReader(db);
  const verifySession = createDashboardIdentityVerifier({
    db: reader,
    validateSession: dashboardAuth.validateSession,
    authAdmin: authAdmin || {
      async getUserById(queriedId) {
        assert.equal(queriedId, userId);
        return {data: {user: authUser(userId, authOverrides)}, error: null};
      },
    },
    now: Date.now,
  });
  return {
    token,
    handler: createRecoveryReviewRequestHandler({
      verifySession,
      rpcClient: rpcFor(db, onRpc),
      allowedOrigin: ORIGIN,
      now: Date.now,
    }),
  };
}

async function counts(db) {
  return (await db.query(`select
    (select count(*)::int from moaon_auth.recovery_resolutions) as resolutions,
    (select status from moaon_auth.recovery_reviews where operation_id=$1) as status`, [OPERATION])).rows[0];
}

async function authState(db) {
  await db.exec('reset role');
  try { return await preservedState(db); }
  finally { await db.exec('set role service_role'); }
}

async function expectUnavailable(response, status = 401, code = 'AUTH_REQUIRED') {
  assert.equal(response.status, status);
  assert.deepEqual(await response.json(), {ok: false, code});
}

async function withSyntheticSecret(run) {
  const previousSecret = process.env.DASHBOARD_SESSION_SECRET;
  const previousEnvironment = process.env.NODE_ENV;
  const previousBypass = process.env.HARIN_DEV_AUTH_BYPASS;
  process.env.DASHBOARD_SESSION_SECRET = TEST_SECRET;
  process.env.NODE_ENV = 'test';
  delete process.env.HARIN_DEV_AUTH_BYPASS;
  try { return await run(); }
  finally {
    if (previousSecret === undefined) delete process.env.DASHBOARD_SESSION_SECRET;
    else process.env.DASHBOARD_SESSION_SECRET = previousSecret;
    if (previousEnvironment === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousEnvironment;
    if (previousBypass === undefined) delete process.env.HARIN_DEV_AUTH_BYPASS;
    else process.env.HARIN_DEV_AUTH_BYPASS = previousBypass;
  }
}

test('real signed cookie traverses current identity verifier, resolver and PGlite SQL for inspect and CLOSE_NOT_STARTED', async () => {
  await withSyntheticSecret(async () => {
    const db = await prepareRequestDatabase();
    try {
      const token = await issueSession(db);
      const {handler} = createHandler(db, token);
      const beforeAuth = await authState(db);
      const inspected = await handler(webRequest(token, {mode: 'inspect', userId: USER, operationId: OPERATION}));
      assert.equal(inspected.status, 200);
      const inspection = (await inspected.json()).data;
      assert.equal(inspection.decision, 'CLOSE_NOT_STARTED');
      const resolved = await handler(webRequest(token, {
        mode: 'resolve', userId: USER, operationId: OPERATION, resolutionId: RESOLUTION,
        expectedVersion: inspection.version, action: 'CLOSE_NOT_STARTED',
      }));
      assert.deepEqual(await resolved.json(), {ok: true, data: {
        userId: USER, operationId: OPERATION, resolutionId: RESOLUTION, status: 'REJECTED',
      }});
      assert.deepEqual(await counts(db), {resolutions: 1, status: 'REJECTED'});
      assert.deepEqual(await authState(db), beforeAuth);
    } finally { await db.close(); }
  });
});

test('real PGlite evidence supports CONFIRM_COMPLETED while preserving all authentication state', async () => {
  await withSyntheticSecret(async () => {
    const db = await prepareRequestDatabase();
    try {
      const token = await issueSession(db);
      await db.exec('reset role');
      await db.query(`insert into moaon_auth.password_changes(user_id,id,status,completed_at)
        values($1,$2,'COMPLETED',clock_timestamp())`, [USER, OPERATION]);
      await db.exec('set role service_role');
      const beforeAuth = await authState(db);
      const {handler} = createHandler(db, token);
      const inspection = (await (await handler(webRequest(token, {
        mode: 'inspect', userId: USER, operationId: OPERATION,
      }))).json()).data;
      assert.equal(inspection.decision, 'CONFIRM_COMPLETED');
      const resolutionId = '60000000-0000-4000-8000-000000000002';
      const response = await handler(webRequest(token, {
        mode: 'resolve', userId: USER, operationId: OPERATION, resolutionId,
        expectedVersion: inspection.version, action: 'CONFIRM_COMPLETED',
      }));
      assert.deepEqual(await response.json(), {ok: true, data: {
        userId: USER, operationId: OPERATION, resolutionId, status: 'COMPLETED',
      }});
      assert.deepEqual(await counts(db), {resolutions: 1, status: 'COMPLETED'});
      assert.deepEqual(await authState(db), beforeAuth);
    } finally { await db.close(); }
  });
});

test('tampered, revoked, expired, inactive and provider-invalid identities never mutate journal or audit', async t => {
  const scenarios = [
    ['tampered token', async ({token}) => ({token: `${token.slice(0, -1)}${token.endsWith('a') ? 'b' : 'a'}`})],
    ['revoked session', async ({db}) => {
      await db.query('update public.dashboard_sessions set revoked_at=clock_timestamp()');
      return {};
    }],
    ['expired signed session', async ({db}) => ({token: await issueSession(db, {
      sessionId: '30000000-0000-4000-8000-000000000009',
      expiresAt: new Date(Date.now() - 60_000).toISOString(),
    })})],
    ['inactive profile', async ({db}) => {
      await db.query('update public.dashboard_users set active=false where user_id=$1', [OPERATOR]);
      return {};
    }],
    ['provider ban', async () => ({authOverrides: {banned_until: new Date(Date.now() + 60_000).toISOString()}})],
    ['provider email mismatch', async () => ({authOverrides: {email: 'mismatch@example.test'}})],
    ['provider email unconfirmed', async () => ({authOverrides: {email_confirmed_at: null}})],
  ];
  for (const [name, arrange] of scenarios) await t.test(name, async () => {
    await withSyntheticSecret(async () => {
      const db = await prepareRequestDatabase();
      try {
        const originalToken = await issueSession(db);
        const changes = await arrange({db, token: originalToken});
        const token = changes.token || originalToken;
        let rpcCalls = 0;
        const {handler} = createHandler(db, token, {
          authOverrides: changes.authOverrides,
          onRpc: () => { rpcCalls += 1; },
        });
        const before = await counts(db);
        await expectUnavailable(await handler(webRequest(token, {
          mode: 'inspect', userId: USER, operationId: OPERATION,
        })));
        assert.equal(rpcCalls, 0);
        assert.deepEqual(await counts(db), before);
      } finally { await db.close(); }
    });
  });
});

test('an ordinary OWNER absent from the recovery allowlist is rejected by real SQL without mutation', async () => {
  await withSyntheticSecret(async () => {
    const db = await prepareRequestDatabase();
    try {
      const token = await issueSession(db, {
        userId: OTHER,
        sessionId: '30000000-0000-4000-8000-000000000003',
        username: 'other',
        role: 'OWNER',
      });
      let rpcCalls = 0;
      const {handler} = createHandler(db, token, {userId: OTHER, onRpc: () => { rpcCalls += 1; }});
      const before = await counts(db);
      await expectUnavailable(await handler(webRequest(token, {
        mode: 'inspect', userId: USER, operationId: OPERATION,
      })), 503, 'RECOVERY_REVIEW_UNAVAILABLE');
      assert.equal(rpcCalls, 1);
      assert.deepEqual(await counts(db), before);
    } finally { await db.close(); }
  });
});

test('revoking the session during the external Auth lookup is caught by the second real validateSession read', async () => {
  await withSyntheticSecret(async () => {
    const db = await prepareRequestDatabase();
    try {
      const token = await issueSession(db);
      let rpcCalls = 0;
      const {handler} = createHandler(db, token, {
        onRpc: () => { rpcCalls += 1; },
        authAdmin: {
          async getUserById(queriedId) {
            assert.equal(queriedId, OPERATOR);
            await db.query('update public.dashboard_sessions set revoked_at=clock_timestamp() where user_id=$1', [OPERATOR]);
            return {data: {user: authUser()}, error: null};
          },
        },
      });
      const before = await counts(db);
      await expectUnavailable(await handler(webRequest(token, {
        mode: 'inspect', userId: USER, operationId: OPERATION,
      })));
      assert.equal(rpcCalls, 0);
      assert.deepEqual(await counts(db), before);
    } finally { await db.close(); }
  });
});
