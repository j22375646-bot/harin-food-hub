'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const {PGlite} = require('@electric-sql/pglite');

const USER_A = '20000000-0000-4000-8000-000000000001';
const USER_B = '20000000-0000-4000-8000-000000000002';
const PROFILE_A = Object.freeze({
  user_id: USER_A,
  email: 'owner-a@example.test',
  username: 'owner-a',
  display_name: 'Owner A',
  role: 'OWNER',
  active: true,
});
const PROFILE_B = Object.freeze({
  user_id: USER_B,
  email: 'owner-b@example.test',
  username: 'owner-b',
  display_name: 'Owner B',
  role: 'VIEWER',
  active: true,
});
const PROVIDER_SESSION_A = '30000000-0000-4000-8000-000000000001';
const PROVIDER_SESSION_B = '30000000-0000-4000-8000-000000000002';
const FACTOR_A = '40000000-0000-4000-8000-000000000001';
const FACTOR_B = '40000000-0000-4000-8000-000000000002';
const OPERATION_A = '60000000-0000-4000-8000-000000000001';
const OPERATION_B = '60000000-0000-4000-8000-000000000002';
const ENCRYPTION_KEY = '01'.repeat(32);
const KEY_ID = 'session-lifecycle-test-key';

const RPC_ARGUMENTS = Object.freeze({
  moaon_begin_login: ['p_user_id', 'p_ticket_id'],
  moaon_get_session_window: ['p_user_id', 'p_ticket_id'],
  moaon_issue_session: [
    'p_user_id', 'p_ticket_id', 'p_session_id', 'p_token_hash', 'p_expires_at',
    'p_expected_email', 'p_expected_username', 'p_expected_display_name', 'p_expected_role',
  ],
  moaon_begin_step_up: ['p_user_id', 'p_session_id', 'p_token_hash', 'p_operation_id'],
  moaon_commit_step_up: [
    'p_user_id', 'p_session_id', 'p_token_hash', 'p_operation_id', 'p_provider_session_id',
    'p_factor_id', 'p_verified_at', 'p_expires_at', 'p_sealed_session',
  ],
  moaon_read_step_up: ['p_user_id', 'p_session_id', 'p_include_session'],
  moaon_revoke_step_up: ['p_user_id', 'p_session_id', 'p_token_hash'],
});

async function prepareLifecycleDatabase() {
  const db = new PGlite();
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
  await db.exec('reset role');
  await db.query('insert into auth.users(id) values($1),($2)', [USER_A, USER_B]);
  await db.query(`insert into public.dashboard_users(user_id,email,username,display_name,role) values
    ($1,$2,$3,$4,$5),($6,$7,$8,$9,$10)`, [
    USER_A, PROFILE_A.email, PROFILE_A.username, PROFILE_A.display_name, PROFILE_A.role,
    USER_B, PROFILE_B.email, PROFILE_B.username, PROFILE_B.display_name, PROFILE_B.role,
  ]);
  await db.query('insert into moaon_auth.account_state(user_id) values($1),($2)', [USER_A, USER_B]);
  await db.query('insert into auth.sessions(id,user_id) values($1,$2),($3,$4)', [
    PROVIDER_SESSION_A, USER_A, PROVIDER_SESSION_B, USER_B,
  ]);
  await db.query("insert into auth.mfa_factors(id,user_id,status,factor_type) values($1,$2,'verified','totp'),($3,$4,'verified','totp')", [
    FACTOR_A, USER_A, FACTOR_B, USER_B,
  ]);
  await db.exec('set role service_role');
  return db;
}

function rpcFor(db, onCall = () => {}) {
  return {async rpc(name, args) {
    onCall(name, args);
    assert.ok(Object.hasOwn(RPC_ARGUMENTS, name), `Unexpected RPC ${name}`);
    const names = RPC_ARGUMENTS[name];
    assert.deepEqual(Reflect.ownKeys(args), names);
    const values = names.map(key => args[key]);
    const parameters = values.map((_, index) => `$${index + 1}`).join(',');
    try {
      const result = await db.query(`select public.${name}(${parameters}) as data`, values);
      return {data: result.rows[0].data, error: null};
    } catch (error) {
      const message = String(error.message).includes('AUTH_TRANSITION_REJECTED')
        ? 'AUTH_TRANSITION_REJECTED'
        : String(error.message).includes('STEP_UP_REQUIRED') ? 'STEP_UP_REQUIRED' : error.message;
      return {data: null, error: {code: error.code, message}};
    }
  }};
}

