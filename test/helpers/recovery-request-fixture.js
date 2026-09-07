'use strict';

const assert = require('node:assert/strict');
const {PGlite} = require('@electric-sql/pglite');
const dashboardAuth = require('../../lib/dashboard-auth.js');
const {
  USER,
  OPERATOR,
  OTHER,
  OPERATION,
  RESOLUTION,
  install,
  seed,
} = require('./recovery-resolution-fixture.js');

const SESSION = '30000000-0000-4000-8000-000000000001';

function iso(value) {
  if (typeof value === 'string') return new Date(value).toISOString();
  return value instanceof Date ? value.toISOString() : value;
}

function createPostgrestReader(db) {
  return {
    from(table) {
      assert.ok(table === 'dashboard_sessions' || table === 'dashboard_users');
      const filters = {};
      let selected;
      return {
        select(columns) {
          selected = columns;
          return this;
        },
        eq(column, value) {
          filters[column] = value;
          return this;
        },
        async maybeSingle() {
          if (table === 'dashboard_sessions') {
            assert.equal(selected, 'id,user_id,username,display_name,role,expires_at,revoked_at,last_seen_at,token_hash');
            assert.deepEqual(Object.keys(filters).sort(), ['id', 'token_hash']);
            const rows = (await db.query(`select id,user_id,username,display_name,role,expires_at,
              revoked_at,last_seen_at,token_hash from public.dashboard_sessions
              where id=$1 and token_hash=$2`, [filters.id, filters.token_hash])).rows;
            const row = rows[0];
            return {data: row ? {...row, expires_at: iso(row.expires_at), revoked_at: row.revoked_at && iso(row.revoked_at),
              last_seen_at: iso(row.last_seen_at)} : null, error: null};
          }
          assert.equal(selected, 'user_id,email,active');
          assert.deepEqual(Object.keys(filters), ['user_id']);
          const rows = (await db.query('select user_id,email,active from public.dashboard_users where user_id=$1',
            [filters.user_id])).rows;
          return {data: rows[0] || null, error: null};
        },
      };
    },
  };
}

function rpcFor(db, onCall = () => {}) {
  return {async rpc(name, args) {
    onCall(name, args);
    try {
      const values = name === 'moaon_inspect_recovery_review'
        ? [args.p_operator_id, args.p_user_id, args.p_operation_id]
        : [args.p_operator_id, args.p_user_id, args.p_operation_id, args.p_resolution_id,
          args.p_expected_version, args.p_action];
      const parameters = values.map((_, index) => `$${index + 1}`).join(',');
      const result = await db.query(`select public.${name}(${parameters}) as data`, values);
      return {data: result.rows[0].data, error: null};
    } catch (error) {
      return {data: null, error: {code: error.code, message: error.message}};
    }
  }};
}

async function issueSession(db, {
  userId = OPERATOR,
  sessionId = SESSION,
  username = 'operator',
  role = 'VIEWER',
  expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString(),
} = {}) {
  const token = dashboardAuth.createSessionToken({
    sessionId,
    userId,
    username,
    displayName: 'Synthetic recovery operator',
    role,
    expiresAt,
  }, {issuedAt: new Date(Date.now() - 60_000).toISOString()});
  await db.exec('reset role');
  await db.query(`insert into public.dashboard_sessions
    (id,user_id,token_hash,username,display_name,role,expires_at,last_seen_at)
    values($1,$2,$3,$4,'Synthetic recovery operator',$5,$6,clock_timestamp())`,
  [sessionId, userId, dashboardAuth.tokenHash(token), username, role, expiresAt]);
  await db.exec('set role service_role');
  return token;
}

async function prepareRequestDatabase() {
  const db = new PGlite();
  await db.exec('create role anon; create role authenticated; create role service_role bypassrls; create schema auth; create table auth.users(id uuid primary key);');
  await install(db);
  await seed(db);
  await db.exec('set role service_role');
  return db;
}

function authUser(userId = OPERATOR, overrides = {}) {
  const email = userId === OTHER ? 'other@example.test' : 'operator@example.test';
  return {
    id: userId,
    email,
    email_confirmed_at: new Date(Date.now() - 60_000).toISOString(),
    is_anonymous: false,
    deleted_at: null,
    banned_until: null,
    ...overrides,
  };
}

module.exports = {
  USER,
  OPERATOR,
  OTHER,
  OPERATION,
  RESOLUTION,
  SESSION,
  createPostgrestReader,
  rpcFor,
  issueSession,
  prepareRequestDatabase,
  authUser,
};
