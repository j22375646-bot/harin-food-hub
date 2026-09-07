'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { PGlite } = require('@electric-sql/pglite');
const dashboardAuth = require('../lib/dashboard-auth.js');
const {
  createDashboardIdentityVerifier,
} = require('../lib/tenancy/dashboard-identity.js');
const { createTenantControlStore } = require('../lib/tenancy/control-store.js');

const NOW = Date.parse('2026-09-07T12:00:00.000Z');
const IDS = Object.freeze({
  session: '30000000-0000-4000-8000-000000000001',
  user: '20000000-0000-4000-8000-000000000001',
});

function session(overrides = {}) {
  return {
    id: IDS.session,
    userId: IDS.user,
    expiresAt: '2026-09-07T13:00:00.000Z',
    role: 'OWNER',
    ...overrides,
  };
}

function profile(overrides = {}) {
  return {
    user_id: IDS.user,
    email: ' Owner@Example.COM ',
    active: true,
    role: 'OWNER',
    ...overrides,
  };
}

function authUser(overrides = {}) {
  return {
    id: IDS.user,
    email: 'owner@example.com',
    email_confirmed_at: '2026-09-01T00:00:00.000Z',
    is_anonymous: false,
    ...overrides,
  };
}

function profileDb(readProfile = async () => ({ data: profile(), error: null })) {
  return {
    from(table) {
      assert.equal(table, 'dashboard_users');
      return {
        select(columns) {
          assert.equal(columns, 'user_id,email,active');
          return this;
        },
        eq(column, value) {
          assert.equal(column, 'user_id');
          assert.equal(value, IDS.user);
          return this;
        },
        maybeSingle: readProfile,
      };
    },
  };
}

function verifier(overrides = {}) {
  const values = overrides.sessionValues || [session(), session()];
  const db = overrides.db || profileDb();
  let validation = 0;
  return createDashboardIdentityVerifier({
    db,
    authAdmin: overrides.authAdmin || {
      async getUserById(userId) {
        assert.equal(userId, IDS.user);
        return { data: { user: authUser() }, error: null };
      },
    },
    validateSession: overrides.validateSession || (async (credential, options) => {
      assert.equal(credential, 'opaque-dashboard-session');
      assert.equal(options.db, db);
      assert.equal(options.touch, false);
      return values[Math.min(validation++, values.length - 1)];
    }),
    now: overrides.now || (() => NOW),
    timeoutMs: overrides.timeoutMs,
  });
}

async function expectIdentityError(run, code, status) {
  await assert.rejects(run, error => {
    assert.equal(error.code, code);
    assert.equal(error.status, status);
    assert.match(error.message, code === 'AUTH_REQUIRED'
      ? /^Authentication is required\.$/
      : /^Identity verification is unavailable\.$/);
    assert.doesNotMatch(JSON.stringify(error), /opaque|example\.com|provider-secret|token_hash|select /i);
    return true;
  });
}

test('활성 기존 로그인과 Auth의 확인 이메일을 정규화한 고정 identity로 반환한다', async () => {
  const verifySession = verifier();

  const identity = await verifySession('opaque-dashboard-session');

  assert.deepEqual(identity, {
    id: IDS.session,
    userId: IDS.user,
    email: 'owner@example.com',
    emailVerified: true,
    expiresAt: '2026-09-07T13:00:00.000Z',
  });
  assert.equal(Object.isFrozen(identity), true);
  assert.deepEqual(Object.keys(identity), ['id', 'userId', 'email', 'emailVerified', 'expiresAt']);
});

test('이메일 미확인 계정은 profile·metadata 플래그와 phone confirmed_at을 신뢰하지 않는다', async () => {
  const verifySession = verifier({
    db: profileDb(async () => ({
      data: profile({ email_verified: true }),
      error: null,
    })),
    authAdmin: {
      async getUserById() {
        return { data: { user: authUser({
          email_confirmed_at: null,
          confirmed_at: '2026-09-01T00:00:00.000Z',
          user_metadata: { email_verified: true },
          app_metadata: { email_verified: true },
        }) }, error: null };
      },
    },
  });

  const identity = await verifySession('opaque-dashboard-session');

  assert.equal(identity.emailVerified, false);
  assert.equal(identity.email, 'owner@example.com');
});

