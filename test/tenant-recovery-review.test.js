'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const {PGlite} = require('@electric-sql/pglite');
const {
  createRecoveryReviewStore,
  RecoveryReviewStoreError,
} = require('../lib/tenancy/recovery-review-store.js');
const {createAuthSessionStore} = require('../lib/tenancy/auth-session-store.js');
const {createAccountRecovery} = require('../lib/tenancy/account-recovery.js');

const USER = '20000000-0000-4000-8000-000000000001';
const OTHER = '20000000-0000-4000-8000-000000000002';
const OPERATION = '50000000-0000-4000-8000-000000000001';
const OTHER_OPERATION = '50000000-0000-4000-8000-000000000002';
const SQL = path.join(__dirname, '../lib/tenancy/sql/recovery-review.sql');
const FENCE_SQL = path.join(__dirname, '../lib/tenancy/sql/auth-session-fence.sql');
const ACCOUNTS_SQL = path.join(__dirname, '../supabase/migrations/20260812182508_add_dashboard_accounts_and_rbac.sql');

function deferred() {
  let resolve;
  const promise = new Promise(done => {resolve = done;});
  return {promise, resolve};
}

function rpcFor(db) {
  return {async rpc(name, args) {
    try {
      const values = Object.values(args);
      const parameters = values.map((_, index) => `$${index + 1}`).join(',');
      const result = await db.query(`select public.${name}(${parameters}) as data`, values);
      return {data: result.rows[0].data, error: null};
    } catch (error) {
      return {data: null, error: {code: error.code, message: error.message}};
    }
  }};
}

async function prepareDatabase(db) {
  await db.exec('create role anon; create role authenticated; create role service_role bypassrls; create schema auth; create table auth.users(id uuid primary key);');
  await db.exec(await fs.readFile(ACCOUNTS_SQL, 'utf8'));
  await db.exec(await fs.readFile(FENCE_SQL, 'utf8'));
  await db.exec(await fs.readFile(SQL, 'utf8'));
  await db.query('insert into auth.users values ($1),($2)', [USER, OTHER]);
  await db.query(
    `insert into public.dashboard_users(user_id,email,username,display_name,role)
     values ($1,'owner@example.test','owner','Owner','OWNER'),
            ($2,'other@example.test','other','Other','VIEWER')`,
    [USER, OTHER]
  );
}

async function seedAccountState(db, userId = USER) {
  await db.query('insert into moaon_auth.account_state(user_id) values ($1) on conflict do nothing', [userId]);
}

test('store sends only fixed RPC arguments and returns validated canonical unresolved rows', async () => {
  const calls = [];
  const rows = [{
    userId: USER,
    operationId: OPERATION,
    status: 'PENDING',
    stage: null,
    createdAt: '2026-09-08T01:02:03.004Z',
    updatedAt: '2026-09-08T01:02:03.004Z',
  }];
  const store = createRecoveryReviewStore({rpcClient: {marker: true, async rpc(name, args) {
    assert.equal(this.marker, true);
    calls.push({name, args});
    return {data: name === 'moaon_list_recovery_reviews' ? rows : true, error: null};
  }}});

  assert.equal(await store.start({userId: USER, operationId: OPERATION}), true);
  assert.equal(await store.markRequired({userId: USER, operationId: OPERATION, stage: 'PASSWORD_UPDATE'}), true);
  assert.equal(await store.complete({userId: USER, operationId: OPERATION}), true);
  assert.equal(await store.reject({userId: USER, operationId: OPERATION}), true);
  assert.deepEqual(await store.list(), rows);
  assert.deepEqual(calls, [
    {name: 'moaon_start_recovery_review', args: {p_user_id: USER, p_operation_id: OPERATION}},
    {name: 'moaon_require_recovery_review', args: {p_user_id: USER, p_operation_id: OPERATION, p_stage: 'PASSWORD_UPDATE'}},
    {name: 'moaon_complete_recovery_review', args: {p_user_id: USER, p_operation_id: OPERATION}},
    {name: 'moaon_reject_recovery_review', args: {p_user_id: USER, p_operation_id: OPERATION}},
    {name: 'moaon_list_recovery_reviews', args: {p_limit: 50}},
  ]);
});

