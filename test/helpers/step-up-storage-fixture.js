'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const {PGlite} = require('@electric-sql/pglite');

const USER = '11111111-1111-4111-8111-111111111111';
const OTHER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const HUB_SESSION = '55555555-5555-4555-8555-555555555555';
const OTHER_SESSION = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const PROVIDER_SESSION = '22222222-2222-4222-8222-222222222222';
const FACTOR = '33333333-3333-4333-8333-333333333333';
const OPERATION = '66666666-6666-4666-8666-666666666666';
const SECOND_OPERATION = '77777777-7777-4777-8777-777777777777';
const TOKEN_HASH = 'a'.repeat(64);
const OTHER_TOKEN_HASH = 'b'.repeat(64);
const ENCRYPTION_KEY = '01'.repeat(32);
const KEY_ID = 'test-key-1';

async function installBase(db) {
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth;
    create table auth.users(id uuid primary key);
    create table auth.sessions(id uuid primary key, user_id uuid not null);
    create table auth.mfa_factors(id uuid primary key, user_id uuid not null, status text not null, factor_type text not null);`);
  for (const file of [
    '../../supabase/migrations/20260812182508_add_dashboard_accounts_and_rbac.sql',
    '../../lib/tenancy/sql/auth-session-fence.sql',
    '../../lib/tenancy/sql/step-up-storage.sql',
  ]) {
    await db.exec(await fs.readFile(path.join(__dirname, file), 'utf8'));
  }
}

async function seed(db, {sessionExpiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString()} = {}) {
  await db.exec('reset role');
  await db.query('insert into auth.users(id) values($1),($2)', [USER, OTHER]);
  await db.query(`insert into public.dashboard_users(user_id,email,username,display_name,role) values
    ($1,'owner@example.test','owner','Synthetic owner','OWNER'),
    ($2,'other@example.test','other','Synthetic other','VIEWER')`, [USER, OTHER]);
  await db.query('insert into moaon_auth.account_state(user_id) values($1),($2)', [USER, OTHER]);
  await db.query(`insert into public.dashboard_sessions
    (id,user_id,token_hash,username,display_name,role,expires_at,last_seen_at) values
    ($1,$2,$3,'owner','Synthetic owner','OWNER',$4,clock_timestamp()),
    ($5,$6,$7,'other','Synthetic other','VIEWER',$4,clock_timestamp())`,
  [HUB_SESSION, USER, TOKEN_HASH, sessionExpiresAt, OTHER_SESSION, OTHER, OTHER_TOKEN_HASH]);
  await db.query('insert into auth.sessions(id,user_id) values($1,$2)', [PROVIDER_SESSION, USER]);
  await db.query("insert into auth.mfa_factors(id,user_id,status,factor_type) values($1,$2,'verified','totp')", [FACTOR, USER]);
  await db.exec('set role service_role');
}

async function prepareStepUpDatabase(options) {
  const db = new PGlite();
  await installBase(db);
  await seed(db, options);
  return db;
}

const RPC_ARGUMENTS = Object.freeze({
  moaon_begin_step_up: ['p_user_id', 'p_session_id', 'p_token_hash', 'p_operation_id'],
  moaon_commit_step_up: ['p_user_id', 'p_session_id', 'p_token_hash', 'p_operation_id',
    'p_provider_session_id', 'p_factor_id', 'p_verified_at', 'p_expires_at', 'p_sealed_session'],
  moaon_read_step_up: ['p_user_id', 'p_session_id', 'p_include_session'],
  moaon_revoke_step_up: ['p_user_id', 'p_session_id', 'p_token_hash'],
});

function rpcFor(db, onCall = () => {}) {
  return {async rpc(name, args) {
    onCall(name, args);
    assert.ok(Object.hasOwn(RPC_ARGUMENTS, name), `Unexpected RPC ${name}`);
    const names = RPC_ARGUMENTS[name];
    assert.deepEqual(Reflect.ownKeys(args), names);
    const values = names.map(name => args[name]);
    const parameters = values.map((_, index) => `$${index + 1}`).join(',');
    try {
      const result = await db.query(`select public.${name}(${parameters}) as data`, values);
      return {data: result.rows[0].data, error: null};
    } catch (error) {
      return {data: null, error: {code: error.code, message: error.message}};
    }
  }};
}

function providerResult({nowMs = Date.now(), accessToken = 'renewed-access-secret', refreshToken = 'renewed-refresh-secret'} = {}) {
  const verifiedAt = new Date(Math.floor(nowMs / 1000) * 1000).toISOString();
  return Object.freeze({
    evidence: Object.freeze({
      userId: USER,
      providerSessionId: PROVIDER_SESSION,
      factorId: FACTOR,
      method: 'mfa',
      verifiedAt,
      expiresAt: new Date(Date.parse(verifiedAt) + 5 * 60 * 1000).toISOString(),
    }),
    session: Object.freeze({accessToken, refreshToken}),
  });
}

function issueInput(overrides = {}) {
  return {
    userId: USER,
    sessionId: HUB_SESSION,
    tokenHash: TOKEN_HASH,
    operationId: OPERATION,
    accessToken: 'original-access-secret',
    refreshToken: 'original-refresh-secret',
    factorId: FACTOR,
    code: '123456',
    ...overrides,
  };
}

module.exports = {
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
};
