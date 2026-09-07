'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const {PGlite} = require('@electric-sql/pglite');
const auth = require('../lib/dashboard-auth.js');
const {
  createAccountLoginLimit,
} = require('../lib/tenancy/account-login-limit.js');

const KEY = 'test-only-account-login-hmac-key-32-bytes';
const USER_A = '20000000-0000-4000-8000-000000000001';
const USER_B = '20000000-0000-4000-8000-000000000002';
const FIXED_ACCOUNT_HASH = '16ff267444c3aa330d7106a7e130cb416d2b93321c72933ac03f60caa8f1d38b';
const PROFILE_A = {
  user_id: USER_A,
  email: 'quota-owner@example.test',
  username: 'quota-owner',
  display_name: 'Quota Owner',
  role: 'OWNER',
  active: true,
};
const PROFILE_B = {
  user_id: USER_B,
  email: 'other-owner@example.test',
  username: 'other-owner',
  display_name: 'Other Owner',
  role: 'VIEWER',
  active: true,
};
const CONFIRMED_AT = '2026-09-07T00:00:00.000Z';
const SQL_FILE = path.join(__dirname, '../lib/tenancy/sql/auth-request-limit.sql');

function withSecret(run) {
  const previous = process.env.DASHBOARD_SESSION_SECRET;
  process.env.DASHBOARD_SESSION_SECRET = 'test-only-dashboard-session-secret-32-bytes';
  return Promise.resolve().then(run).finally(() => {
    if (previous === undefined) delete process.env.DASHBOARD_SESSION_SECRET;
    else process.env.DASHBOARD_SESSION_SECRET = previous;
  });
}

function sessionWindow(now = Date.now()) {
  return {
    issuedAt: new Date(now).toISOString(),
    expiresAt: new Date(now + 12 * 60 * 60 * 1000).toISOString(),
  };
}

function dashboardDatabase(profiles = [PROFILE_A], {returnFirstProfile = false} = {}) {
  const currentProfiles = Array.isArray(profiles) ? profiles : [profiles];
  const state = {
    profileReads: 0,
    attemptReads: 0,
    attemptDeletes: 0,
    failures: 0,
    directSessionWrites: 0,
  };
  const db = {from(table) {
    if (table === 'dashboard_users') {
      let filter;
      return {
        select() { return this; },
        eq(column, value) { filter = {column, value}; return this; },
        async maybeSingle() {
          state.profileReads++;
          let profile = null;
          if (returnFirstProfile) profile = currentProfiles[0] || null;
          else if (filter) {
            profile = currentProfiles.find(candidate => {
              if (!candidate) return false;
              const actual = candidate[filter.column];
              if (filter.column === 'user_id') {
                return typeof actual === 'string'
                  && actual.toLowerCase() === String(filter.value).toLowerCase();
              }
              return typeof actual === 'string'
                && actual.trim().toLowerCase() === String(filter.value).trim().toLowerCase();
            }) || null;
          }
          return {data: profile ? {...profile} : null, error: null};
        },
      };
    }
    if (table === 'dashboard_login_attempts') {
      let action = 'select';
      return {
        select() { action = 'select'; return this; },
        delete() { action = 'delete'; return this; },
        eq() { return this; },
        async maybeSingle() {
          state.attemptReads++;
          return {data: null, error: null};
        },
        async upsert() {
          state.failures++;
          return {error: null};
        },
        then(resolve, reject) {
          if (action === 'delete') state.attemptDeletes++;
          return Promise.resolve({error: null}).then(resolve, reject);
        },
      };
    }
    if (table === 'dashboard_sessions') {
      return {
        insert() {
          state.directSessionWrites++;
          throw new Error('fenced login must not insert a session directly');
        },
        update() {
          state.directSessionWrites++;
          throw new Error('fenced login must not update sessions directly');
        },
      };
    }
    throw new Error(`unexpected table ${table}`);
  }};
  return {db, state, profiles: currentProfiles};
}

function trackedDependencies(profile, events = []) {
  const counts = {provider: 0, begin: 0, window: 0, issue: 0};
  return {
    counts,
    authClient: {auth: {async signInWithPassword(credentials) {
      counts.provider++;
      events.push('provider');
      assert.equal(credentials.email, profile.email);
      return {data: {user: {
        id: profile.user_id,
        email: profile.email,
        email_confirmed_at: CONFIRMED_AT,
        is_anonymous: false,
        deleted_at: null,
        banned_until: null,
      }, session: {}}, error: null};
    }}},
    sessionFence: {
      async beginLogin() { counts.begin++; events.push('begin'); return true; },
      async getSessionWindow() { counts.window++; events.push('window'); return sessionWindow(); },
      async issueSession() { counts.issue++; events.push('issue'); return true; },
    },
  };
}

