'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const {
  createStepUpStorage,
  StepUpStorageError,
} = require('../lib/tenancy/step-up-storage.js');
const {createSupabaseStepUpProvider} = require('../lib/tenancy/supabase-step-up-provider.js');
const {StepUpProviderError} = require('../lib/tenancy/supabase-step-up-provider.js');
const {createStepUpProviderFixture} = require('./helpers/step-up-provider-fixture.js');
const {
  USER,
  OTHER,
  HUB_SESSION,
  OTHER_SESSION,
  PROVIDER_SESSION,
  FACTOR,
  OPERATION,
  SECOND_OPERATION,
  TOKEN_HASH,
  OTHER_TOKEN_HASH,
  ENCRYPTION_KEY,
  KEY_ID,
  prepareStepUpDatabase,
  rpcFor,
  providerResult,
  issueInput,
} = require('./helpers/step-up-storage-fixture.js');

const SQL_PATH = path.join(__dirname, '../lib/tenancy/sql/step-up-storage.sql');

function storageFor(db, provider, options = {}) {
  return createStepUpStorage({
    rpcClient: rpcFor(db, options.onRpc),
    provider,
    encryptionKey: options.encryptionKey || ENCRYPTION_KEY,
    keyId: options.keyId || KEY_ID,
    timeoutMs: options.timeoutMs,
    now: options.now,
  });
}

function assertStorageError(error, code, secrets = []) {
  assert.ok(error instanceof StepUpStorageError);
  assert.equal(error.code, code);
  assert.equal(error.status, code === 'STEP_UP_REQUIRED' ? 403 : 503);
  assert.equal(error.cause, undefined);
  for (const secret of secrets) assert.equal(`${error.name}:${error.message}`.includes(secret), false);
  return true;
}

async function setAdmin(db, operation) {
  await db.exec('reset role');
  try { return await operation(); }
  finally { await db.exec('set role service_role'); }
}

test('PGlite stores one encrypted proof and revokes it through the public service seam', async () => {
  const db = await prepareStepUpDatabase();
  try {
    const expectedProvider = providerResult();
    const rpcArguments = [];
    const service = createStepUpStorage({
      rpcClient: rpcFor(db, (name, args) => rpcArguments.push([name, args])),
      provider: {verifyTotp: async () => expectedProvider},
      encryptionKey: ENCRYPTION_KEY,
      keyId: KEY_ID,
    });
    const expectedProof = {
      userId: USER,
      sessionId: HUB_SESSION,
      method: 'mfa',
      verifiedAt: expectedProvider.evidence.verifiedAt,
      expiresAt: expectedProvider.evidence.expiresAt,
    };

    assert.deepEqual(await service.issue(issueInput()), expectedProof);
    assert.deepEqual(await service.verifyStepUp({userId: USER, sessionId: HUB_SESSION}), expectedProof);
    assert.deepEqual(await service.loadSession({userId: USER, sessionId: HUB_SESSION}), {
      accessToken: expectedProvider.session.accessToken,
      refreshToken: expectedProvider.session.refreshToken,
    });
    const rows = (await db.query('select state,sealed_session from moaon_auth.step_up_attempts')).rows;
    assert.equal(rows[0].sealed_session.ciphertext.includes(expectedProvider.session.refreshToken), false);
    assert.equal(rows[0].state, 'VERIFIED');
    const serializedRpc = JSON.stringify(rpcArguments);
    for (const secret of [issueInput().accessToken, issueInput().refreshToken, issueInput().code,
      expectedProvider.session.accessToken, expectedProvider.session.refreshToken]) {
      assert.equal(serializedRpc.includes(secret), false);
    }
    assert.equal(await service.revoke({userId: USER, sessionId: HUB_SESSION, tokenHash: TOKEN_HASH}), true);
    assert.equal(await service.verifyStepUp({userId: USER, sessionId: HUB_SESSION}).then(() => false, error => error.status), 403);
    assert.deepEqual((await db.query('select state,sealed_session from moaon_auth.step_up_attempts')).rows,
      [{state: 'REVOKED', sealed_session: null}]);
    assert.equal(OPERATION, issueInput().operationId);
    assert.ok(Object.isFrozen(service));
  } finally {
    await db.close();
  }
});