test('누락·비문자열·공백·4096자를 넘는 credential은 dependency 호출 없이 거부한다', async () => {
  let calls = 0;
  const verifySession = createDashboardIdentityVerifier({
    db: profileDb(),
    authAdmin: { async getUserById() { calls += 1; } },
    validateSession: async () => { calls += 1; },
    now: () => NOW,
  });

  for (const credential of [undefined, null, 123, '', ' ', 'x'.repeat(4097)]) {
    await expectIdentityError(() => verifySession(credential), 'AUTH_REQUIRED', 401);
  }
  assert.equal(calls, 0);
});

test('세션의 UUID·만료·재검증 identity가 틀리면 unauthenticated로 닫는다', async t => {
  const cases = [
    ['revoked', [null]],
    ['invalid session id', [session({ id: 'not-a-uuid' })]],
    ['invalid user id', [session({ userId: 'not-a-uuid' })]],
    ['malformed expiry', [session({ expiresAt: 'not-a-date' })]],
    ['impossible calendar expiry', [session({ expiresAt: '2027-02-29T13:00:00.000Z' })]],
    ['expired', [session({ expiresAt: '2026-09-07T12:00:00.000Z' })]],
    ['changed session', [session(), session({ id: '30000000-0000-4000-8000-000000000002' })]],
    ['changed user', [session(), session({ userId: '20000000-0000-4000-8000-000000000002' })]],
    ['revoked after auth read', [session(), null]],
  ];

  for (const [name, sessionValues] of cases) {
    await t.test(name, async () => {
      const verifySession = verifier({ sessionValues });
      await expectIdentityError(
        () => verifySession('opaque-dashboard-session'),
        'AUTH_REQUIRED',
        401
      );
    });
  }
});

test('profile은 같은 UUID의 active 행과 사용 가능한 이메일이어야 한다', async t => {
  const cases = [
    ['missing', null],
    ['disabled', profile({ active: false })],
    ['wrong user', profile({ user_id: '20000000-0000-4000-8000-000000000002' })],
    ['invalid email', profile({ email: 'not-an-email' })],
  ];

  for (const [name, record] of cases) {
    await t.test(name, async () => {
      const verifySession = verifier({
        db: profileDb(async () => ({ data: record, error: null })),
      });
      await expectIdentityError(
        () => verifySession('opaque-dashboard-session'),
        'AUTH_REQUIRED',
        401
      );
    });
  }
});

test('Auth identity는 같은 사용자·비익명·비삭제·비차단 계정이어야 한다', async t => {
  const cases = [
    ['missing', null],
    ['wrong user', authUser({ id: '20000000-0000-4000-8000-000000000002' })],
    ['anonymous', authUser({ is_anonymous: true })],
    ['malformed anonymous flag', authUser({ is_anonymous: 'false' })],
    ['deleted', authUser({ deleted_at: '2026-09-01T00:00:00.000Z' })],
    ['currently banned', authUser({ banned_until: '2026-09-07T12:01:00.000Z' })],
    ['malformed ban', authUser({ banned_until: 'provider-secret-invalid-time' })],
    ['non-ISO ban', authUser({ banned_until: '0' })],
    ['impossible calendar ban', authUser({ banned_until: '2026-04-31T00:00:00.000Z' })],
    ['mismatched email', authUser({ email: 'other@example.com' })],
    ['malformed confirmation', authUser({ email_confirmed_at: 'provider-secret-invalid-time' })],
    ['non-ISO confirmation', authUser({ email_confirmed_at: '0' })],
    ['impossible calendar confirmation', authUser({ email_confirmed_at: '2026-02-31T00:00:00.000Z' })],
    ['future confirmation', authUser({ email_confirmed_at: '2026-09-07T12:01:00.000Z' })],
  ];

  for (const [name, user] of cases) {
    await t.test(name, async () => {
      const verifySession = verifier({
        authAdmin: {
          async getUserById() {
            return { data: { user }, error: null };
          },
        },
      });
      await expectIdentityError(
        () => verifySession('opaque-dashboard-session'),
        'AUTH_REQUIRED',
        401
      );
    });
  }
});

test('만료된 ban은 허용하고 두 DB 검증 중 이른 만료를 반환한다', async () => {
  const verifySession = verifier({
    sessionValues: [
      session({ expiresAt: '2026-09-07T13:00:00.000Z' }),
      session({ expiresAt: '2026-09-07T12:30:00.000Z' }),
    ],
    authAdmin: {
      async getUserById() {
        return { data: { user: authUser({ banned_until: '2026-09-07T11:59:59.000Z' }) }, error: null };
      },
    },
  });

  assert.equal(
    (await verifySession('opaque-dashboard-session')).expiresAt,
    '2026-09-07T12:30:00.000Z'
  );
});