test('store rejects client metadata, invalid stages and list filters before RPC access', async () => {
  let calls = 0;
  const rpcClient = {rpc: async () => {calls++; return {data: true, error: null};}};
  for (const options of [undefined, {}, {rpcClient: {}}, {rpcClient, timeoutMs: 0}, {rpcClient, timeoutMs: 30001}]) {
    assert.throws(() => createRecoveryReviewStore(options), TypeError);
  }
  const store = createRecoveryReviewStore({rpcClient});
  for (const args of [
    {}, {userId: USER}, {userId: 'not-uuid', operationId: OPERATION},
    {userId: [USER], operationId: OPERATION}, {userId: USER, operationId: [OPERATION]},
    {userId: USER, operationId: OPERATION, status: 'COMPLETED'},
  ]) await assert.rejects(() => store.start(args), TypeError);
  for (const stage of [undefined, null, 'password', 'FENCE_COMPLETE ', 'SECRET_STAGE']) {
    await assert.rejects(() => store.markRequired({userId: USER, operationId: OPERATION, stage}), TypeError);
  }
  for (const args of [{limit: 0}, {limit: 101}, {limit: 1.5}, {limit: 2, userId: USER}, {status: 'PENDING'}]) {
    await assert.rejects(() => store.list(args), TypeError);
  }
  assert.equal(calls, 0);
});

test('store fails closed on nonliteral mutations, malformed lists, provider errors and timeout without retry', async () => {
  for (const data of [false, 1, null, {}, [true]]) {
    const store = createRecoveryReviewStore({rpcClient: {rpc: async () => ({data, error: null})}});
    await assert.rejects(() => store.start({userId: USER, operationId: OPERATION}), error =>
      error instanceof RecoveryReviewStoreError && error.code === 'RECOVERY_REVIEW_UNAVAILABLE' && !error.cause);
  }
  const malformedRows = [
    null,
    {},
    [{userId: USER, operationId: OPERATION, status: 'COMPLETED', stage: null, createdAt: '2026-09-08T01:02:03.004Z', updatedAt: '2026-09-08T01:02:03.004Z'}],
    [{userId: USER, operationId: OPERATION, status: 'PENDING', stage: null, createdAt: '2026-09-08T01:02:03Z', updatedAt: '2026-09-08T01:02:03.004Z'}],
    [{userId: USER, operationId: OPERATION, status: 'PENDING', stage: null, createdAt: '2026-09-08T01:02:03.004Z', updatedAt: '2026-09-08T01:02:03.004Z', secret: 'leak'}],
    [{userId: [USER], operationId: OPERATION, status: 'PENDING', stage: null, createdAt: '2026-09-08T01:02:03.004Z', updatedAt: '2026-09-08T01:02:03.004Z'}],
    [
      {userId: USER, operationId: OPERATION, status: 'PENDING', stage: null, createdAt: '2026-09-08T01:02:04.004Z', updatedAt: '2026-09-08T01:02:04.004Z'},
      {userId: OTHER, operationId: OTHER_OPERATION, status: 'PENDING', stage: null, createdAt: '2026-09-08T01:02:03.004Z', updatedAt: '2026-09-08T01:02:03.004Z'},
    ],
  ];
  for (const data of malformedRows) {
    const store = createRecoveryReviewStore({rpcClient: {rpc: async () => ({data, error: null})}});
    await assert.rejects(() => store.list(), error => error.code === 'RECOVERY_REVIEW_UNAVAILABLE');
  }
  const tooMany = createRecoveryReviewStore({rpcClient: {rpc: async () => ({data: [
    {userId: USER, operationId: OPERATION, status: 'PENDING', stage: null, createdAt: '2026-09-08T01:02:03.004Z', updatedAt: '2026-09-08T01:02:03.004Z'},
    {userId: OTHER, operationId: OTHER_OPERATION, status: 'PENDING', stage: null, createdAt: '2026-09-08T01:02:04.004Z', updatedAt: '2026-09-08T01:02:04.004Z'},
  ], error: null})}});
  await assert.rejects(() => tooMany.list({limit: 1}), error => error.code === 'RECOVERY_REVIEW_UNAVAILABLE');
  const failed = createRecoveryReviewStore({rpcClient: {rpc: async () => {throw Error('provider password token secret');}}});
  await assert.rejects(() => failed.list(), error => !error.message.includes('secret') && !error.cause);

  const late = deferred();
  let calls = 0;
  const timed = createRecoveryReviewStore({rpcClient: {rpc: () => {calls++; return late.promise;}}, timeoutMs: 10});
  await assert.rejects(() => timed.start({userId: USER, operationId: OPERATION}), error => error.code === 'RECOVERY_REVIEW_UNAVAILABLE');
  late.resolve({data: true, error: null});
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal(calls, 1);
});