test('storage errors expose only fixed rejection or unavailable outcomes', () => {
  assert.deepEqual(
    [new StepUpStorageError('STEP_UP_REQUIRED'), new StepUpStorageError('STEP_UP_UNAVAILABLE')]
      .map(error => [error.code, error.status, error.message]),
    [
      ['STEP_UP_REQUIRED', 403, 'Step-up verification is required.'],
      ['STEP_UP_UNAVAILABLE', 503, 'Step-up storage is unavailable.'],
    ]
  );
});

test('real Supabase SDK verification binds provider evidence to a different hub session', async () => {
  const db = await prepareStepUpDatabase();
  try {
    const fixture = await createStepUpProviderFixture();
    const provider = createSupabaseStepUpProvider(fixture.config);
    const service = createStepUpStorage({
      rpcClient: rpcFor(db),
      provider,
      encryptionKey: ENCRYPTION_KEY,
      keyId: KEY_ID,
    });
    const proof = await service.issue(issueInput({
      accessToken: fixture.accessToken,
      refreshToken: fixture.refreshToken,
    }));

    assert.equal(proof.sessionId, HUB_SESSION);
    assert.notEqual(proof.sessionId, fixture.originalClaims.session_id);
    assert.deepEqual(await service.loadSession({userId: USER, sessionId: HUB_SESSION}), {
      accessToken: fixture.verifiedJwt,
      refreshToken: fixture.verifiedRefreshToken,
    });
    assert.deepEqual(fixture.counts(), {challengeCount: 1, verifyCount: 1, userCount: 3, refreshRequests: 0});
  } finally {
    await db.close();
  }
});

test('factory snapshots exact configuration while leaving existing SDK-shaped dependencies unchanged', () => {
  const reads = new Map();
  const values = {
    rpcClient: {rpc() {}, externalSdkState: true},
    provider: {verifyTotp() {}, externalProviderState: true},
    encryptionKey: ENCRYPTION_KEY,
    keyId: KEY_ID,
    timeoutMs: 500,
    now: Date.now,
  };
  const configuration = {};
  for (const [name, value] of Object.entries(values)) Object.defineProperty(configuration, name, {
    enumerable: true,
    get() {
      reads.set(name, (reads.get(name) || 0) + 1);
      return value;
    },
  });

  assert.doesNotThrow(() => createStepUpStorage(configuration));
  assert.deepEqual(Object.fromEntries(reads), {
    rpcClient: 1,
    provider: 1,
    encryptionKey: 1,
    keyId: 1,
    timeoutMs: 1,
    now: 1,
  });
});

test('raw commit rejects malformed identity, time, and noncanonical encrypted envelopes without changing pending state', async () => {
  const db = await prepareStepUpDatabase();
  try {
    const rpc = rpcFor(db);
    const begin = await rpc.rpc('moaon_begin_step_up', {
      p_user_id: USER,
      p_session_id: HUB_SESSION,
      p_token_hash: TOKEN_HASH,
      p_operation_id: OPERATION,
    });
    assert.equal(begin.error, null);
    const verifiedAt = begin.data.startedAt;
    const base = {
      p_user_id: USER,
      p_session_id: HUB_SESSION,
      p_token_hash: TOKEN_HASH,
      p_operation_id: OPERATION,
      p_provider_session_id: PROVIDER_SESSION,
      p_factor_id: FACTOR,
      p_verified_at: verifiedAt,
      p_expires_at: new Date(Date.parse(verifiedAt) + 240_000).toISOString(),
      p_sealed_session: {v: 1, keyId: KEY_ID, iv: 'A'.repeat(16), ciphertext: 'AA', tag: 'A'.repeat(22)},
    };
    const cases = [
      ['wrong hash', {...base, p_token_hash: OTHER_TOKEN_HASH}],
      ['wrong user', {...base, p_user_id: OTHER}],
      ['wrong session', {...base, p_session_id: OTHER_SESSION}],
      ['provider session absent', {...base, p_provider_session_id: SECOND_OPERATION}],
      ['factor absent', {...base, p_factor_id: SECOND_OPERATION}],
      ['infinite verification time', {...base, p_verified_at: 'infinity'}],
      ['future verification time', {...base, p_verified_at: new Date(Date.now() + 60_000).toISOString()}],
      ['null envelope', {...base, p_sealed_session: null}],
      ['extra envelope key', {...base, p_sealed_session: {...base.p_sealed_session, extra: true}}],
      ['noncanonical base64url low bits', {...base, p_sealed_session: {...base.p_sealed_session, ciphertext: 'AB'}}],
    ];
    for (const [name, args] of cases) {
      const result = await rpc.rpc('moaon_commit_step_up', args);
      assert.equal(result.error?.code, 'P0001', name);
      assert.deepEqual((await db.query(`select state,sealed_session,provider_session_id,factor_id
        from moaon_auth.step_up_attempts where operation_id=$1`, [OPERATION])).rows, [{
        state: 'PENDING', sealed_session: null, provider_session_id: null, factor_id: null,
      }], name);
    }
  } finally {
    await db.close();
  }
});