test('유효한 윤년 날짜와 UTC offset timestamp는 모든 identity 날짜 경계에서 허용한다', async () => {
  const verifySession = verifier({
    sessionValues: [
      session({ expiresAt: '2028-02-29T23:30:00+09:00' }),
      session({ expiresAt: '2028-02-29T23:30:00+09:00' }),
    ],
    authAdmin: {
      async getUserById() {
        return { data: { user: authUser({
          banned_until: '2024-02-29T23:30:00-04:00',
          email_confirmed_at: '2024-02-29T23:30:00+09:00',
        }) }, error: null };
      },
    },
  });

  const identity = await verifySession('opaque-dashboard-session');

  assert.equal(identity.emailVerified, true);
  assert.equal(identity.expiresAt, '2028-02-29T14:30:00.000Z');
});

test('외부 조회 중 먼저 검증한 세션이 만료되면 identity를 반환하지 않는다', async () => {
  const times = [NOW, NOW + 30 * 60 * 1000, NOW + 60 * 60 * 1000];
  const verifySession = verifier({
    sessionValues: [
      session({ expiresAt: '2026-09-07T12:45:00.000Z' }),
      session({ expiresAt: '2026-09-07T13:00:00.000Z' }),
    ],
    now: () => times.shift() ?? NOW + 60 * 60 * 1000,
  });

  await expectIdentityError(
    () => verifySession('opaque-dashboard-session'),
    'AUTH_REQUIRED',
    401
  );
});

test('DB/Auth 장애와 전체 작업 timeout은 provider 상세 없이 unavailable로 구분한다', async t => {
  await t.test('profile error', async () => {
    const verifySession = verifier({
      db: profileDb(async () => ({ data: null, error: new Error('provider-secret profile') })),
    });
    await expectIdentityError(
      () => verifySession('opaque-dashboard-session'),
      'IDENTITY_UNAVAILABLE',
      503
    );
  });

  await t.test('auth error result', async () => {
    const verifySession = verifier({
      authAdmin: {
        async getUserById() {
          return { data: { user: null }, error: new Error('provider-secret auth') };
        },
      },
    });
    await expectIdentityError(
      () => verifySession('opaque-dashboard-session'),
      'IDENTITY_UNAVAILABLE',
      503
    );
  });

  await t.test('validator throws', async () => {
    const verifySession = verifier({
      validateSession: async () => { throw new Error('opaque-dashboard-session provider-secret'); },
    });
    await expectIdentityError(
      () => verifySession('opaque-dashboard-session'),
      'IDENTITY_UNAVAILABLE',
      503
    );
  });

  await t.test('timeout', async () => {
    const verifySession = verifier({
      authAdmin: { getUserById: () => new Promise(() => {}) },
      timeoutMs: 10,
    });
    await expectIdentityError(
      () => verifySession('opaque-dashboard-session'),
      'IDENTITY_UNAVAILABLE',
      503
    );
  });

  await t.test('clock failure', async () => {
    const verifySession = verifier({ now: () => Number.NaN });
    await expectIdentityError(
      () => verifySession('opaque-dashboard-session'),
      'IDENTITY_UNAVAILABLE',
      503
    );
  });
});

test('factory는 명시적인 server dependency와 유한 양수 timeout/clock만 받는다', () => {
  const valid = {
    db: profileDb(),
    authAdmin: { async getUserById() {} },
  };
  for (const dependencies of [
    {},
    { db: valid.db },
    { authAdmin: valid.authAdmin },
    { ...valid, timeoutMs: 0 },
    { ...valid, timeoutMs: Number.POSITIVE_INFINITY },
    { ...valid, now: 123 },
    { ...valid, validateSession: null },
  ]) {
    assert.throws(
      () => createDashboardIdentityVerifier(dependencies),
      error => error instanceof TypeError
        && error.message === 'Trusted server identity dependencies are required.'
    );
  }
});

test('browser invocation은 server dependency를 호출하지 않고 거부한다', async () => {
  const previous = globalThis.window;
  let calls = 0;
  const verifySession = createDashboardIdentityVerifier({
    db: profileDb(),
    authAdmin: { async getUserById() { calls += 1; } },
    validateSession: async () => { calls += 1; },
    now: () => NOW,
  });
  try {
    globalThis.window = {};
    await expectIdentityError(
      () => verifySession('opaque-dashboard-session'),
      'IDENTITY_UNAVAILABLE',
      503
    );
    assert.equal(calls, 0);
  } finally {
    if (previous === undefined) delete globalThis.window;
    else globalThis.window = previous;
  }
});

