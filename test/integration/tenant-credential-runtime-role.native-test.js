'use strict';
// Explicit opt-in to a disposable loopback cluster. Never a production URL.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const {randomBytes, createHash} = require('node:crypto');
const {Pool} = require('pg');
const {createPostgresControlDatabase} = require('../../lib/tenancy/postgres-control-database.js');
const {createCredentialStore} = require('../../lib/tenancy/credential-store.js');
const {createCredentialCipher} = require('../../lib/tenancy/credential-envelope.js');
const {createCredentialSessionFence} = require('../../lib/tenancy/credential-session-fence.js');
const {createTenantControlStore} = require('../../lib/tenancy/control-store.js');

const url = new URL(process.env.MOAON_AUTH_TEST_POSTGRES_URL || 'invalid:');
if (!['postgres:', 'postgresql:'].includes(url.protocol) || url.hostname !== '127.0.0.1'
  || url.port !== '55437' || url.username !== 'moaon_test_admin' || !url.password
  || url.pathname !== '/postgres' || url.search || url.hash) {
  throw Error('An explicit isolated loopback test cluster URL is required.');
}
const databaseName = `moaon_test_credential_role_${process.pid}_${randomBytes(4).toString('hex')}`;
const supervisor = new Pool({connectionString: url.toString(), ssl: false, max: 2,
  connectionTimeoutMillis: 15000, statement_timeout: 300000});
const createdRoles = [];
let admin, database, created = false;
const userId = '20000000-0000-4000-8000-000000000001';
const tenantId = '30000000-0000-4000-8000-000000000001';
const otherTenant = '30000000-0000-4000-8000-000000000002';
const sessionId = '40000000-0000-4000-8000-000000000001';
const credential = 'synthetic.runtime.signature';
const input = {tenantId, provider: 'NAVER', expectedRevision: 0,
  fields: {clientId: 'synthetic', clientSecret: 'synthetic-secret-only'}};
const cipher = createCredentialCipher({activeKeyId: 'test', keys: {test: Buffer.alloc(32, 7).toString('base64')}});
function storeFor(transport = database) {
  return createCredentialStore({database: transport, cipher, sessionFence: createCredentialSessionFence(),
    verifySession: async () => ({id: sessionId, userId, expiresAt: '2099-01-01T00:00:00Z'})});
}
test.before(async () => {
  // Do not adopt or alter a role owned by another test/application.
  assert.equal((await supervisor.query("select 1 from pg_roles where rolname='moaon_control_app'")).rowCount, 0);
  await supervisor.query(`create database "${databaseName}"`); created = true;
  url.pathname = `/${databaseName}`;
  admin = new Pool({connectionString: url.toString(), ssl: false, max: 3,
    connectionTimeoutMillis: 15000, statement_timeout: 300000});
  for (const role of ['anon', 'authenticated', 'service_role']) {
    if (!(await supervisor.query('select 1 from pg_roles where rolname=$1', [role])).rowCount) {
      await supervisor.query(`create role ${role}${role === 'service_role' ? ' bypassrls' : ''}`);
      createdRoles.push(role);
    }
  }
  await admin.query('create schema auth; create table auth.users(id uuid primary key)');
  for (const file of ['supabase/migrations/20260812182508_add_dashboard_accounts_and_rbac.sql',
    'lib/tenancy/sql/auth-session-fence.sql', 'lib/tenancy/sql/control-plane.sql',
    'lib/tenancy/sql/credential-store.sql', 'lib/tenancy/sql/control-role.sql']) {
    await admin.query(await fs.readFile(path.join(__dirname, '../..', file), 'utf8'));
    if (file.endsWith('/control-role.sql')) createdRoles.push('moaon_control_app');
  }
  const roleSql = await fs.readFile(path.join(__dirname, '../../lib/tenancy/sql/credential-runtime-role.sql'), 'utf8');
  await admin.query(roleSql);
  await admin.query(roleSql);
  await admin.query(`insert into auth.users values ('${userId}');
    insert into dashboard_users(user_id,email,username,display_name,role)
      values('${userId}','synthetic@example.test','synthetic','Synthetic','OWNER');
    insert into moaon_auth.account_state(user_id) values('${userId}');
    insert into moaon_control.tenants(id,display_name,status)
      values('${tenantId}','Synthetic','ACTIVE'),('${otherTenant}','Other','ACTIVE');
    insert into moaon_control.memberships(tenant_id,user_id,role,status,version)
      values('${tenantId}','${userId}','OWNER','ACTIVE',1)`);
  await admin.query(`insert into dashboard_sessions(id,user_id,token_hash,username,display_name,role,expires_at)
    values($1,$2,$3,'synthetic','Synthetic','OWNER',clock_timestamp()+interval '1 hour')`,
    [sessionId, userId, createHash('sha256').update(credential).digest('hex')]);
  const password = randomBytes(24).toString('hex');
  await admin.query(`alter role moaon_control_app login password '${password}'`);
  database = createPostgresControlDatabase({connection: {host: '127.0.0.1', port: 55437,
    database: databaseName, user: 'moaon_control_app', password, ssl: false}, localTestOnly: true,
    connectionTimeoutMillis: 15000, statementTimeoutMillis: 15000, lockTimeoutMillis: 5000,
    idleInTransactionSessionTimeoutMillis: 15000, diagnostic() {}});
});
test.after(async () => {
  const failures = [];
  for (const close of [() => database?.close(), () => admin?.end()]) {
    try { await close(); } catch (error) { failures.push(error); }
  }
  let dropped = !created;
  if (created) try { await supervisor.query(`drop database "${databaseName}"`); dropped = true; }
  catch (error) { failures.push(error); }
  if (dropped) for (const role of createdRoles.reverse()) {
    try { await supervisor.query(`drop role ${role}`); } catch (error) { failures.push(error); }
  }
  try { await supervisor.end(); } catch (error) { failures.push(error); }
  if (failures.length) throw new AggregateError(failures, 'Disposable role test cleanup failed.');
});