test('SQL start is write-ahead, exact-idempotent, active-profile-bound and globally operation-unique', async () => {
  const db = new PGlite();
  try {
    await prepareDatabase(db);
    const store = createRecoveryReviewStore({rpcClient: rpcFor(db)});
    assert.equal(await store.start({userId: USER, operationId: OPERATION}), true);
    const first = (await db.query('select * from moaon_auth.recovery_reviews')).rows[0];
    assert.equal(first.status, 'PENDING');
    assert.equal(first.stage, null);
    await new Promise(resolve => setTimeout(resolve, 5));
    assert.equal(await store.start({userId: USER, operationId: OPERATION}), true);
    const repeated = (await db.query('select * from moaon_auth.recovery_reviews')).rows[0];
    assert.equal(repeated.created_at.valueOf(), first.created_at.valueOf());
    assert.equal(repeated.updated_at.valueOf(), first.updated_at.valueOf());
    await assert.rejects(() => store.start({userId: OTHER, operationId: OPERATION}), error => error.code === 'RECOVERY_REVIEW_UNAVAILABLE');
    await db.query('update public.dashboard_users set active=false where user_id=$1', [OTHER]);
    await assert.rejects(() => store.start({userId: OTHER, operationId: OTHER_OPERATION}), error => error.code === 'RECOVERY_REVIEW_UNAVAILABLE');
    assert.equal((await db.query('select count(*)::int as count from moaon_auth.recovery_reviews')).rows[0].count, 1);
  } finally {await db.close();}
});

test('SQL review evidence is immutable and terminal states are monotonic without unlocking accounts', async () => {
  const db = new PGlite();
  try {
    await prepareDatabase(db);
    const store = createRecoveryReviewStore({rpcClient: rpcFor(db)});
    await seedAccountState(db);
    await store.start({userId: USER, operationId: OPERATION});
    await db.query('update moaon_auth.account_state set blocked=true,operation_id=$2 where user_id=$1', [USER, OPERATION]);
    const sessionId = '40000000-0000-4000-8000-000000000001';
    await db.query(
      `insert into public.dashboard_sessions(id,user_id,token_hash,username,display_name,role,expires_at)
       values ($1,$2,$3,'owner','Owner','OWNER',clock_timestamp()+interval '1 hour')`,
      [sessionId, USER, 'a'.repeat(64)]
    );
    await db.query('update public.dashboard_users set active=false where user_id=$1', [USER]);
    await db.query(`insert into moaon_auth.password_changes(user_id,id,status)
                    values ($1,$2,'PENDING')`, [USER, OPERATION]);
    assert.equal(await store.markRequired({userId: USER, operationId: OPERATION, stage: 'PASSWORD_UPDATE'}), true);
    const first = (await db.query('select * from moaon_auth.recovery_reviews')).rows[0];
    await new Promise(resolve => setTimeout(resolve, 5));
    assert.equal(await store.markRequired({userId: USER, operationId: OPERATION, stage: 'PASSWORD_UPDATE'}), true);
    const repeated = (await db.query('select * from moaon_auth.recovery_reviews')).rows[0];
    assert.equal(repeated.updated_at.valueOf(), first.updated_at.valueOf());
    await assert.rejects(() => store.markRequired({userId: USER, operationId: OPERATION, stage: 'PROVIDER_SIGNOUT'}), error => error.code === 'RECOVERY_REVIEW_UNAVAILABLE');
    assert.equal((await db.query('select blocked from moaon_auth.account_state where user_id=$1', [USER])).rows[0].blocked, true);

    await db.query(`update moaon_auth.password_changes set status='COMPLETED',completed_at=clock_timestamp()
                    where user_id=$1 and id=$2`, [USER, OPERATION]);
    const passwordBefore = JSON.stringify((await db.query('select * from moaon_auth.password_changes')).rows);
    const sessionBefore = JSON.stringify((await db.query('select * from public.dashboard_sessions')).rows);
    assert.equal(await store.complete({userId: USER, operationId: OPERATION}), true);
    assert.equal(await store.complete({userId: USER, operationId: OPERATION}), true);
    await assert.rejects(() => store.markRequired({userId: USER, operationId: OPERATION, stage: 'FENCE_COMPLETE'}), error => error.code === 'RECOVERY_REVIEW_UNAVAILABLE');
    await assert.rejects(() => store.reject({userId: USER, operationId: OPERATION}), error => error.code === 'RECOVERY_REVIEW_UNAVAILABLE');
    const state = (await db.query('select blocked,operation_id from moaon_auth.account_state where user_id=$1', [USER])).rows[0];
    assert.deepEqual(state, {blocked: true, operation_id: OPERATION});
    assert.equal(JSON.stringify((await db.query('select * from moaon_auth.password_changes')).rows), passwordBefore);
    assert.equal(JSON.stringify((await db.query('select * from public.dashboard_sessions')).rows), sessionBefore);
  } finally {await db.close();}
});

