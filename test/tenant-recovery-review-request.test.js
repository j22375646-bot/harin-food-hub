'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  createRecoveryReviewRequestHandler,
} = require('../lib/tenancy/recovery-review-request.js');
const {
  DashboardIdentityError,
} = require('../lib/tenancy/dashboard-identity.js');
const {StepUpStorageError} = require('../lib/tenancy/step-up-storage.js');

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

function proof(overrides = {}) {
  return {
    userId: OPERATOR,
    sessionId: SESSION,
    method: 'mfa',
    verifiedAt: '2026-09-08T11:59:00.000Z',
    expiresAt: '2026-09-08T12:04:00.000Z',
    ...overrides,
  };
}

function liveProof() {
  const current = Date.now();
  return proof({
    verifiedAt: new Date(current - 1_000).toISOString(),
    expiresAt: new Date(current + 60_000).toISOString(),
  });
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
    verifyStepUp: async () => proof(),
    rpcClient: {async rpc(name) {
      return {data: name === 'moaon_consume_recovery_review' ? true
        : name === 'moaon_inspect_recovery_review' ? inspection() : {
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

test('factory rejects a recovery review handler without a step-up authority', () => {
  const {verifySession, rpcClient, allowedOrigin} = dependencies();
  assert.throws(
    () => createRecoveryReviewRequestHandler({verifySession, rpcClient, allowedOrigin}),
    TypeError
  );
});

test('missing step-up proof returns STEP_UP_REQUIRED before recovery resolution', async () => {
  let resolutionCalls = 0;
  const handler = createRecoveryReviewRequestHandler(dependencies({
    verifyStepUp: async () => null,
    rpcClient: {async rpc() {
      resolutionCalls += 1;
      return {data: inspection(), error: null};
    }},
  }));

  const response = await handler(request());

  assert.equal(response.status, 403);
  assert.equal(resolutionCalls, 0);
  assert.deepEqual(await response.json(), {ok: false, code: 'STEP_UP_REQUIRED'});
});

test('step-up proof rejects absent, cross-session, stale, future, expired and non-mfa evidence before SQL', async () => {
  const cases = [
    [undefined, 403],
    [false, 403],
    [proof({userId: USER}), 403],
    [proof({sessionId: '30000000-0000-4000-8000-000000000009'}), 403],
    [proof({method: 'password'}), 403],
    [proof({verifiedAt: '2026-09-08T12:00:00.001Z', expiresAt: '2026-09-08T12:04:00.001Z'}), 403],
    [proof({verifiedAt: '2026-09-08T11:55:00.000Z', expiresAt: '2026-09-08T12:00:00.000Z'}), 403],
    [proof({expiresAt: '2026-09-08T12:00:00.000Z'}), 403],
  ];
  for (const [evidence, status] of cases) {
    let resolutionCalls = 0;
    const handler = createRecoveryReviewRequestHandler(dependencies({
      verifyStepUp: async context => {
        assert.deepEqual(context, {userId: OPERATOR, sessionId: SESSION});
        assert.equal(Object.isFrozen(context), true);
        return evidence;
      },
      rpcClient: {async rpc() { resolutionCalls += 1; return {data: inspection(), error: null}; }},
    }));
    const response = await handler(request());
    await expectError(response, status, 'STEP_UP_REQUIRED');
    assert.equal(resolutionCalls, 0);
  }
});

test('malformed step-up authority evidence is sanitized before SQL', async () => {
  const symbol = Symbol('hidden');
  const malformed = [
    {},
    [],
    {...proof(), extra: true},
    Object.assign(proof(), {[symbol]: true}),
    proof({userId: 'bad'}),
    proof({sessionId: '30000000-0000-9000-8000-000000000001'}),
    proof({method: 1}),
    proof({verifiedAt: '2026-09-08T11:59:00Z'}),
    proof({expiresAt: '2026-09-08T12:04:00Z'}),
    proof({expiresAt: '2026-09-08T11:59:00.000Z'}),
    proof({verifiedAt: '2026-09-08T11:59:00.000Z', expiresAt: '2026-09-08T12:04:00.001Z'}),
  ];
  const throwing = proof();
  Object.defineProperty(throwing, 'expiresAt', {enumerable: true, get() { throw new Error('private proof store'); }});
  malformed.push(throwing);
  for (const evidence of malformed) {
    let resolutionCalls = 0;
    const handler = createRecoveryReviewRequestHandler(dependencies({
      verifyStepUp: async () => evidence,
      rpcClient: {async rpc() { resolutionCalls += 1; return {data: inspection(), error: null}; }},
    }));
    await expectError(await handler(request()), 503, 'RECOVERY_REVIEW_UNAVAILABLE');
    assert.equal(resolutionCalls, 0);
  }
});

test('each step-up evidence response is copied once before a successful request', async () => {
  const observations = [];
  const response = await createRecoveryReviewRequestHandler(dependencies({
    verifyStepUp: async () => {
      const reads = new Map();
      const evidence = {};
      for (const [key, value] of Object.entries(proof())) Object.defineProperty(evidence, key, {
        enumerable: true,
        get() { reads.set(key, (reads.get(key) || 0) + 1); return value; },
      });
      observations.push(reads);
      return evidence;
    },
  }))(request());
  assert.equal(response.status, 200);
  assert.equal(observations.length, 2);
  for (const reads of observations) {
    assert.deepEqual(Object.fromEntries(reads), Object.fromEntries(Object.keys(proof()).map(key => [key, 1])));
  }
});

test('admission denial returns a fixed retry window and never dispatches resolution', async () => {
  const calls = [];
  const handler = createRecoveryReviewRequestHandler(dependencies({
    rpcClient: {async rpc(name, args) {
      calls.push({name, args});
      return {data: false, error: null};
    }},
  }));

  const response = await handler(request());

  await expectError(response, 429, 'RECOVERY_REVIEW_RATE_LIMITED');
  assert.equal(response.headers.get('retry-after'), '60');
  assert.deepEqual(calls, [{name: 'moaon_consume_recovery_review', args: {
    p_operator_id: OPERATOR,
    p_session_id: SESSION,
    p_mode: 'inspect',
  }}]);
});

test('successful request verifies identity, proof, admission, identity again, then resolution', async () => {
  const events = [];
  let identityCalls = 0;
  let proofCalls = 0;
  const handler = createRecoveryReviewRequestHandler(dependencies({
    verifySession: async credential => {
      assert.equal(credential, COOKIE);
      identityCalls += 1;
      events.push(`identity:${identityCalls}`);
      return identity();
    },
    verifyStepUp: async context => {
      assert.deepEqual(context, {userId: OPERATOR, sessionId: SESSION});
      assert.equal(Object.isFrozen(context), true);
      proofCalls += 1;
      events.push('proof');
      return proofCalls === 1 ? proof() : proof({
        verifiedAt: '2026-09-08T11:59:30.000Z',
        expiresAt: '2026-09-08T12:04:30.000Z',
      });
    },
    rpcClient: {async rpc(name, args) {
      events.push(name);
      if (name === 'moaon_consume_recovery_review') {
        assert.deepEqual(args, {p_operator_id: OPERATOR, p_session_id: SESSION, p_mode: 'inspect'});
        return {data: true, error: null};
      }
      return {data: inspection(), error: null};
    }},
  }));

  assert.equal((await handler(request())).status, 200);
  assert.deepEqual(events, [
    'identity:1',
    'proof',
    'moaon_consume_recovery_review',
    'identity:2',
    'proof',
    'moaon_inspect_recovery_review',
  ]);
});

test('identity recheck failures after admission never dispatch resolution', async () => {
  const cases = [
    [null, 401, 'AUTH_REQUIRED'],
    [identity({id: '30000000-0000-4000-8000-000000000009'}), 401, 'AUTH_REQUIRED'],
    [identity({userId: USER}), 401, 'AUTH_REQUIRED'],
    [identity({email: 'changed@example.test'}), 401, 'AUTH_REQUIRED'],
    [identity({emailVerified: false}), 401, 'AUTH_REQUIRED'],
    [identity({expiresAt: '2026-09-08T12:00:00.000Z'}), 401, 'AUTH_REQUIRED'],
    [identity({expiresAt: '2026-09-08T13:00:00Z'}), 503, 'RECOVERY_REVIEW_UNAVAILABLE'],
    [{...identity(), extra: true}, 503, 'RECOVERY_REVIEW_UNAVAILABLE'],
  ];
  for (const [second, status, code] of cases) {
    let identityCalls = 0;
    const rpcNames = [];
    const handler = createRecoveryReviewRequestHandler(dependencies({
      verifySession: async () => (++identityCalls === 1 ? identity() : second),
      rpcClient: {async rpc(name) {
        rpcNames.push(name);
        return {data: name === 'moaon_consume_recovery_review' ? true : inspection(), error: null};
      }},
    }));
    await expectError(await handler(request()), status, code);
    assert.deepEqual(rpcNames, ['moaon_consume_recovery_review']);
  }
});

test('fresh proof absence, identity change, expiry and malformed evidence block resolver dispatch', async () => {
  const throwing = proof();
  Object.defineProperty(throwing, 'expiresAt', {
    enumerable: true,
    get() { throw new Error('private fresh proof store'); },
  });
  const cases = [
    [null, 403, 'STEP_UP_REQUIRED'],
    [proof({userId: USER}), 403, 'STEP_UP_REQUIRED'],
    [proof({sessionId: '30000000-0000-4000-8000-000000000009'}), 403, 'STEP_UP_REQUIRED'],
    [proof({method: 'password'}), 403, 'STEP_UP_REQUIRED'],
    [proof({expiresAt: '2026-09-08T12:00:00.000Z'}), 403, 'STEP_UP_REQUIRED'],
    [{...proof(), extra: true}, 503, 'RECOVERY_REVIEW_UNAVAILABLE'],
    [throwing, 503, 'RECOVERY_REVIEW_UNAVAILABLE'],
  ];
  for (const [second, status, code] of cases) {
    let proofCalls = 0;
    const proofInputs = [];
    const rpcNames = [];
    const handler = createRecoveryReviewRequestHandler(dependencies({
      verifyStepUp: async context => {
        proofCalls += 1;
        proofInputs.push(context);
        return proofCalls === 1 ? proof() : second;
      },
      rpcClient: {async rpc(name) {
        rpcNames.push(name);
        return {data: name === 'moaon_consume_recovery_review' ? true : inspection(), error: null};
      }},
    }));

    await expectError(await handler(request()), status, code);
    assert.equal(proofCalls, 2);
    assert.deepEqual(proofInputs, [
      {userId: OPERATOR, sessionId: SESSION},
      {userId: OPERATOR, sessionId: SESSION},
    ]);
    assert.equal(proofInputs.every(Object.isFrozen), true);
    assert.deepEqual(rpcNames, ['moaon_consume_recovery_review']);
  }
});

test('only the actual storage STEP_UP_REQUIRED error maps to 403 and all other proof errors stay sanitized', async () => {
  const cases = [
    [new StepUpStorageError('STEP_UP_REQUIRED'), 403, 'STEP_UP_REQUIRED'],
    [new StepUpStorageError('STEP_UP_UNAVAILABLE'), 503, 'RECOVERY_REVIEW_UNAVAILABLE'],
    [Object.assign(new Error('forged private storage error'), {code: 'STEP_UP_REQUIRED', status: 403}),
      503, 'RECOVERY_REVIEW_UNAVAILABLE'],
    [new Error('raw token OTP ciphertext private SQL'), 503, 'RECOVERY_REVIEW_UNAVAILABLE'],
  ];
  for (const [proofError, status, code] of cases) {
    let businessCalls = 0;
    const handler = createRecoveryReviewRequestHandler(dependencies({
      verifyStepUp: async () => { throw proofError; },
      rpcClient: {async rpc() { businessCalls += 1; throw new Error('must not dispatch'); }},
    }));

    const response = await handler(request());

    const serialized = JSON.stringify(await response.clone().json());
    await expectError(response, status, code);
    assert.equal(businessCalls, 0);
    for (const secret of ['forged private storage error', 'raw token', 'OTP', 'ciphertext', 'private SQL']) {
      assert.equal(serialized.includes(secret), false);
    }
  }
});

test('proof and initial session expiry cannot be extended while admission or identity recheck waits', async t => {
  await t.test('proof expires after admission dispatch', async () => {
    let current = NOW;
    const rpcNames = [];
    const handler = createRecoveryReviewRequestHandler(dependencies({
      now: () => current,
      verifyStepUp: async () => proof({
        verifiedAt: '2026-09-08T11:59:59.000Z',
        expiresAt: '2026-09-08T12:00:00.005Z',
      }),
      rpcClient: {async rpc(name) {
        rpcNames.push(name);
        if (name === 'moaon_consume_recovery_review') current = NOW + 5;
        return {data: name === 'moaon_consume_recovery_review' ? true : inspection(), error: null};
      }},
    }));
    await expectError(await handler(request()), 403, 'STEP_UP_REQUIRED');
    assert.deepEqual(rpcNames, ['moaon_consume_recovery_review']);
  });

  await t.test('initial session expiry wins over a longer rechecked expiry', async () => {
    let current = NOW;
    let identityCalls = 0;
    const rpcNames = [];
    const handler = createRecoveryReviewRequestHandler(dependencies({
      now: () => current,
      verifySession: async () => {
        identityCalls += 1;
        if (identityCalls === 2) current = NOW + 5;
        return identity({expiresAt: identityCalls === 1
          ? '2026-09-08T12:00:00.005Z' : '2026-09-08T13:00:00.000Z'});
      },
      rpcClient: {async rpc(name) {
        rpcNames.push(name);
        return {data: name === 'moaon_consume_recovery_review' ? true : inspection(), error: null};
      }},
    }));
    await expectError(await handler(request()), 401, 'AUTH_REQUIRED');
    assert.deepEqual(rpcNames, ['moaon_consume_recovery_review']);
  });

  await t.test('a newer longer proof cannot extend the initial proof expiry', async () => {
    let current = NOW;
    let proofCalls = 0;
    const rpcNames = [];
    const handler = createRecoveryReviewRequestHandler(dependencies({
      now: () => current,
      verifyStepUp: async () => {
        proofCalls += 1;
        if (proofCalls === 1) return proof({
          verifiedAt: '2026-09-08T11:59:59.000Z',
          expiresAt: '2026-09-08T12:00:00.005Z',
        });
        const newer = proof({
          verifiedAt: '2026-09-08T12:00:00.000Z',
          expiresAt: '2026-09-08T12:01:00.000Z',
        });
        Object.defineProperty(newer, 'expiresAt', {
          enumerable: true,
          get() {
            current = NOW + 5;
            return '2026-09-08T12:01:00.000Z';
          },
        });
        return newer;
      },
      rpcClient: {async rpc(name) {
        rpcNames.push(name);
        return {data: name === 'moaon_consume_recovery_review' ? true : inspection(), error: null};
      }},
    }));

    await expectError(await handler(request()), 403, 'STEP_UP_REQUIRED');
    assert.equal(proofCalls, 2);
    assert.deepEqual(rpcNames, ['moaon_consume_recovery_review']);
  });
});

test('an observed clock rollback blocks every later RPC dispatch as unavailable', async t => {
  const futureProof = () => proof({
    verifiedAt: '2026-09-08T12:00:00.050Z',
    expiresAt: '2026-09-08T12:00:01.000Z',
  });

  await t.test('before admission', async () => {
    let current = NOW;
    let regressAfterRead = false;
    let admissionCalls = 0;
    const handler = createRecoveryReviewRequestHandler(dependencies({
      now: () => {
        const value = current;
        if (regressAfterRead) {
          regressAfterRead = false;
          current = NOW;
        }
        return value;
      },
      verifyStepUp: () => {
        current = NOW + 100;
        const evidence = futureProof();
        Object.defineProperty(evidence, 'expiresAt', {
          enumerable: true,
          get() {
            regressAfterRead = true;
            return '2026-09-08T12:00:01.000Z';
          },
        });
        return evidence;
      },
      rpcClient: {async rpc(name) {
        if (name === 'moaon_consume_recovery_review') admissionCalls += 1;
        return {data: name === 'moaon_consume_recovery_review' ? true : inspection(), error: null};
      }},
    }));

    await expectError(await handler(request()), 503, 'RECOVERY_REVIEW_UNAVAILABLE');
    assert.equal(admissionCalls, 0);
  });

  await t.test('before resolver', async () => {
    let current = NOW;
    let identityCalls = 0;
    let admissionCalls = 0;
    let resolverCalls = 0;
    const handler = createRecoveryReviewRequestHandler(dependencies({
      now: () => current,
      verifySession: async () => {
        identityCalls += 1;
        if (identityCalls === 2) {
          const fresh = identity();
          Object.defineProperty(fresh, 'expiresAt', {
            enumerable: true,
            get() {
              current = NOW;
              return '2026-09-08T13:00:00.000Z';
            },
          });
          return fresh;
        }
        return identity();
      },
      verifyStepUp: () => {
        current = NOW + 100;
        return futureProof();
      },
      rpcClient: {async rpc(name) {
        if (name === 'moaon_consume_recovery_review') admissionCalls += 1;
        else resolverCalls += 1;
        return {data: name === 'moaon_consume_recovery_review' ? true : inspection(), error: null};
      }},
    }));

    await expectError(await handler(request()), 503, 'RECOVERY_REVIEW_UNAVAILABLE');
    assert.equal(admissionCalls, 1);
    assert.equal(resolverCalls, 0);
  });
});

test('partial clock rollback after a later observation stops fresh proof and resolver I/O', async () => {
  let clockState = 'base';
  let identityCalls = 0;
  let proofCalls = 0;
  const rpcNames = [];
  const handler = createRecoveryReviewRequestHandler(dependencies({
    now: () => {
      if (clockState === 'advanced') {
        clockState = 'regressed';
        return NOW + 100;
      }
      return clockState === 'regressed' ? NOW + 50 : NOW;
    },
    verifySession: async () => {
      identityCalls += 1;
      if (identityCalls === 1) return identity();
      const fresh = identity();
      Object.defineProperty(fresh, 'expiresAt', {
        enumerable: true,
        get() {
          clockState = 'advanced';
          return '2026-09-08T13:00:00.000Z';
        },
      });
      return fresh;
    },
    verifyStepUp: async () => {
      proofCalls += 1;
      return proof();
    },
    rpcClient: {async rpc(name) {
      rpcNames.push(name);
      return {data: name === 'moaon_consume_recovery_review' ? true : inspection(), error: null};
    }},
  }));

  const response = await handler(request());
  assert.equal(proofCalls, 1);
  assert.deepEqual(rpcNames, ['moaon_consume_recovery_review']);
  await expectError(response, 503, 'RECOVERY_REVIEW_UNAVAILABLE');
});

test('malformed or failed admission stays sanitized and never starts resolution', async () => {
  for (const result of [
    {data: 1, error: null},
    {data: true},
    {data: true, error: {message: 'private admission SQL'}},
  ]) {
    const rpcNames = [];
    const handler = createRecoveryReviewRequestHandler(dependencies({
      rpcClient: {async rpc(name) { rpcNames.push(name); return result; }},
    }));
    await expectError(await handler(request()), 503, 'RECOVERY_REVIEW_UNAVAILABLE');
    assert.deepEqual(rpcNames, ['moaon_consume_recovery_review']);
  }
});

test('missing dashboard cookie returns AUTH_REQUIRED without dispatching recovery SQL', async () => {
  let rpcCalls = 0;
  const handler = createRecoveryReviewRequestHandler({
    allowedOrigin: ORIGIN,
    verifySession: async () => { throw new Error('must not verify'); },
    verifyStepUp: async () => { throw new Error('must not verify step-up'); },
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
    {...valid, verifyStepUp: null},
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
  let proofReads = 0;
  const handler = createRecoveryReviewRequestHandler(dependencies({
    verifySession: async () => {verified += 1; return identity();},
    verifyStepUp: async () => {proofReads += 1; return proof();},
  }));
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
  assert.equal(proofReads, 0);
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
    rpcClient: {async rpc(name) {calls += 1; return {
      data: name === 'moaon_consume_recovery_review' ? true : inspection(), error: null,
    };}},
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
  assert.equal(calls, 2);
  assert.equal(verified, 2);
});

test('cookie parsing rejects duplication, mixing and ambiguous values while passing the raw cookie octets', async () => {
  let credential;
  let proofReads = 0;
  const handler = createRecoveryReviewRequestHandler(dependencies({
    verifySession: async value => {credential = value; return identity();},
    verifyStepUp: async () => {proofReads += 1; return proof();},
  }));
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
  assert.equal(proofReads, 0);
  const raw = 'opaque%2Ecookie_value-~';
  const response = await handler(request(undefined, {headers: {cookie: `other=1; harin_dashboard_session=${raw}`}}));
  assert.equal(response.status, 200);
  assert.equal(credential, raw);
  assert.equal(proofReads, 2);
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
    rpcClient: {async rpc(name, args) {calls.push({name, args}); return {
      data: name === 'moaon_consume_recovery_review' ? true : inspection(), error: null,
    };}},
  }));
  const duplicate = `{"mode":"resolve","mode":"inspect","userId":"${USER.toUpperCase()}","operationId":"${OPERATION.toUpperCase()}"}`;
  const response = await handler(request(undefined, {body: duplicate}));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {ok: true, data: inspection()});
  assert.deepEqual(Object.fromEntries(reads), Object.fromEntries(Object.keys(identity()).map(key => [key, 2])));
  assert.deepEqual(calls, [{name: 'moaon_consume_recovery_review', args: {
    p_operator_id: OPERATOR,
    p_session_id: SESSION,
    p_mode: 'inspect',
  }}, {name: 'moaon_inspect_recovery_review', args: {
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
      return {data: name === 'moaon_consume_recovery_review' ? true
        : {userId: USER, operationId: OPERATION, resolutionId: RESOLUTION, status: 'REJECTED'}, error: null};
    }},
  }));
  const body = {mode: 'resolve', userId: USER, operationId: OPERATION, resolutionId: RESOLUTION,
    expectedVersion: VERSION, action: 'CLOSE_NOT_STARTED'};
  const response = await handler(request(body));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {ok: true, data: {
    userId: USER, operationId: OPERATION, resolutionId: RESOLUTION, status: 'REJECTED',
  }});
  assert.equal(calls.length, 2);
  assert.equal(calls[1].args.p_operator_id, OPERATOR);
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
    [async () => identity({emailVerified: 'true'}), 503, 'RECOVERY_REVIEW_UNAVAILABLE'],
    [async () => identity({emailVerified: 0}), 503, 'RECOVERY_REVIEW_UNAVAILABLE'],
    [async () => identity({emailVerified: undefined}), 503, 'RECOVERY_REVIEW_UNAVAILABLE'],
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
    verifyStepUp: async () => liveProof(),
  }));
  await expectError(await timed(request()), 503, 'RECOVERY_REVIEW_UNAVAILABLE');
  pendingRpc.resolve({data: inspection(), error: null});
  await new Promise(resolve => setTimeout(resolve, 10));
  assert.equal(calls, 1);
});