test('actual restricted login saves and updates encrypted credentials with metadata-only read access', async () => {
  const identity = (await database.query('select current_user, session_user')).rows[0];
  assert.deepEqual(identity, {current_user: 'moaon_control_app', session_user: 'moaon_control_app'});
  assert.equal((await storeFor().save(credential, input)).revision, 1);
  assert.equal((await storeFor().save(credential, {...input, expectedRevision: 1})).revision, 2);
  assert.equal((await database.query('select revision from moaon_control.provider_credentials')).rows[0].revision, 2);
  const stored = (await admin.query('select envelope from moaon_control.provider_credentials')).rows[0].envelope;
  assert.equal(JSON.stringify(stored).includes(input.fields.clientSecret), false);
  await assert.rejects(storeFor().save(credential, input), {code: 'CREDENTIAL_CONFLICT'});
});

test('restricted connection cannot read ciphertext, change auth state, delete keys or use recovery tables', async () => {
  for (const sql of [
    'select envelope from moaon_control.provider_credentials',
    'update moaon_control.provider_credentials set revision=revision+1 returning envelope',
    'delete from moaon_control.provider_credentials',
    'truncate moaon_control.provider_credentials',
    'update moaon_control.provider_credentials set tenant_id=tenant_id',
    'update moaon_auth.account_state set user_id=user_id',
    'update moaon_auth.account_state set blocked=true',
    'update dashboard_users set user_id=user_id',
    'update dashboard_users set active=false',
    'update dashboard_sessions set id=id',
    'update dashboard_sessions set revoked_at=clock_timestamp()',
    'delete from dashboard_sessions',
    'truncate dashboard_sessions',
    'select * from moaon_auth.login_tickets',
    'select * from moaon_auth.password_changes',
  ]) await assert.rejects(database.query(sql), {code: 'CONTROL_DATABASE_UNAVAILABLE'}, sql);
  assert.equal((await database.query('select revision from moaon_control.provider_credentials')).rows[0].revision, 2);
});

test('actual restricted store rejects cross-tenant, non-owner, blocked and expired callers', async () => {
  const save = () => storeFor().save(credential, {...input, expectedRevision: 2});
  await assert.rejects(storeFor().save(credential, {...input, tenantId: otherTenant}), {code: 'CREDENTIAL_ACCESS_DENIED'});
  await admin.query("update moaon_control.memberships set role='VIEWER'");
  await assert.rejects(save(), {code: 'CREDENTIAL_ACCESS_DENIED'});
  await admin.query("update moaon_control.memberships set role='OWNER'");
  await admin.query("update moaon_auth.account_state set blocked=true,operation_id='50000000-0000-4000-8000-000000000001'");
  await assert.rejects(save(), {code: 'CREDENTIAL_ACCESS_DENIED'});
  await admin.query('update moaon_auth.account_state set blocked=false,operation_id=null');
  await admin.query("update dashboard_sessions set expires_at=clock_timestamp()-interval '1 second'");
  await assert.rejects(save(), {code: 'CREDENTIAL_ACCESS_DENIED'});
  await admin.query("update dashboard_sessions set expires_at=clock_timestamp()+interval '1 hour'");
  assert.equal((await database.query('select revision from moaon_control.provider_credentials')).rows[0].revision, 2);
});

test('existing invitation and audit operations remain usable through the restricted control store', async () => {
  const control = createTenantControlStore({database, verifySession: async () => ({
    id: sessionId, userId, email: 'synthetic@example.test', emailVerified: true,
    expiresAt: '2099-01-01T00:00:00Z',
  })});
  const invitation = await control.createInvitation({sessionCredential: credential, tenantId,
    expectedMembershipVersion: 1, email: 'invitee@example.test', role: 'VIEWER'});
  assert.equal(typeof invitation.invitationId, 'string');
  assert.equal((await admin.query('select count(*)::int n from moaon_control.audit_events')).rows[0].n, 1);
  assert.equal((await control.revokeInvitation({sessionCredential: credential, tenantId,
    invitationId: invitation.invitationId})).status, 'REVOKED');
});

test('revocation wins an observed lock race against the actual restricted transaction', async t => {
  const revoker = await admin.connect();
  let pending, saverPid;
  try {
    await revoker.query('begin');
    await revoker.query('update dashboard_sessions set revoked_at=clock_timestamp() where id=$1', [sessionId]);
    const transport = {transaction: work => database.transaction(async tx => {
      saverPid = (await tx.query('select pg_backend_pid() pid')).rows[0].pid;
      return work(tx);
    })};
    pending = storeFor(transport).save(credential, {...input, expectedRevision: 2})
      .then(result => ({result}), error => ({error}));
    const deadline = Date.now() + 5000;
    let observed = false;
    while (Date.now() < deadline) {
      if (saverPid && (await admin.query('select wait_event_type from pg_stat_activity where pid=$1', [saverPid]))
        .rows[0]?.wait_event_type === 'Lock') { observed = true; break; }
      await new Promise(resolve => setTimeout(resolve, 20));
    }
    assert.equal(observed, true, 'restricted saver must actually wait for the session row');
    await revoker.query('commit');
    assert.equal((await pending).error?.code, 'CREDENTIAL_ACCESS_DENIED');
    assert.equal((await database.query('select revision from moaon_control.provider_credentials')).rows[0].revision, 2);
    t.diagnostic(`Observed restricted backend ${saverPid} waiting for session revocation`);
  } finally {
    await revoker.query('rollback'); revoker.release();
    if (pending) await pending;
  }
});