test('begin is single-flight, operation IDs are tombstones, and a new begin revokes the previous cipher', async () => {
  const db = await prepareStepUpDatabase();
  try {
    let providerCalls = 0;
    const provider = {verifyTotp: async () => { providerCalls += 1; return providerResult(); }};
    const service = storageFor(db, provider);

    await assert.rejects(() => service.issue(issueInput({tokenHash: OTHER_TOKEN_HASH})),
      error => assertStorageError(error, 'STEP_UP_REQUIRED'));
    assert.equal(providerCalls, 0);
    assert.equal((await db.query('select count(*)::int as count from moaon_auth.step_up_attempts')).rows[0].count, 0);

    const rpc = rpcFor(db);
    const pending = await rpc.rpc('moaon_begin_step_up', {
      p_user_id: USER, p_session_id: HUB_SESSION, p_token_hash: TOKEN_HASH, p_operation_id: OPERATION,
    });
    assert.equal(pending.error, null);
    const competing = await rpc.rpc('moaon_begin_step_up', {
      p_user_id: USER, p_session_id: HUB_SESSION, p_token_hash: TOKEN_HASH, p_operation_id: SECOND_OPERATION,
    });
    assert.equal(competing.error?.code, 'P0001');
    assert.deepEqual((await db.query('select operation_id,state from moaon_auth.step_up_attempts')).rows,
      [{operation_id: OPERATION, state: 'PENDING'}]);

    await setAdmin(db, () => db.query(`update moaon_auth.step_up_attempts
      set started_at=clock_timestamp()-interval '2 minutes',pending_expires_at=clock_timestamp()-interval '1 second'`));
    await service.issue(issueInput({operationId: SECOND_OPERATION}));
    assert.deepEqual((await db.query(`select operation_id,state,sealed_session is null as cipher_cleared
      from moaon_auth.step_up_attempts order by operation_id`)).rows, [
      {operation_id: OPERATION, state: 'REVOKED', cipher_cleared: true},
      {operation_id: SECOND_OPERATION, state: 'VERIFIED', cipher_cleared: false},
    ]);
    await assert.rejects(() => service.issue(issueInput({operationId: SECOND_OPERATION})),
      error => assertStorageError(error, 'STEP_UP_REQUIRED'));
    assert.equal(providerCalls, 1);
  } finally {
    await db.close();
  }
});