test('SQL rejects invalid stages explicitly and cross-user transitions cannot alter journal evidence', async () => {
  const db = new PGlite();
  try {
    await prepareDatabase(db);
    const store = createRecoveryReviewStore({rpcClient: rpcFor(db)});
    await store.start({userId: USER, operationId: OPERATION});
    for (const stage of [null, 'PASSWORD', 'PASSWORD_UPDATE ']) {
      await assert.rejects(
        () => db.query('select public.moaon_require_recovery_review($1,$2,$3)', [USER, OPERATION, stage]),
        /RECOVERY_REVIEW_REJECTED/
      );
    }
    await assert.rejects(() => db.query(
      'select public.moaon_require_recovery_review($1,$2,$3)',
      [OTHER, OPERATION, 'PASSWORD_UPDATE']
    ), /RECOVERY_REVIEW_REJECTED/);
    assert.deepEqual((await db.query('select status,stage from moaon_auth.recovery_reviews')).rows, [{status: 'PENDING', stage: null}]);
  } finally {await db.close();}
});

test('SQL complete requires authoritative completion and reject requires an existing state with no begun operation', async () => {
  const db = new PGlite();
  try {
    await prepareDatabase(db);
    const store = createRecoveryReviewStore({rpcClient: rpcFor(db)});
    await store.start({userId: USER, operationId: OPERATION});
    await assert.rejects(() => store.complete({userId: USER, operationId: OPERATION}), error => error.code === 'RECOVERY_REVIEW_UNAVAILABLE');
    await assert.rejects(() => store.reject({userId: USER, operationId: OPERATION}), error => error.code === 'RECOVERY_REVIEW_UNAVAILABLE');
    assert.equal((await db.query('select status from moaon_auth.recovery_reviews')).rows[0].status, 'PENDING');

    await seedAccountState(db);
    assert.equal(await store.reject({userId: USER, operationId: OPERATION}), true);
    assert.equal(await store.reject({userId: USER, operationId: OPERATION}), true);
    await assert.rejects(() => store.start({userId: USER, operationId: OPERATION}), error => error.code === 'RECOVERY_REVIEW_UNAVAILABLE');

    await store.start({userId: OTHER, operationId: OTHER_OPERATION});
    await seedAccountState(db, OTHER);
    await db.query(`insert into moaon_auth.password_changes(user_id,id,status) values ($1,$2,'PENDING')`, [OTHER, OTHER_OPERATION]);
    await assert.rejects(() => store.reject({userId: OTHER, operationId: OTHER_OPERATION}), error => error.code === 'RECOVERY_REVIEW_UNAVAILABLE');
    assert.equal((await db.query('select status from moaon_auth.recovery_reviews where user_id=$1', [OTHER])).rows[0].status, 'PENDING');
  } finally {await db.close();}
});