test('await 사이에 반환 record가 변경돼도 검증 중 identity를 바꿀 수 없다', async () => {
  const first = session();
  const second = session();
  const profileRecord = profile();
  const userRecord = authUser();
  let validation = 0;
  const db = profileDb(async () => {
    first.userId = '20000000-0000-4000-8000-000000000099';
    first.expiresAt = '2026-09-07T11:00:00.000Z';
    return { data: profileRecord, error: null };
  });
  const verifySession = createDashboardIdentityVerifier({
    db,
    authAdmin: {
      async getUserById() {
        profileRecord.user_id = '20000000-0000-4000-8000-000000000098';
        profileRecord.email = 'mutated@example.com';
        return { data: { user: userRecord }, error: null };
      },
    },
    validateSession: async () => {
      if (validation++ === 0) return first;
      userRecord.id = '20000000-0000-4000-8000-000000000097';
      userRecord.email = 'mutated@example.com';
      userRecord.email_confirmed_at = null;
      return second;
    },
    now: () => NOW,
  });

  assert.deepEqual(await verifySession('opaque-dashboard-session'), {
    id: IDS.session,
    userId: IDS.user,
    email: 'owner@example.com',
    emailVerified: true,
    expiresAt: '2026-09-07T13:00:00.000Z',
  });
});

test('호출 간 cache가 없어 다음 요청은 세션 폐기와 profile 비활성을 각각 본다', async () => {
  let revoked = false;
  let active = true;
  const db = profileDb(async () => ({ data: profile({ active }), error: null }));
  const verifySession = createDashboardIdentityVerifier({
    db,
    authAdmin: {
      async getUserById() {
        return { data: { user: authUser() }, error: null };
      },
    },
    validateSession: async () => revoked ? null : session(),
    now: () => NOW,
  });

  await verifySession('opaque-dashboard-session');
  revoked = true;
  await expectIdentityError(
    () => verifySession('opaque-dashboard-session'),
    'AUTH_REQUIRED',
    401
  );
  revoked = false;
  active = false;
  await expectIdentityError(
    () => verifySession('opaque-dashboard-session'),
    'AUTH_REQUIRED',
    401
  );
});