test('commit rejects stale account/session/provider/factor state and leaves the pending attempt unchanged', async () => {
  const db = await prepareStepUpDatabase();
  try {
    const rpc = rpcFor(db);
    const begin = await rpc.rpc('moaon_begin_step_up', {
      p_user_id: USER, p_session_id: HUB_SESSION, p_token_hash: TOKEN_HASH, p_operation_id: OPERATION,
    });
    const base = {
      p_user_id: USER,
      p_session_id: HUB_SESSION,
      p_token_hash: TOKEN_HASH,
      p_operation_id: OPERATION,
      p_provider_session_id: PROVIDER_SESSION,
      p_factor_id: FACTOR,
      p_verified_at: begin.data.startedAt,
      p_expires_at: new Date(Date.parse(begin.data.startedAt) + 240_000).toISOString(),
      p_sealed_session: {v: 1, keyId: KEY_ID, iv: 'A'.repeat(16), ciphertext: 'AA', tag: 'A'.repeat(22)},
    };
    const cases = [
      ['account generation changed',
        () => db.query('update moaon_auth.account_state set generation=generation+1 where user_id=$1', [USER]),
        () => db.query('update moaon_auth.account_state set generation=generation-1 where user_id=$1', [USER])],
      ['account blocked',
        () => db.query('update moaon_auth.account_state set blocked=true,operation_id=$1 where user_id=$2', [SECOND_OPERATION, USER]),
        () => db.query('update moaon_auth.account_state set blocked=false,operation_id=null where user_id=$1', [USER])],
      ['hub session revoked',
        () => db.query('update public.dashboard_sessions set revoked_at=clock_timestamp() where id=$1', [HUB_SESSION]),
        () => db.query('update public.dashboard_sessions set revoked_at=null where id=$1', [HUB_SESSION])],
      ['provider session deleted',
        () => db.query('delete from auth.sessions where id=$1', [PROVIDER_SESSION]),
        () => db.query('insert into auth.sessions(id,user_id) values($1,$2)', [PROVIDER_SESSION, USER])],
      ['factor is not verified',
        () => db.query("update auth.mfa_factors set status='unverified' where id=$1", [FACTOR]),
        () => db.query("update auth.mfa_factors set status='verified' where id=$1", [FACTOR])],
      ['factor is not TOTP',
        () => db.query("update auth.mfa_factors set factor_type='phone' where id=$1", [FACTOR]),
        () => db.query("update auth.mfa_factors set factor_type='totp' where id=$1", [FACTOR])],
      ['pending attempt expired',
        () => db.query(`update moaon_auth.step_up_attempts
          set started_at=clock_timestamp()-interval '2 minutes',pending_expires_at=clock_timestamp()-interval '1 second'
          where operation_id=$1`, [OPERATION]),
        () => db.query(`update moaon_auth.step_up_attempts set started_at=$2,pending_expires_at=clock_timestamp()+interval '30 seconds'
          where operation_id=$1`, [OPERATION, begin.data.startedAt])],
    ];
    for (const [name, change, restore] of cases) {
      await setAdmin(db, change);
      const result = await rpc.rpc('moaon_commit_step_up', base);
      assert.equal(result.error?.code, 'P0001', name);
      assert.deepEqual((await db.query('select state,sealed_session from moaon_auth.step_up_attempts')).rows,
        [{state: 'PENDING', sealed_session: null}], name);
      await setAdmin(db, restore);
    }
    assert.equal((await rpc.rpc('moaon_commit_step_up', base)).error, null);
  } finally {
    await db.close();
  }
});

test('fresh reads fail closed after local or provider invalidation, while owner revoke still clears ciphertext', async () => {
  const db = await prepareStepUpDatabase();
  try {
    const secret = 'refresh-secret-that-must-not-leak';
    const service = storageFor(db, {verifyTotp: async () => providerResult({refreshToken: secret})});
    await service.issue(issueInput());
    await assert.rejects(() => service.verifyStepUp({userId: OTHER, sessionId: HUB_SESSION}),
      error => assertStorageError(error, 'STEP_UP_REQUIRED', [secret]));
    const cases = [
      ['provider session deletion',
        () => db.query('delete from auth.sessions where id=$1', [PROVIDER_SESSION]),
        () => db.query('insert into auth.sessions(id,user_id) values($1,$2)', [PROVIDER_SESSION, USER])],
      ['factor deletion',
        () => db.query('delete from auth.mfa_factors where id=$1', [FACTOR]),
        () => db.query("insert into auth.mfa_factors(id,user_id,status,factor_type) values($1,$2,'verified','totp')", [FACTOR, USER])],
      ['account generation',
        () => db.query('update moaon_auth.account_state set generation=generation+1 where user_id=$1', [USER]),
        () => db.query('update moaon_auth.account_state set generation=generation-1 where user_id=$1', [USER])],
      ['inactive profile',
        () => db.query('update public.dashboard_users set active=false where user_id=$1', [USER]),
        () => db.query('update public.dashboard_users set active=true where user_id=$1', [USER])],
      ['revoked hub session',
        () => db.query('update public.dashboard_sessions set revoked_at=clock_timestamp() where id=$1', [HUB_SESSION]),
        () => db.query('update public.dashboard_sessions set revoked_at=null where id=$1', [HUB_SESSION])],
    ];
    for (const [name, change, restore] of cases) {
      await setAdmin(db, change);
      await assert.rejects(() => service.loadSession({userId: USER, sessionId: HUB_SESSION}),
        error => assertStorageError(error, 'STEP_UP_REQUIRED', [secret]), name);
      await setAdmin(db, restore);
    }

    await setAdmin(db, async () => {
      await db.query('update moaon_auth.account_state set blocked=true,operation_id=$1 where user_id=$2', [SECOND_OPERATION, USER]);
      await db.query("update public.dashboard_sessions set revoked_at=clock_timestamp(),expires_at=clock_timestamp()-interval '1 second' where id=$1", [HUB_SESSION]);
    });
    assert.equal(await service.revoke({userId: USER, sessionId: HUB_SESSION, tokenHash: TOKEN_HASH}), true);
    assert.deepEqual((await db.query('select state,sealed_session from moaon_auth.step_up_attempts')).rows,
      [{state: 'REVOKED', sealed_session: null}]);
  } finally {
    await db.close();
  }
});