test('candidate begin guard rejects cross-user operation reuse and any non-PENDING journal', async () => {
  const db = new PGlite();
  try {
    await prepareDatabase(db);
    const store = createRecoveryReviewStore({rpcClient: rpcFor(db)});
    await seedAccountState(db);
    await seedAccountState(db, OTHER);
    await store.start({userId: USER, operationId: OPERATION});

    await db.exec('begin');
    try {
      await assert.rejects(
        () => db.query('select public.moaon_begin_password_change($1,$2)', [OTHER, OPERATION]),
        /AUTH_TRANSITION_REJECTED/
      );
    } finally {await db.exec('rollback');}
    assert.deepEqual((await db.query('select blocked from moaon_auth.account_state where user_id=$1', [OTHER])).rows, [{blocked: false}]);
    assert.equal((await db.query('select count(*)::int as count from moaon_auth.password_changes')).rows[0].count, 0);

    await store.markRequired({userId: USER, operationId: OPERATION, stage: 'FENCE_BEGIN'});
    await db.exec('begin');
    try {
      await assert.rejects(
        () => db.query('select public.moaon_begin_password_change($1,$2)', [USER, OPERATION]),
        /AUTH_TRANSITION_REJECTED/
      );
    } finally {await db.exec('rollback');}
    assert.deepEqual((await db.query('select status from moaon_auth.recovery_reviews')).rows, [{status: 'REVIEW_REQUIRED'}]);
    assert.deepEqual((await db.query('select blocked from moaon_auth.account_state where user_id=$1', [USER])).rows, [{blocked: false}]);
  } finally {await db.close();}
});

test('SQL lists only oldest unresolved rows with bounded limits and grants execution only to service_role', async () => {
  const db = new PGlite();
  try {
    await prepareDatabase(db);
    const store = createRecoveryReviewStore({rpcClient: rpcFor(db)});
    await seedAccountState(db);
    await seedAccountState(db, OTHER);
    await store.start({userId: USER, operationId: OPERATION});
    await new Promise(resolve => setTimeout(resolve, 5));
    await store.start({userId: OTHER, operationId: OTHER_OPERATION});
    await store.markRequired({userId: OTHER, operationId: OTHER_OPERATION, stage: 'IDENTITY_RECHECK'});
    assert.deepEqual((await store.list({limit: 1})).map(row => row.operationId), [OPERATION]);
    assert.deepEqual((await store.list()).map(row => row.operationId), [OPERATION, OTHER_OPERATION]);
    await store.reject({userId: USER, operationId: OPERATION});
    assert.deepEqual((await store.list()).map(row => row.operationId), [OTHER_OPERATION]);

    for (const limit of [null, 0, 101]) {
      await assert.rejects(() => db.query('select public.moaon_list_recovery_reviews($1)', [limit]), /RECOVERY_REVIEW_REJECTED/);
    }
    for (const role of ['anon', 'authenticated']) {
      await db.exec('begin');
      try {
        await db.exec(`set local role ${role}`);
        await assert.rejects(() => db.query('select public.moaon_list_recovery_reviews(1)'), /permission denied/i);
      } finally {await db.exec('rollback');}
    }
    await db.exec('begin');
    try {
      await db.exec('set local role service_role');
      assert.equal(Array.isArray((await db.query('select public.moaon_list_recovery_reviews(1) as rows')).rows[0].rows), true);
    } finally {await db.exec('rollback');}

    const routines = [
      'public.moaon_start_recovery_review(uuid,uuid)',
      'public.moaon_require_recovery_review(uuid,uuid,text)',
      'public.moaon_complete_recovery_review(uuid,uuid)',
      'public.moaon_reject_recovery_review(uuid,uuid)',
      'public.moaon_list_recovery_reviews(integer)',
      'moaon_auth.guard_recovery_review_begin()',
    ];
    for (const routine of routines) {
      for (const role of ['anon', 'authenticated']) {
        assert.equal((await db.query('select has_function_privilege($1,$2,$3) as allowed', [role, routine, 'EXECUTE'])).rows[0].allowed, false);
      }
      assert.equal((await db.query('select has_function_privilege($1,$2,$3) as allowed', ['service_role', routine, 'EXECUTE'])).rows[0].allowed, true);
    }
    const functionSecurity = (await db.query(
      `select p.prosecdef, p.proconfig
       from pg_proc p join pg_namespace n on n.oid=p.pronamespace
       where (n.nspname='public' and p.proname like 'moaon_%recovery_review%')
          or (n.nspname='moaon_auth' and p.proname='guard_recovery_review_begin')`
    )).rows;
    assert.equal(functionSecurity.length, 6);
    assert.equal(functionSecurity.every(row => row.prosecdef === false && row.proconfig?.includes('search_path=""')), true);
    assert.deepEqual((await db.query(
      `select relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace
       where n.nspname='moaon_auth' and c.relname='recovery_reviews'`
    )).rows, [{relrowsecurity: true}]);
  } finally {await db.close();}
});