function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return {promise, resolve};
}

test('account adapter uses one fixed ACCOUNT-scoped HMAC for lowercase and uppercase UUID input', async () => {
  const calls = [];
  const accountLimit = createAccountLoginLimit({
    hmacKey: KEY,
    rpcClient: {async rpc(name, args) {
      calls.push({name, args});
      return {data: true, error: null};
    }},
  });

  for (const userId of [USER_A, USER_A.toUpperCase()]) {
    const answer = await accountLimit({userId});
    assert.deepEqual(answer, {allowed: true});
    assert.equal(Object.isFrozen(answer), true);
  }

  assert.deepEqual(calls, [
    {name: 'moaon_consume_auth_request', args: {p_kind: 'LOGIN', p_subject_hash: FIXED_ACCOUNT_HASH}},
    {name: 'moaon_consume_auth_request', args: {p_kind: 'LOGIN', p_subject_hash: FIXED_ACCOUNT_HASH}},
  ]);
  assert.equal(JSON.stringify(calls).includes(USER_A), false);
  assert.equal(JSON.stringify(calls).includes(KEY), false);
});

test('account adapter rejects non-v1-through-v5 canonical UUIDs before RPC access', async () => {
  let calls = 0;
  const rpcClient = {rpc: async () => {
    calls++;
    return {data: true, error: null};
  }};
  const accountLimit = createAccountLoginLimit({rpcClient, hmacKey: KEY});

  for (const userId of [
    undefined,
    null,
    {},
    '',
    ` ${USER_A}`,
    '20000000-0000-0000-8000-000000000001',
    '20000000-0000-6000-8000-000000000001',
    '20000000-0000-4000-7000-000000000001',
    'not-a-uuid',
  ]) {
    await assert.rejects(() => accountLimit({userId}), TypeError);
  }
  await assert.rejects(() => accountLimit(), TypeError);
  await assert.rejects(() => accountLimit(null), TypeError);
  assert.equal(calls, 0);

  for (const version of ['1', '2', '3', '4', '5']) {
    await accountLimit({userId: `20000000-0000-${version}000-8000-000000000001`});
  }
  assert.equal(calls, 5);
});

test('account adapter reuses bounded request-limit configuration and frozen denial contract', async () => {
  const rpcClient = {rpc: async () => ({data: false, error: null})};
  for (const options of [
    {rpcClient, hmacKey: 'short'},
    {rpcClient: {}, hmacKey: KEY},
    {rpcClient, hmacKey: KEY, timeoutMs: 0},
    {rpcClient, hmacKey: KEY, timeoutMs: 30001},
  ]) {
    assert.throws(() => createAccountLoginLimit(options), TypeError);
  }
  const answer = await createAccountLoginLimit({rpcClient, hmacKey: KEY})({userId: USER_A});
  assert.deepEqual(answer, {allowed: false});
  assert.equal(Object.isFrozen(answer), true);
});

test('account quota configuration is validated before input, database, and provider work', async () => {
  const events = [];
  const db = {from(table) { events.push(`db:${table}`); throw new Error('must not run'); }};
  const authClient = {auth: {signInWithPassword: async () => {
    events.push('provider');
    return {data: null, error: null};
  }}};

  for (const options of [
    {accountLimit: async () => ({allowed: true}), authClient},
    {accountLimit: null, requestLimit: async () => ({allowed: true}), authClient},
    {accountLimit: {}, requestLimit: async () => ({allowed: true}), authClient},
  ]) {
    await assert.rejects(
      () => auth.authenticateAccount({account: 'quota-owner', password: '123456'}, db, options),
      TypeError
    );
  }
  assert.deepEqual(events, []);
});

test('prior request limiter denial prevents profile lookup and canonical quota consumption', async () => {
  const downstream = [];
  await assert.rejects(
    () => auth.authenticateAccount(
      {account: PROFILE_A.username, password: '123456'},
      {from(table) { downstream.push(`db:${table}`); throw new Error('must not run'); }},
      {
        requestLimit: async () => ({allowed: false}),
        accountLimit: async () => { downstream.push('account-limit'); return {allowed: true}; },
        authClient: {auth: {signInWithPassword: async () => {
          downstream.push('provider');
          return {data: null, error: null};
        }}},
      }
    ),
    error => error.code === 'LOGIN_RATE_LIMITED' && error.status === 429
  );
  assert.deepEqual(downstream, []);
});