test('reinstall preserves encrypted rows and only service_role can use the tables and RPCs', async () => {
  const db = await prepareStepUpDatabase();
  try {
    const providerValue = providerResult();
    const service = storageFor(db, {verifyTotp: async () => providerValue});
    await service.issue(issueInput());
    const before = (await db.query('select operation_id,state,sealed_session from moaon_auth.step_up_attempts')).rows;
    await setAdmin(db, () => fs.readFile(SQL_PATH, 'utf8').then(sql => db.exec(sql)));
    assert.deepEqual((await db.query('select operation_id,state,sealed_session from moaon_auth.step_up_attempts')).rows, before);
    for (const role of ['anon', 'authenticated']) {
      await db.exec(`set role ${role}`);
      try {
        await assert.rejects(() => db.query('select * from moaon_auth.step_up_attempts'), /permission denied/);
        await assert.rejects(() => db.query('select public.moaon_read_step_up($1,$2,false)', [USER, HUB_SESSION]), /permission denied/);
      } finally { await db.exec('reset role'); }
    }
    await db.exec('set role service_role');
    assert.deepEqual(await service.verifyStepUp({userId: USER, sessionId: HUB_SESSION}), before[0] && {
      userId: USER,
      sessionId: HUB_SESSION,
      method: 'mfa',
      verifiedAt: providerValue.evidence.verifiedAt,
      expiresAt: providerValue.evidence.expiresAt,
    });
  } finally {
    await db.close();
  }
});

test('AES-GCM rejects changed ciphertext, tag, AAD, or key without exposing session secrets', async () => {
  const db = await prepareStepUpDatabase();
  try {
    const accessToken = 'verified-access-secret-for-tamper-test';
    const refreshToken = 'verified-refresh-secret-for-tamper-test';
    const providerValue = providerResult({accessToken, refreshToken});
    const service = storageFor(db, {verifyTotp: async () => providerValue});
    await service.issue(issueInput());
    const original = (await db.query('select sealed_session from moaon_auth.step_up_attempts')).rows[0].sealed_session;
    const changed = character => character === 'A' ? 'B' : 'A';
    for (const name of ['ciphertext', 'tag', 'iv']) {
      const envelope = {...original, [name]: changed(original[name][0]) + original[name].slice(1)};
      await setAdmin(db, () => db.query('update moaon_auth.step_up_attempts set sealed_session=$1', [envelope]));
      await assert.rejects(() => service.loadSession({userId: USER, sessionId: HUB_SESSION}),
        error => assertStorageError(error, 'STEP_UP_UNAVAILABLE', [accessToken, refreshToken]), name);
      await setAdmin(db, () => db.query('update moaon_auth.step_up_attempts set sealed_session=$1', [original]));
    }

    const otherFactor = '88888888-8888-4888-8888-888888888888';
    await setAdmin(db, async () => {
      await db.query("insert into auth.mfa_factors(id,user_id,status,factor_type) values($1,$2,'verified','totp')", [otherFactor, USER]);
      await db.query('update moaon_auth.step_up_attempts set factor_id=$1', [otherFactor]);
    });
    await assert.rejects(() => service.loadSession({userId: USER, sessionId: HUB_SESSION}),
      error => assertStorageError(error, 'STEP_UP_UNAVAILABLE', [accessToken, refreshToken]));
    await setAdmin(db, () => db.query('update moaon_auth.step_up_attempts set factor_id=$1', [FACTOR]));

    for (const options of [{encryptionKey: '02'.repeat(32)}, {keyId: 'rotated-key'}]) {
      const wrongKeyService = storageFor(db, {verifyTotp: async () => providerValue}, options);
      await assert.rejects(() => wrongKeyService.loadSession({userId: USER, sessionId: HUB_SESSION}),
        error => assertStorageError(error, 'STEP_UP_UNAVAILABLE', [accessToken, refreshToken]));
    }
  } finally {
    await db.close();
  }
});

