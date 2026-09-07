'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {createRecoveryReviewRequestHandler} = require('../lib/tenancy/recovery-review-request.js');
const {createStepUpStorage} = require('../lib/tenancy/step-up-storage.js');
const {
  USER,
  HUB_SESSION,
  ENCRYPTION_KEY,
  KEY_ID,
  prepareStepUpDatabase,
  rpcFor,
  providerResult,
  issueInput,
} = require('./helpers/step-up-storage-fixture.js');

const ORIGIN = 'https://hub.example.test';
const TARGET_USER = '20000000-0000-4000-8000-000000000001';
const TARGET_OPERATION = '50000000-0000-4000-8000-000000000001';

function request(body = {mode: 'inspect', userId: TARGET_USER, operationId: TARGET_OPERATION}) {
  return new Request(`${ORIGIN}/internal/recovery-review`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      cookie: 'harin_dashboard_session=opaque-synthetic-session',
      origin: ORIGIN,
    },
    body: JSON.stringify(body),
  });
}

function identity() {
  return {
    id: HUB_SESSION,
    userId: USER,
    email: 'owner@example.test',
    emailVerified: true,
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
  };
}

test('real stored-proof absence returns STEP_UP_REQUIRED before admission or resolver dispatch', async () => {
  const db = await prepareStepUpDatabase();
  try {
    const storage = createStepUpStorage({
      rpcClient: rpcFor(db),
      provider: {verifyTotp: async () => { throw new Error('must not verify TOTP'); }},
      encryptionKey: ENCRYPTION_KEY,
      keyId: KEY_ID,
    });
    const businessCalls = [];
    const handler = createRecoveryReviewRequestHandler({
      allowedOrigin: ORIGIN,
      verifySession: async () => identity(),
      verifyStepUp: storage.verifyStepUp,
      rpcClient: {async rpc(name) {
        businessCalls.push(name);
        return {data: name === 'moaon_consume_recovery_review' ? true : {}, error: null};
      }},
      now: Date.now,
    });

    const response = await handler(request());

    assert.equal(response.status, 403);
    assert.deepEqual(await response.json(), {ok: false, code: 'STEP_UP_REQUIRED'});
    assert.deepEqual(businessCalls, []);
  } finally {
    await db.close();
  }
});

test('real stored proof is re-read after admission before successful resolver dispatch', async () => {
  const db = await prepareStepUpDatabase();
  try {
    const storageCalls = [];
    const storage = createStepUpStorage({
      rpcClient: rpcFor(db, name => storageCalls.push(name)),
      provider: {verifyTotp: async () => providerResult()},
      encryptionKey: ENCRYPTION_KEY,
      keyId: KEY_ID,
    });
    await storage.issue(issueInput());
    storageCalls.length = 0;
    const businessCalls = [];
    const expectedInspection = {
      userId: TARGET_USER,
      operationId: TARGET_OPERATION,
      status: 'PENDING',
      stage: null,
      version: 'a'.repeat(64),
      decision: 'CLOSE_NOT_STARTED',
    };
    const handler = createRecoveryReviewRequestHandler({
      allowedOrigin: ORIGIN,
      verifySession: async () => identity(),
      verifyStepUp: storage.verifyStepUp,
      rpcClient: {async rpc(name) {
        businessCalls.push(name);
        return {data: name === 'moaon_consume_recovery_review' ? true : expectedInspection, error: null};
      }},
      now: Date.now,
    });

    const response = await handler(request());

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {ok: true, data: expectedInspection});
    assert.deepEqual(storageCalls, ['moaon_read_step_up', 'moaon_read_step_up']);
    assert.deepEqual(businessCalls, ['moaon_consume_recovery_review', 'moaon_inspect_recovery_review']);
  } finally {
    await db.close();
  }
});

test('real stored proof revoked before a request returns STEP_UP_REQUIRED without business RPC', async () => {
  const db = await prepareStepUpDatabase();
  try {
    const storage = createStepUpStorage({
      rpcClient: rpcFor(db),
      provider: {verifyTotp: async () => providerResult()},
      encryptionKey: ENCRYPTION_KEY,
      keyId: KEY_ID,
    });
    await storage.issue(issueInput());
    await storage.revoke({userId: USER, sessionId: HUB_SESSION, tokenHash: issueInput().tokenHash});
    const businessCalls = [];
    const handler = createRecoveryReviewRequestHandler({
      allowedOrigin: ORIGIN,
      verifySession: async () => identity(),
      verifyStepUp: storage.verifyStepUp,
      rpcClient: {async rpc(name) {
        businessCalls.push(name);
        return {data: true, error: null};
      }},
      now: Date.now,
    });

    const response = await handler(request());

    assert.equal(response.status, 403);
    assert.deepEqual(await response.json(), {ok: false, code: 'STEP_UP_REQUIRED'});
    assert.deepEqual(businessCalls, []);
  } finally {
    await db.close();
  }
});

test('real proof revoked during admission spends the admission and blocks inspect or resolve RPC', async t => {
  const bodies = [
    {mode: 'inspect', userId: TARGET_USER, operationId: TARGET_OPERATION},
    {
      mode: 'resolve',
      userId: TARGET_USER,
      operationId: TARGET_OPERATION,
      resolutionId: '60000000-0000-4000-8000-000000000001',
      expectedVersion: 'a'.repeat(64),
      action: 'CLOSE_NOT_STARTED',
    },
  ];
  for (const body of bodies) await t.test(body.mode, async () => {
    const db = await prepareStepUpDatabase();
    try {
      const storageCalls = [];
      const storage = createStepUpStorage({
        rpcClient: rpcFor(db, name => storageCalls.push(name)),
        provider: {verifyTotp: async () => providerResult()},
        encryptionKey: ENCRYPTION_KEY,
        keyId: KEY_ID,
      });
      await storage.issue(issueInput());
      storageCalls.length = 0;
      let admissionCalls = 0;
      let resolverCalls = 0;
      const handler = createRecoveryReviewRequestHandler({
        allowedOrigin: ORIGIN,
        verifySession: async () => identity(),
        verifyStepUp: storage.verifyStepUp,
        rpcClient: {async rpc(name) {
          if (name === 'moaon_consume_recovery_review') {
            admissionCalls += 1;
            await storage.revoke({userId: USER, sessionId: HUB_SESSION, tokenHash: issueInput().tokenHash});
            return {data: true, error: null};
          }
          resolverCalls += 1;
          return {data: {}, error: null};
        }},
        now: Date.now,
      });

      const response = await handler(request(body));

      assert.equal(response.status, 403);
      assert.deepEqual(await response.json(), {ok: false, code: 'STEP_UP_REQUIRED'});
      assert.equal(admissionCalls, 1);
      assert.equal(resolverCalls, 0);
      assert.deepEqual(storageCalls, ['moaon_read_step_up', 'moaon_revoke_step_up', 'moaon_read_step_up']);
    } finally {
      await db.close();
    }
  });
});