test('SQL orders equal serialized milliseconds by operation ID so validated listing stays deterministic', async () => {
  const db = new PGlite();
  try {
    await prepareDatabase(db);
    const store = createRecoveryReviewStore({rpcClient: rpcFor(db)});
    await store.start({userId: USER, operationId: OPERATION});
    await store.start({userId: OTHER, operationId: OTHER_OPERATION});
    await db.query(
      `update moaon_auth.recovery_reviews
       set created_at=case operation_id when $1 then '2026-09-08T01:02:03.004900Z'::timestamptz
                                            else '2026-09-08T01:02:03.004100Z'::timestamptz end,
           updated_at='2026-09-08T01:02:03.005000Z'::timestamptz`,
      [OPERATION]
    );
    assert.deepEqual((await store.list()).map(row => row.operationId), [OPERATION, OTHER_OPERATION]);
    assert.deepEqual((await store.list()).map(row => row.createdAt), ['2026-09-08T01:02:03.004Z','2026-09-08T01:02:03.004Z']);
  } finally {await db.close();}
});

test('file-backed reopen preserves a pending review for trusted listing', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'moaon-recovery-review-'));
  const dataDir = path.join(root, 'pgdata');
  let db;
  try {
    db = new PGlite(dataDir);
    await prepareDatabase(db);
    const store = createRecoveryReviewStore({rpcClient: rpcFor(db)});
    await store.start({userId: USER, operationId: OPERATION});
    await db.close();
    db = null;
    db = new PGlite(dataDir);
    assert.equal((await createRecoveryReviewStore({rpcClient: rpcFor(db)}).list()).length, 1);
  } finally {
    if (db) await db.close();
    await fs.rm(root, {recursive: true, force: true});
  }
});

test('actual coordinator, SQL and store persist start before risk and complete only after the fence', async () => {
  const db = new PGlite();
  try {
    await prepareDatabase(db);
    const order = [];
    const rpcClient = rpcFor(db);
    const reviewStore = createRecoveryReviewStore({rpcClient});
    const wrappedReview = Object.fromEntries(['start','markRequired','complete','reject','list'].map(method => [method, async args => {
      order.push(`review:${method}`);
      return reviewStore[method](args);
    }]));
    const sessionStore = createAuthSessionStore({rpcClient});
    const wrappedSession = {
      async beginPasswordChange(args) {order.push('fence:begin'); return sessionStore.beginPasswordChange(args);},
      async completePasswordChange(args) {order.push('fence:complete'); return sessionStore.completePasswordChange(args);},
    };
    const identity = {id: USER, email: 'owner@example.test', emailConfirmedAt: '2026-09-08T00:00:00.000Z'};
    const profile = {userId: USER, email: identity.email, active: true};
    const service = createAccountRecovery({
      provider: {
        requestRecoveryEmail: async () => {}, confirmEmail: async () => ({ok: true, identity}),
        openRecovery: async () => {order.push('open'); return {
          identity,
          updatePassword: async () => {order.push('password'); return identity;},
          signOutGlobal: async () => {order.push('signout');},
          currentIdentity: async () => {order.push('current'); return identity;},
          dispose: async () => {order.push('dispose');},
        };},
      },
      profiles: {
        findActiveByEmail: async () => profile,
        getByUserId: async () => {order.push('profile'); return profile;},
      },
      sessionStore: wrappedSession,
      reviewStore: wrappedReview,
      requestLimit: async () => {order.push('limit'); return {allowed: true};},
      randomUUID: () => OPERATION,
      now: () => Date.parse('2026-09-08T00:00:00.000Z'),
      timeoutMs: 1000,
    });
    assert.deepEqual(await service.completeRecovery({tokenHash: 'token', newPassword: 'twelve-chars!'}), {status: 'COMPLETED', requiresFreshLogin: true});
    assert.deepEqual(order, ['limit','open','profile','review:start','fence:begin','password','signout','current','profile','fence:complete','review:complete','dispose']);
    assert.deepEqual((await db.query('select status from moaon_auth.recovery_reviews')).rows, [{status: 'COMPLETED'}]);
  } finally {await db.close();}
});