test('exact-key validation snapshots getters once and rejects invalid calls before I/O', async () => {
  let io = 0;
  const service = createStepUpStorage({
    rpcClient: {rpc: async () => { io += 1; return {data: null, error: null}; }},
    provider: {verifyTotp: async () => { io += 1; return providerResult(); }},
    encryptionKey: ENCRYPTION_KEY,
    keyId: KEY_ID,
  });
  const invalidIssue = [
    null,
    [],
    {...issueInput(), extra: true},
    {...issueInput(), userId: new String(USER)},
    {...issueInput(), tokenHash: TOKEN_HASH.toUpperCase()},
    {...issueInput(), accessToken: ' spaced '},
    {...issueInput(), code: '12345'},
    Object.assign(issueInput(), {[Symbol('extra')]: true}),
  ];
  for (const value of invalidIssue) await assert.rejects(() => service.issue(value), TypeError);
  await assert.rejects(() => service.verifyStepUp({userId: USER, sessionId: HUB_SESSION, extra: true}), TypeError);
  await assert.rejects(() => service.revoke({userId: USER, sessionId: HUB_SESSION, tokenHash: 'raw-token'}), TypeError);
  assert.equal(io, 0);

  const reads = new Map();
  const values = {...issueInput(), tokenHash: TOKEN_HASH.toUpperCase()};
  const getterInput = {};
  for (const [name, value] of Object.entries(values)) Object.defineProperty(getterInput, name, {
    enumerable: true,
    get() { reads.set(name, (reads.get(name) || 0) + 1); return value; },
  });
  await assert.rejects(() => service.issue(getterInput), TypeError);
  assert.deepEqual(Object.fromEntries(reads), Object.fromEntries(Object.keys(values).map(name => [name, 1])));
  assert.equal(io, 0);

  const valid = {
    rpcClient: {rpc() {}}, provider: {verifyTotp() {}}, encryptionKey: ENCRYPTION_KEY, keyId: KEY_ID,
  };
  for (const configuration of [null, [], {...valid, extra: true}, {...valid, encryptionKey: 'AB'.repeat(32)},
    {...valid, keyId: 'bad key'}, {...valid, timeoutMs: 0}, {...valid, timeoutMs: 30001},
    {...valid, rpcClient: {rpc: 'not-a-function'}}, {...valid, provider: {verifyTotp: null}}]) {
    assert.throws(() => createStepUpStorage(configuration), TypeError);
  }
});

test('only exact database and provider rejections map to 403; lookalike upstream errors stay 503', async () => {
  const identity = {userId: USER, sessionId: HUB_SESSION};
  for (const [error, code] of [
    [{code: 'P0001', message: 'STEP_UP_REQUIRED'}, 'STEP_UP_REQUIRED'],
    [{code: 'P0001', message: 'different'}, 'STEP_UP_UNAVAILABLE'],
    [{code: 'STEP_UP_REQUIRED', message: 'STEP_UP_REQUIRED'}, 'STEP_UP_UNAVAILABLE'],
  ]) {
    const service = createStepUpStorage({
      rpcClient: {rpc: async () => ({data: null, error})},
      provider: {verifyTotp() {}}, encryptionKey: ENCRYPTION_KEY, keyId: KEY_ID,
    });
    await assert.rejects(() => service.verifyStepUp(identity), caught => assertStorageError(caught, code));
  }

  const fixed = Date.now();
  const begin = {operationId: OPERATION, startedAt: new Date(fixed).toISOString(), expiresAt: new Date(fixed + 60_000).toISOString()};
  for (const [providerError, code] of [
    [new StepUpProviderError('STEP_UP_REJECTED'), 'STEP_UP_REQUIRED'],
    [Object.assign(new Error('forged rejection'), {code: 'STEP_UP_REJECTED', status: 403}), 'STEP_UP_UNAVAILABLE'],
  ]) {
    const calls = [];
    const service = createStepUpStorage({
      rpcClient: {rpc: async name => { calls.push(name); return {data: begin, error: null}; }},
      provider: {verifyTotp: async () => { throw providerError; }},
      encryptionKey: ENCRYPTION_KEY, keyId: KEY_ID, now: () => fixed,
    });
    await assert.rejects(() => service.issue(issueInput()), caught => assertStorageError(caught, code, ['forged rejection']));
    assert.deepEqual(calls, ['moaon_begin_step_up']);
  }
});