function dashboardDbFor(database) {
  let directSessionInserts = 0;
  const allowedTables = new Set(['dashboard_users', 'dashboard_login_attempts', 'dashboard_sessions']);
  function from(table) {
    if (!allowedTables.has(table)) throw new Error(`Unexpected dashboard table ${table}`);
    let action = 'select';
    let columns = '*';
    let updateValues;
    const filters = [];
    const builder = {
      select(value = '*') { action = 'select'; columns = value; return this; },
      delete() { action = 'delete'; return this; },
      update(value) { action = 'update'; updateValues = value; return this; },
      eq(column, value) { filters.push([column, '=', value]); return this; },
      is(column, value) { filters.push([column, 'is', value]); return this; },
      lt(column, value) { filters.push([column, '<', value]); return this; },
      async insert() {
        directSessionInserts += 1;
        throw new Error('Fenced login must not insert dashboard_sessions directly.');
      },
      async upsert() { throw new Error('Unexpected failed-login upsert.'); },
      async maybeSingle() {
        if (action !== 'select' || !/^[a-z_,*]+$/i.test(columns)) throw new Error('Unsafe test select.');
        const {where, params} = whereClause(filters);
        const result = await database.query(
          `select ${columns} from public.${table}${where} limit 1`, params);
        return {data: result.rows[0] || null, error: null};
      },
      then(resolve, reject) {
        return executeMutation(database, table, action, updateValues, filters)
          .then(() => ({error: null}), error => ({error}))
          .then(resolve, reject);
      },
    };
    return builder;
  }
  return {db: {from}, get directSessionInserts() { return directSessionInserts; }};
}

function whereClause(filters, initial = []) {
  const params = [...initial];
  const clauses = filters.map(([column, operator, value]) => {
    if (!/^[a-z_]+$/i.test(column)) throw new Error('Unsafe test filter.');
    if (operator === 'is' && value === null) return `${column} is null`;
    params.push(value);
    return `${column} ${operator} $${params.length}`;
  });
  return {where: clauses.length ? ` where ${clauses.join(' and ')}` : '', params};
}

async function executeMutation(database, table, action, values, filters) {
  if (action === 'select') return;
  if (action === 'delete') {
    const {where, params} = whereClause(filters);
    await database.query(`delete from public.${table}${where}`, params);
    return;
  }
  if (action !== 'update' || !values || typeof values !== 'object') throw new Error('Unexpected test mutation.');
  const entries = Object.entries(values);
  if (!entries.length || entries.some(([column]) => !/^[a-z_]+$/i.test(column))) throw new Error('Unsafe test update.');
  const params = entries.map(([, value]) => value);
  const set = entries.map(([column], index) => `${column}=$${index + 1}`).join(',');
  const clause = whereClause(filters, params);
  await database.query(`update public.${table} set ${set}${clause.where}`, clause.params);
}

function providerUser(profile) {
  return Object.freeze({
    id: profile.user_id,
    email: profile.email,
    email_confirmed_at: '2026-09-07T00:00:00.000Z',
    is_anonymous: false,
    deleted_at: null,
    banned_until: null,
  });
}

function passwordClient(profile) {
  return {auth: {async signInWithPassword(credentials) {
    assert.deepEqual(credentials, {email: profile.email, password: 'synthetic-password'});
    return {data: {user: providerUser(profile), session: {access_token: 'synthetic-login-session'}}, error: null};
  }}};
}

function mfaProvider({userId, providerSessionId, factorId}) {
  return {async verifyTotp() {
    const verifiedAt = new Date(Math.floor(Date.now() / 1000) * 1000).toISOString();
    return Object.freeze({
      evidence: Object.freeze({
        userId,
        providerSessionId,
        factorId,
        method: 'mfa',
        verifiedAt,
        expiresAt: new Date(Date.parse(verifiedAt) + 5 * 60 * 1000).toISOString(),
      }),
      session: Object.freeze({
        accessToken: `synthetic-access-${userId}`,
        refreshToken: `synthetic-refresh-${userId}`,
      }),
    });
  }};
}

module.exports = {
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
};