test('abort or deadline during the second proof read cannot dispatch a late resolver RPC', async t => {
  await t.test('abort', async () => {
    const pending = deferred();
    const secondStarted = deferred();
    const controller = new AbortController();
    let proofCalls = 0;
    const rpcNames = [];
    const handler = createRecoveryReviewRequestHandler(dependencies({
      verifySession: async () => identity({expiresAt: new Date(Date.now() + 60_000).toISOString()}),
      verifyStepUp: async () => {
        proofCalls += 1;
        if (proofCalls === 2) {
          secondStarted.resolve();
          return pending.promise;
        }
        return liveProof();
      },
      rpcClient: {async rpc(name) {
        rpcNames.push(name);
        return {data: name === 'moaon_consume_recovery_review' ? true : inspection(), error: null};
      }},
      now: Date.now,
    }));

    const responsePromise = handler(request(undefined, {signal: controller.signal}));
    await secondStarted.promise;
    controller.abort();
    await expectError(await responsePromise, 503, 'RECOVERY_REVIEW_UNAVAILABLE');
    pending.resolve(liveProof());
    await new Promise(resolve => setTimeout(resolve, 5));
    assert.equal(proofCalls, 2);
    assert.deepEqual(rpcNames, ['moaon_consume_recovery_review']);
  });

  await t.test('deadline', async () => {
    const pending = deferred();
    let proofCalls = 0;
    const rpcNames = [];
    const handler = createRecoveryReviewRequestHandler(dependencies({
      verifySession: async () => identity({expiresAt: new Date(Date.now() + 60_000).toISOString()}),
      verifyStepUp: async () => {
        proofCalls += 1;
        return proofCalls === 1 ? liveProof() : pending.promise;
      },
      rpcClient: {async rpc(name) {
        rpcNames.push(name);
        return {data: name === 'moaon_consume_recovery_review' ? true : inspection(), error: null};
      }},
      timeoutMs: 15,
      now: Date.now,
    }));

    await expectError(await handler(request()), 503, 'RECOVERY_REVIEW_UNAVAILABLE');
    pending.resolve(liveProof());
    await new Promise(resolve => setTimeout(resolve, 10));
    assert.equal(proofCalls, 2);
    assert.deepEqual(rpcNames, ['moaon_consume_recovery_review']);
  });
});