test('one deadline prevents retries and any follow-up after late begin or provider results', async () => {
  const delayed = (milliseconds, value) => new Promise(resolve => setTimeout(() => resolve(value), milliseconds));
  const beginNow = () => {
    const value = Date.now();
    return {operationId: OPERATION, startedAt: new Date(value).toISOString(), expiresAt: new Date(value + 60_000).toISOString()};
  };

  {
    const calls = [];
    let providerCalls = 0;
    const service = createStepUpStorage({
      rpcClient: {rpc: async name => { calls.push(name); return delayed(40, {data: beginNow(), error: null}); }},
      provider: {verifyTotp: async () => { providerCalls += 1; return providerResult(); }},
      encryptionKey: ENCRYPTION_KEY, keyId: KEY_ID, timeoutMs: 10,
    });
    await assert.rejects(() => service.issue(issueInput()), error => assertStorageError(error, 'STEP_UP_UNAVAILABLE'));
    await delayed(50);
    assert.deepEqual(calls, ['moaon_begin_step_up']);
    assert.equal(providerCalls, 0);
  }

  {
    const calls = [];
    let providerCalls = 0;
    const service = createStepUpStorage({
      rpcClient: {rpc: async name => { calls.push(name); return {data: beginNow(), error: null}; }},
      provider: {verifyTotp: async () => { providerCalls += 1; return delayed(40, providerResult()); }},
      encryptionKey: ENCRYPTION_KEY, keyId: KEY_ID, timeoutMs: 10,
    });
    await assert.rejects(() => service.issue(issueInput()), error => assertStorageError(error, 'STEP_UP_UNAVAILABLE'));
    await delayed(50);
    assert.deepEqual(calls, ['moaon_begin_step_up']);
    assert.equal(providerCalls, 1);
  }

  {
    const fixed = Date.now();
    let providerCalls = 0;
    const service = createStepUpStorage({
      rpcClient: {rpc: async () => ({data: {
        operationId: OPERATION,
        startedAt: new Date(fixed - 60_000).toISOString(),
        expiresAt: new Date(fixed).toISOString(),
      }, error: null})},
      provider: {verifyTotp: async () => { providerCalls += 1; return providerResult(); }},
      encryptionKey: ENCRYPTION_KEY, keyId: KEY_ID, now: () => fixed,
    });
    await assert.rejects(() => service.issue(issueInput()), error => assertStorageError(error, 'STEP_UP_UNAVAILABLE'));
    assert.equal(providerCalls, 0);
  }
});

test('each successful operation uses a fresh IV and atomically invalidates the previous verified cipher', async () => {
  const db = await prepareStepUpDatabase();
  try {
    const value = providerResult();
    const service = storageFor(db, {verifyTotp: async () => value});
    await service.issue(issueInput());
    const first = (await db.query('select sealed_session from moaon_auth.step_up_attempts where operation_id=$1', [OPERATION])).rows[0].sealed_session;
    await service.issue(issueInput({operationId: SECOND_OPERATION}));
    const rows = (await db.query(`select operation_id,state,sealed_session
      from moaon_auth.step_up_attempts order by operation_id`)).rows;
    assert.deepEqual(rows.map(row => [row.operation_id, row.state, row.sealed_session === null]), [
      [OPERATION, 'REVOKED', true],
      [SECOND_OPERATION, 'VERIFIED', false],
    ]);
    assert.notEqual(rows[1].sealed_session.iv, first.iv);
    assert.notEqual(rows[1].sealed_session.ciphertext, first.ciphertext);
  } finally {
    await db.close();
  }
});

test('commit rejection is dispatched once, keeps pending TTL recovery, and is never retried or compensated', async () => {
  const db = await prepareStepUpDatabase();
  try {
    const calls = [];
    let providerCalls = 0;
    const service = storageFor(db, {
      verifyTotp: async () => {
        providerCalls += 1;
        await setAdmin(db, () => db.query('delete from auth.sessions where id=$1', [PROVIDER_SESSION]));
        return providerResult();
      },
    }, {onRpc: name => calls.push(name)});
    await assert.rejects(() => service.issue(issueInput()),
      error => assertStorageError(error, 'STEP_UP_REQUIRED'));
    assert.deepEqual(calls, ['moaon_begin_step_up', 'moaon_commit_step_up']);
    assert.equal(providerCalls, 1);
    assert.deepEqual((await db.query('select state,sealed_session from moaon_auth.step_up_attempts')).rows,
      [{state: 'PENDING', sealed_session: null}]);
  } finally {
    await db.close();
  }
});