test('실제 signed-token validator는 제어된 DB 경계에서 정상 토큰만 받고 위조를 거부한다', async () => {
  const previousSecret = process.env.DASHBOARD_SESSION_SECRET;
  const previousEnvironment = process.env.NODE_ENV;
  const previousBypass = process.env.HARIN_DEV_AUTH_BYPASS;
  process.env.DASHBOARD_SESSION_SECRET = 'task-one-test-only-secret-with-enough-entropy';
  process.env.NODE_ENV = 'test';
  delete process.env.HARIN_DEV_AUTH_BYPASS;
  try {
    const token = dashboardAuth.createSessionToken({
      sessionId: IDS.session,
      userId: IDS.user,
      username: 'owner',
      displayName: '운영 OWNER',
      role: 'OWNER',
      expiresAt: '2099-01-01T00:00:00.000Z',
    });
    const db = {
      from(table) {
        const filters = {};
        return {
          select() { return this; },
          eq(column, value) { filters[column] = value; return this; },
          async maybeSingle() {
            if (table === 'dashboard_sessions') {
              const matches = filters.id === IDS.session
                && filters.token_hash === dashboardAuth.tokenHash(token);
              return { data: matches ? {
                id: IDS.session,
                user_id: IDS.user,
                username: 'owner',
                display_name: '운영 OWNER',
                role: 'OWNER',
                expires_at: '2099-01-01T00:00:00.000Z',
                revoked_at: null,
                last_seen_at: '2026-09-07T00:00:00.000Z',
                token_hash: dashboardAuth.tokenHash(token),
              } : null, error: null };
            }
            assert.equal(table, 'dashboard_users');
            assert.equal(filters.user_id, IDS.user);
            return { data: profile(), error: null };
          },
        };
      },
    };
    const verifySession = createDashboardIdentityVerifier({
      db,
      authAdmin: {
        async getUserById() {
          return { data: { user: authUser() }, error: null };
        },
      },
    });

    assert.equal((await verifySession(token)).userId, IDS.user);
    const tampered = `${token.slice(0, -1)}${token.endsWith('a') ? 'b' : 'a'}`;
    await expectIdentityError(() => verifySession(tampered), 'AUTH_REQUIRED', 401);
  } finally {
    if (previousSecret === undefined) delete process.env.DASHBOARD_SESSION_SECRET;
    else process.env.DASHBOARD_SESSION_SECRET = previousSecret;
    if (previousEnvironment === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousEnvironment;
    if (previousBypass === undefined) delete process.env.HARIN_DEV_AUTH_BYPASS;
    else process.env.HARIN_DEV_AUTH_BYPASS = previousBypass;
  }
});

test('adapter의 미확인 이메일은 control-store 초대 수락에서 membership을 만들지 못한다', async () => {
  const database = new PGlite();
  try {
    const schema = await fs.readFile(
      path.join(__dirname, '..', 'lib', 'tenancy', 'sql', 'control-plane.sql'),
      'utf8'
    );
    await database.exec(schema);
    const verifySession = verifier({
      sessionValues: [
        session({ expiresAt: '2099-01-01T00:00:00.000Z' }),
        session({ expiresAt: '2099-01-01T00:00:00.000Z' }),
      ],
      authAdmin: {
        async getUserById() {
          return { data: { user: authUser({ email_confirmed_at: null }) }, error: null };
        },
      },
    });
    const store = createTenantControlStore({ database, verifySession });

    await assert.rejects(
      () => store.acceptInvitation({
        sessionCredential: 'opaque-dashboard-session',
        token: 'A'.repeat(43),
      }),
      error => error.code === 'EMAIL_VERIFICATION_REQUIRED' && error.status === 403
    );
    const membershipCount = await database.query(
      'select count(*)::integer as count from moaon_control.memberships',
      []
    );
    assert.equal(membershipCount.rows[0].count, 0);
  } finally {
    await database.close();
  }
});

function controlDatabaseProbe() {
  const calls = [];
  let transactions = 0;
  return {
    calls,
    get transactions() { return transactions; },
    async query(sql) {
      calls.push(String(sql));
      if (/clock_timestamp/i.test(sql)) {
        return { rows: [{ database_now: new Date(NOW).toISOString() }] };
      }
      return { rows: [] };
    },
    async transaction(callback) {
      transactions += 1;
      return callback(this);
    },
  };
}

async function expectComposedStoreFailure({ verifySession, code, status }) {
  const database = controlDatabaseProbe();
  const store = createTenantControlStore({ database, verifySession });
  await assert.rejects(
    () => store.findMembership({
      sessionCredential: 'opaque-dashboard-session',
      tenantId: '10000000-0000-4000-8000-000000000001',
    }),
    error => {
      assert.equal(error.code, code);
      assert.equal(error.status, status);
      assert.doesNotMatch(error.message, /provider|secret|timeout|select|dashboard/i);
      return true;
    }
  );
  assert.equal(database.transactions, 0);
  assert.equal(database.calls.length, 1);
  assert.match(database.calls[0], /clock_timestamp/i);
}

test('composed identity dependency 실패는 membership SQL 없이 안전한 503을 보존한다', async () => {
  const verifySession = verifier({
    db: profileDb(async () => ({
      data: null,
      error: new Error('provider-secret profile failure'),
    })),
  });
  await expectComposedStoreFailure({
    verifySession,
    code: 'IDENTITY_UNAVAILABLE',
    status: 503,
  });
});

test('composed identity timeout은 membership SQL 없이 안전한 503을 보존한다', async () => {
  const verifySession = verifier({
    timeoutMs: 20,
    authAdmin: {
      async getUserById() {
        return new Promise(() => {});
      },
    },
  });
  await expectComposedStoreFailure({
    verifySession,
    code: 'IDENTITY_UNAVAILABLE',
    status: 503,
  });
});

test('composed identity 인증 거부와 duck-typed provider 오류는 계속 안전한 401이다', async () => {
  await expectComposedStoreFailure({
    verifySession: verifier({ sessionValues: [null] }),
    code: 'AUTH_REQUIRED',
    status: 401,
  });
  await expectComposedStoreFailure({
    verifySession: async () => {
      throw Object.assign(new Error('provider-secret'), {
        code: 'IDENTITY_UNAVAILABLE',
        status: 503,
      });
    },
    code: 'AUTH_REQUIRED',
    status: 401,
  });
});