test('abort in the admission transport microtask gap cannot dispatch the bound RPC', async () => {
  for (const delay of [2, 3]) {
    const controller = new AbortController();
    const events = [];
    const handler = createRecoveryReviewRequestHandler(dependencies({
      verifySession: async () => identity({expiresAt: new Date(Date.now() + 60_000).toISOString()}),
      verifyStepUp: async () => {
        let pending = Promise.resolve();
        for (let step = 0; step < delay; step += 1) pending = pending.then(() => {});
        pending.then(() => {
          events.push('abort');
          controller.abort();
        });
        return liveProof();
      },
      rpcClient: {async rpc() {
        events.push(`rpc-after-abort:${controller.signal.aborted}`);
        return {data: true, error: null};
      }},
      now: Date.now,
    }));
    await expectError(await handler(request(undefined, {signal: controller.signal})),
      503, 'RECOVERY_REVIEW_UNAVAILABLE');
    assert.deepEqual(events, ['abort']);
  }
});

test('abort in the resolver microtask gap cannot dispatch a new resolve RPC', async () => {
  for (const delay of [2, 3]) {
    const controller = new AbortController();
    const events = [];
    let identityCalls = 0;
    const handler = createRecoveryReviewRequestHandler(dependencies({
      verifySession: async () => {
        identityCalls += 1;
        if (identityCalls === 2) {
          let pending = Promise.resolve();
          for (let step = 0; step < delay; step += 1) pending = pending.then(() => {});
          pending.then(() => {
            events.push('abort');
            controller.abort();
          });
        }
        return identity({expiresAt: new Date(Date.now() + 60_000).toISOString()});
      },
      verifyStepUp: async () => liveProof(),
      rpcClient: {
        marker: 'bound-client',
        async rpc(name) {
          assert.equal(this.marker, 'bound-client');
          if (name === 'moaon_consume_recovery_review') {
            events.push(name);
            return {data: true, error: null};
          }
          events.push(`rpc-after-abort:${controller.signal.aborted}`);
          return {data: {
            userId: USER,
            operationId: OPERATION,
            resolutionId: RESOLUTION,
            status: 'REJECTED',
          }, error: null};
        },
      },
      now: Date.now,
    }));
    const response = await handler(request({
      mode: 'resolve', userId: USER, operationId: OPERATION, resolutionId: RESOLUTION,
      expectedVersion: VERSION, action: 'CLOSE_NOT_STARTED',
    }, {signal: controller.signal}));

    await expectError(response, 503, 'RECOVERY_REVIEW_UNAVAILABLE');
    assert.deepEqual(events, ['moaon_consume_recovery_review', 'abort']);
  }
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
  for (const value of [Number.NaN, null, '', false, true, '1788870000000', new Number(NOW)]) {
    const handler = createRecoveryReviewRequestHandler(dependencies({
      now: () => value,
      verifySession: async () => {verified += 1; return identity();},
    }));
    await expectError(await handler(request()), 503, 'RECOVERY_REVIEW_UNAVAILABLE');
  }
  assert.equal(verified, 0);
});