test('actual coordinator keeps a blocked review with fixed stage and stores no provider secret', async () => {
  const db = new PGlite();
  try {
    await prepareDatabase(db);
    const rpcClient = rpcFor(db);
    const identity = {id: USER, email: 'owner@example.test', emailConfirmedAt: '2026-09-08T00:00:00.000Z'};
    const profile = {userId: USER, email: identity.email, active: true};
    const secret = 'raw-password-token-provider-detail';
    const service = createAccountRecovery({
      provider: {
        requestRecoveryEmail: async () => {}, confirmEmail: async () => ({ok: true, identity}),
        openRecovery: async () => ({identity, updatePassword: async () => {throw Error(secret);}, signOutGlobal: async () => {}, currentIdentity: async () => identity, dispose: async () => {}}),
      },
      profiles: {findActiveByEmail: async () => profile, getByUserId: async () => profile},
      sessionStore: createAuthSessionStore({rpcClient}),
      reviewStore: createRecoveryReviewStore({rpcClient}),
      requestLimit: async () => ({allowed: true}), randomUUID: () => OPERATION,
      now: () => Date.parse('2026-09-08T00:00:00.000Z'), timeoutMs: 1000,
    });
    assert.deepEqual(await service.completeRecovery({tokenHash: 'private-token', newPassword: 'twelve-chars!'}), {status: 'REVIEW_REQUIRED'});
    assert.deepEqual((await db.query('select blocked from moaon_auth.account_state where user_id=$1', [USER])).rows, [{blocked: true}]);
    assert.deepEqual((await db.query('select status,stage from moaon_auth.recovery_reviews')).rows, [{status: 'REVIEW_REQUIRED', stage: 'PASSWORD_UPDATE'}]);
    assert.equal(JSON.stringify((await db.query('select * from moaon_auth.recovery_reviews')).rows).includes(secret), false);
    assert.equal(JSON.stringify((await db.query('select * from moaon_auth.recovery_reviews')).rows).includes('private-token'), false);
  } finally {await db.close();}
});

test('actual coordinator leaves the durable PENDING fallback when recording review-required fails', async () => {
  const db = new PGlite();
  try {
    await prepareDatabase(db);
    const rpcClient = rpcFor(db);
    const actual = createRecoveryReviewStore({rpcClient});
    const diagnostics = [];
    const identity = {id: USER, email: 'owner@example.test', emailConfirmedAt: '2026-09-08T00:00:00.000Z'};
    const profile = {userId: USER, email: identity.email, active: true};
    const service = createAccountRecovery({
      provider: {
        requestRecoveryEmail: async () => {}, confirmEmail: async () => ({ok: true, identity}),
        openRecovery: async () => ({identity, updatePassword: async () => {throw Error('provider secret');}, signOutGlobal: async () => {}, currentIdentity: async () => identity, dispose: async () => {}}),
      },
      profiles: {findActiveByEmail: async () => profile, getByUserId: async () => profile},
      sessionStore: createAuthSessionStore({rpcClient}),
      reviewStore: {start: actual.start, markRequired: async () => {throw Error('journal secret');}, complete: actual.complete, reject: actual.reject, list: actual.list},
      requestLimit: async () => ({allowed: true}), randomUUID: () => OPERATION,
      diagnostic: event => diagnostics.push(event),
      now: () => Date.parse('2026-09-08T00:00:00.000Z'), timeoutMs: 1000,
    });
    assert.deepEqual(await service.completeRecovery({tokenHash: 'private-token', newPassword: 'twelve-chars!'}), {status: 'REVIEW_REQUIRED'});
    assert.deepEqual((await db.query('select status,stage from moaon_auth.recovery_reviews')).rows, [{status: 'PENDING', stage: null}]);
    assert.deepEqual(diagnostics, [{event: 'RECOVERY_REVIEW_RECORD_FAILED'}]);
    assert.equal((await db.query('select blocked from moaon_auth.account_state')).rows[0].blocked, true);
  } finally {await db.close();}
});