test('canonical denial, malformed response, or rejection stops provider, fence, and session work', () => withSecret(async () => {
  const inheritedAllowed = Object.assign(Object.create({allowed: true}), {extra: false});
  const symbolExtra = {allowed: true, [Symbol('extra')]: false};
  const cases = [
    [async () => ({allowed: false}), 'LOGIN_RATE_LIMITED', 429],
    [async () => ({allowed: true, extra: false}), 'LOGIN_AUTH_UNAVAILABLE', 503],
    [async () => [{allowed: true}], 'LOGIN_AUTH_UNAVAILABLE', 503],
    [async () => inheritedAllowed, 'LOGIN_AUTH_UNAVAILABLE', 503],
    [async () => symbolExtra, 'LOGIN_AUTH_UNAVAILABLE', 503],
    [async () => { throw new Error('secret canonical limiter detail'); }, 'LOGIN_AUTH_UNAVAILABLE', 503],
  ];
  for (const [accountLimit, code, status] of cases) {
    const store = dashboardDatabase();
    const dependencies = trackedDependencies(PROFILE_A);
    let canonicalCalls = 0;
    await assert.rejects(
      () => auth.authenticateAccount({account: PROFILE_A.username, password: '123456'}, store.db, {
        requestLimit: async () => ({allowed: true}),
        accountLimit: async value => { canonicalCalls++; assert.deepEqual(value, {userId: USER_A}); return accountLimit(); },
        authClient: dependencies.authClient,
        sessionFence: dependencies.sessionFence,
      }),
      error => error.code === code && error.status === status && !error.message.includes('secret')
    );
    assert.equal(canonicalCalls, 1);
    assert.equal(store.state.profileReads, 1);
    assert.deepEqual(dependencies.counts, {provider: 0, begin: 0, window: 0, issue: 0});
    assert.equal(store.state.directSessionWrites, 0);
  }
}));

test('canonical quota timeout ignores late success and never continues login', () => withSecret(async () => {
  const late = deferred();
  const store = dashboardDatabase();
  const dependencies = trackedDependencies(PROFILE_A);
  let canonicalCalls = 0;
  const pending = auth.authenticateAccount({account: PROFILE_A.username, password: '123456'}, store.db, {
    requestLimit: async () => ({allowed: true}),
    accountLimit: () => { canonicalCalls++; return late.promise; },
    authClient: dependencies.authClient,
    sessionFence: dependencies.sessionFence,
    fenceTimeoutMs: 10,
  });
  await assert.rejects(pending, error => error.code === 'LOGIN_AUTH_UNAVAILABLE' && error.status === 503);
  late.resolve({allowed: true});
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal(canonicalCalls, 1);
  assert.deepEqual(dependencies.counts, {provider: 0, begin: 0, window: 0, issue: 0});
  assert.equal(store.state.directSessionWrites, 0);
}));

test('malformed or mismatched active profiles fail closed before canonical or external work', () => withSecret(async () => {
  const cases = [
    [{...PROFILE_A, user_id: '20000000-0000-6000-8000-000000000001'}, PROFILE_A.username],
    [{...PROFILE_A, email: 'not-an-email'}, PROFILE_A.username],
    [{...PROFILE_A, username: 'wrong-owner'}, PROFILE_A.username],
    [{...PROFILE_A, email: 'wrong@example.test'}, PROFILE_A.email],
    [{...PROFILE_A, active: 'true'}, PROFILE_A.username],
  ];
  for (const [profile, account] of cases) {
    const store = dashboardDatabase([profile], {returnFirstProfile: true});
    const dependencies = trackedDependencies(PROFILE_A);
    let canonicalCalls = 0;
    await assert.rejects(
      () => auth.authenticateAccount({account, password: '123456'}, store.db, {
        requestLimit: async () => ({allowed: true}),
        accountLimit: async () => { canonicalCalls++; return {allowed: true}; },
        authClient: dependencies.authClient,
        sessionFence: dependencies.sessionFence,
      }),
      error => error.code === 'LOGIN_AUTH_UNAVAILABLE' && error.status === 503
    );
    assert.equal(canonicalCalls, 0);
    assert.deepEqual(dependencies.counts, {provider: 0, begin: 0, window: 0, issue: 0});
    assert.equal(store.state.directSessionWrites, 0);
  }
}));

test('unknown and inactive profiles keep dummy authentication without canonical quota', () => withSecret(async () => {
  for (const profile of [null, {...PROFILE_A, active: false}]) {
    const store = dashboardDatabase(profile ? [profile] : []);
    let canonicalCalls = 0;
    let providerCalls = 0;
    let beginCalls = 0;
    await assert.rejects(
      () => auth.authenticateAccount({account: PROFILE_A.username, password: '123456'}, store.db, {
        requestLimit: async () => ({allowed: true}),
        accountLimit: async () => { canonicalCalls++; return {allowed: true}; },
        authClient: {auth: {async signInWithPassword(credentials) {
          providerCalls++;
          assert.match(credentials.email, /^invalid-[0-9a-f]{20}@invalid\.local$/);
          return {data: {user: null, session: null}, error: {
            code: 'invalid_credentials', status: 400, message: 'Invalid login credentials',
          }};
        }}},
        sessionFence: {
          async beginLogin() { beginCalls++; return true; },
          async getSessionWindow() { throw new Error('must not run'); },
          async issueSession() { throw new Error('must not run'); },
        },
      }),
      error => error.code === 'INVALID_CREDENTIALS' && error.status === 401
    );
    assert.equal(canonicalCalls, 0);
    assert.equal(providerCalls, 1);
    assert.equal(beginCalls, 0);
    assert.equal(store.state.failures, 1);
    assert.equal(store.state.directSessionWrites, 0);
  }
}));

test('omitting account quota preserves the legacy active-profile behavior', () => withSecret(async () => {
  const legacyProfile = {...PROFILE_A, active: 'legacy-truthy'};
  const store = dashboardDatabase([legacyProfile]);
  const dependencies = trackedDependencies(legacyProfile);
  const result = await auth.authenticateAccount({account: PROFILE_A.username, password: '123456'}, store.db, {
    authClient: dependencies.authClient,
    sessionFence: dependencies.sessionFence,
  });
  assert.equal(auth.parseSession(result.token).userId, USER_A);
  assert.deepEqual(dependencies.counts, {provider: 1, begin: 1, window: 1, issue: 1});
  assert.equal(store.state.directSessionWrites, 0);
}));

test('real SQL account quota follows trusted profile ID across aliases and rename without sharing users', () => withSecret(async () => {
  const quotaDb = new PGlite();
  try {
    await quotaDb.exec('create role anon; create role authenticated; create role service_role bypassrls;');
    await quotaDb.exec(await fs.readFile(SQL_FILE, 'utf8'));
    const rpcClient = {async rpc(name, args) {
      const values = Object.values(args);
      const result = await quotaDb.query(
        `select public.${name}(${values.map((_, index) => `$${index + 1}`).join(',')}) as data`,
        values
      );
      return {data: result.rows[0].data, error: null};
    }};
    const accountLimit = createAccountLoginLimit({rpcClient, hmacKey: KEY, timeoutMs: 1000});
    const accountProfile = {...PROFILE_A};
    const store = dashboardDatabase([accountProfile, PROFILE_B]);
    let priorCalls = 0;
    const requestLimit = async ({kind, subject}) => {
      priorCalls++;
      assert.equal(kind, 'LOGIN');
      assert.equal(subject, subject.toLowerCase());
      return {allowed: true};
    };

    for (let index = 0; index < 10; index++) {
      const profile = accountProfile;
      const dependencies = trackedDependencies(profile);
      const account = index % 2 === 0 ? profile.username : profile.email.toUpperCase();
      const result = await auth.authenticateAccount({
        account,
        password: '123456',
        userId: USER_B,
        accountLimit: async () => ({allowed: true}),
      }, store.db, {
        requestLimit,
        accountLimit,
        authClient: dependencies.authClient,
        sessionFence: dependencies.sessionFence,
      });
      assert.equal(auth.parseSession(result.token).userId, USER_A);
      assert.deepEqual(dependencies.counts, {provider: 1, begin: 1, window: 1, issue: 1});
    }

    accountProfile.username = 'quota-owner-renamed';
    const deniedDependencies = trackedDependencies(accountProfile);
    await assert.rejects(
      () => auth.authenticateAccount({account: accountProfile.username, password: '123456'}, store.db, {
        requestLimit,
        accountLimit,
        authClient: deniedDependencies.authClient,
        sessionFence: deniedDependencies.sessionFence,
      }),
      error => error.code === 'LOGIN_RATE_LIMITED' && error.status === 429
    );
    assert.deepEqual(deniedDependencies.counts, {provider: 0, begin: 0, window: 0, issue: 0});

    const otherDependencies = trackedDependencies(PROFILE_B);
    const other = await auth.authenticateAccount({account: PROFILE_B.username, password: '123456'}, store.db, {
      requestLimit,
      accountLimit,
      authClient: otherDependencies.authClient,
      sessionFence: otherDependencies.sessionFence,
    });
    assert.equal(auth.parseSession(other.token).userId, USER_B);
    assert.deepEqual(otherDependencies.counts, {provider: 1, begin: 1, window: 1, issue: 1});
    assert.equal(priorCalls, 12);

    const rows = (await quotaDb.query(
      'select subject_hash,used from moaon_auth.request_limits where kind=$1 order by used desc',
      ['LOGIN']
    )).rows;
    assert.deepEqual(rows, [
      {subject_hash: FIXED_ACCOUNT_HASH, used: 10},
      {subject_hash: 'a04f131ec61322dd05bec75f7568f4437019806e5c761929045df40d2c2690db', used: 1},
    ]);
  } finally {
    await quotaDb.close();
  }
}));
