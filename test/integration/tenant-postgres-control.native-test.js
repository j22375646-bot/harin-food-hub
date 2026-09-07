'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { randomBytes } = require('node:crypto');
const { Pool } = require('pg');
const {
  createPostgresControlDatabase,
} = require('../../lib/tenancy/postgres-control-database.js');
const {
  createTenantControlStore,
} = require('../../lib/tenancy/control-store.js');

const IDS = Object.freeze({
  tenant: '71000000-0000-4000-8000-000000000001',
  ownerA: '72000000-0000-4000-8000-000000000001',
  ownerB: '72000000-0000-4000-8000-000000000002',
  invitee: '72000000-0000-4000-8000-000000000003',
});
const SESSIONS = Object.freeze({
  ownerA: 'native-owner-a',
  ownerB: 'native-owner-b',
  invitee: 'native-invitee',
});

function validateSupervisorUrl(raw) {
  if (typeof raw !== 'string' || raw.length === 0) {
    throw new Error('MOAON_TEST_POSTGRES_URL is required for the dedicated native suite.');
  }
  let parsed;
  try {
    parsed = new URL(raw);
  } catch (_error) {
    throw new Error('MOAON_TEST_POSTGRES_URL is unsafe.');
  }
  let database;
  let username;
  try {
    database = decodeURIComponent(parsed.pathname.slice(1));
    username = decodeURIComponent(parsed.username);
  } catch (_error) {
    throw new Error('MOAON_TEST_POSTGRES_URL is unsafe.');
  }
  if (!['postgres:', 'postgresql:'].includes(parsed.protocol)
    || !['127.0.0.1', 'localhost'].includes(parsed.hostname.toLowerCase())
    || !/^moaon_test_[a-z0-9_]+$/.test(database)
    || username !== 'moaon_test_admin'
    || parsed.password.length === 0
    || parsed.searchParams.size !== 0
    || parsed.hash) {
    throw new Error('MOAON_TEST_POSTGRES_URL is unsafe.');
  }
  return parsed;
}

function quoteIdentifier(value) {
  if (!/^moaon_test_[a-z0-9_]{1,50}$/.test(value)) {
    throw new Error('Generated test database name is unsafe.');
  }
  return `"${value}"`;
}

function databaseUrl(source, database, username, password) {
  const next = new URL(source.toString());
  next.pathname = `/${database}`;
  next.username = username;
  next.password = password;
  return next.toString();
}

function verifiedSession(userId, email) {
  return Object.freeze({
    id: `73000000-0000-4000-8000-${userId.slice(-12)}`,
    userId,
    email,
    emailVerified: true,
    expiresAt: '2099-01-01T00:00:00.000Z',
  });
}

async function verifySession(credential) {
  const sessions = {
    [SESSIONS.ownerA]: verifiedSession(IDS.ownerA, 'owner-a@example.test'),
    [SESSIONS.ownerB]: verifiedSession(IDS.ownerB, 'owner-b@example.test'),
    [SESSIONS.invitee]: verifiedSession(IDS.invitee, 'invitee@example.test'),
  };
  return sessions[credential] || null;
}

function createBarrier(parties) {
  let arrivals = 0;
  let release;
  const ready = new Promise(resolve => { release = resolve; });
  return {
    async arrive() {
      arrivals += 1;
      if (arrivals === parties) release();
      await ready;
    },
  };
}

function createBarrierPool(connectionString, matcher, evidence) {
  const rawPool = new Pool({
    connectionString,
    ssl: false,
    max: 2,
    connectionTimeoutMillis: 2000,
    idleTimeoutMillis: 1000,
    allowExitOnIdle: true,
  });
  const barrier = createBarrier(2);
  return {
    on(event, listener) {
      rawPool.on(event, listener);
      return this;
    },
    async connect() {
      const raw = await rawPool.connect();
      const pid = (await raw.query('select pg_backend_pid() as pid')).rows[0].pid;
      let waited = false;
      return {
        async query(text, values) {
          const sql = String(text);
          if (!waited && matcher(sql)) {
            waited = true;
            evidence.push(pid);
            await barrier.arrive();
          }
          return raw.query(text, values);
        },
        release(destroy) {
          raw.release(destroy);
        },
      };
    },
    end() {
      return rawPool.end();
    },
  };
}

const supervisorUrl = validateSupervisorUrl(process.env.MOAON_TEST_POSTGRES_URL);
const databaseName = `moaon_test_control_${process.pid}_${randomBytes(4).toString('hex')}`;
const databaseIdentifier = quoteIdentifier(databaseName);
const applicationPassword = randomBytes(24).toString('hex');
const publicProbeRole = `moaon_test_public_${process.pid}`;
if (!/^moaon_test_public_[0-9]+$/.test(publicProbeRole)) {
  throw new Error('Generated test role name is unsafe.');
}

let supervisorPool;
let adminPool;
let applicationUrl;
let serverMetadata;
let candidateRoleMetadata;
let databaseCreated = false;
const createdAuxiliaryRoles = [];

async function resetFixtures() {
  await adminPool.query('drop trigger if exists fail_invitation_accept_audit on moaon_control.audit_events');
  await adminPool.query('drop function if exists moaon_control.fail_invitation_accept_audit()');
  await adminPool.query(`
    truncate table moaon_control.audit_events,
      moaon_control.invitations,
      moaon_control.memberships,
      moaon_control.tenants
  `);
  await adminPool.query(`
    insert into moaon_control.tenants (id, display_name, status)
    values ($1::uuid, 'Native tenant', 'ACTIVE')
  `, [IDS.tenant]);
  await adminPool.query(`
    insert into moaon_control.memberships (
      tenant_id, user_id, role, status, version
    ) values
      ($1::uuid, $2::uuid, 'OWNER', 'ACTIVE', 1),
      ($1::uuid, $3::uuid, 'OPERATOR', 'ACTIVE', 1)
  `, [IDS.tenant, IDS.ownerA, IDS.ownerB]);
}

function createAdapter(options = {}) {
  return createPostgresControlDatabase({
    connection: { connectionString: applicationUrl, ssl: false },
    localTestOnly: true,
    maxConnections: 2,
    ...options,
  });
}

function createStore(database) {
  return createTenantControlStore({ database, verifySession });
}

async function createInvitation(store) {
  return store.createInvitation({
    sessionCredential: SESSIONS.ownerA,
    tenantId: IDS.tenant,
    expectedMembershipVersion: 1,
    email: 'invitee@example.test',
    role: 'VIEWER',
  });
}

async function runRace(matcher, operationA, operationB) {
  const backendPids = [];
  const testPool = createBarrierPool(applicationUrl, matcher, backendPids);
  const database = createAdapter({ testPool });
  const store = createStore(database);
  try {
    const settled = await Promise.allSettled([operationA(store), operationB(store)]);
    assert.equal(new Set(backendPids).size, 2);
    assert.equal(backendPids.length, 2);
    return { settled, backendPids };
  } finally {
    await database.close();
  }
}

test.before(async () => {
  supervisorPool = new Pool({
    connectionString: supervisorUrl.toString(),
    ssl: false,
    max: 2,
    connectionTimeoutMillis: 2000,
    allowExitOnIdle: true,
  });

  const metadata = await supervisorPool.query(`
    select version(), current_setting('server_version') as server_version,
      current_database(), current_user, pg_backend_pid() as pid
  `);
  serverMetadata = metadata.rows[0];
  assert.match(serverMetadata.current_database, /^moaon_test_/);
  assert.equal(serverMetadata.current_user, 'moaon_test_admin');

  const existingControlRole = await supervisorPool.query(
    "select 1 from pg_roles where rolname = 'moaon_control_app'"
  );
  assert.equal(existingControlRole.rowCount, 0, 'isolated cluster must start without control role');

  for (const role of ['anon', 'authenticated', publicProbeRole]) {
    const exists = await supervisorPool.query('select 1 from pg_roles where rolname = $1', [role]);
    if (exists.rowCount === 0) {
      if (!/^(anon|authenticated|moaon_test_public_[0-9]+)$/.test(role)) {
        throw new Error('Auxiliary role guard failed.');
      }
      await supervisorPool.query(`create role "${role}" nologin`);
      createdAuxiliaryRoles.push(role);
    }
  }

  await supervisorPool.query(`create database ${databaseIdentifier}`);
  databaseCreated = true;
  adminPool = new Pool({
    connectionString: databaseUrl(
      supervisorUrl,
      databaseName,
      decodeURIComponent(supervisorUrl.username),
      decodeURIComponent(supervisorUrl.password)
    ),
    ssl: false,
    max: 3,
    connectionTimeoutMillis: 2000,
    allowExitOnIdle: true,
  });

  const schemaSql = await fs.readFile(
    path.join(__dirname, '..', '..', 'lib', 'tenancy', 'sql', 'control-plane.sql'),
    'utf8'
  );
  const roleSql = await fs.readFile(
    path.join(__dirname, '..', '..', 'lib', 'tenancy', 'sql', 'control-role.sql'),
    'utf8'
  );
  await adminPool.query(schemaSql);

  // Prove the candidate refuses an unsafe preexisting LOGIN role rather than
  // silently altering or using it.
  await adminPool.query("create role moaon_control_app login password 'synthetic-unsafe'");
  await assert.rejects(() => adminPool.query(roleSql), error => error.code === '42501');
  const stillUnsafe = await adminPool.query(
    "select rolcanlogin from pg_roles where rolname = 'moaon_control_app'"
  );
  assert.equal(stillUnsafe.rows[0].rolcanlogin, true);
  await adminPool.query('drop role moaon_control_app');

  await adminPool.query(roleSql);
  const candidateMetadata = await adminPool.query(`
    select r.rolcanlogin, r.rolsuper, r.rolinherit, r.rolcreaterole,
      r.rolcreatedb, r.rolreplication, r.rolbypassrls,
      exists (select 1 from pg_auth_members am where am.member = r.oid or am.roleid = r.oid)
        as has_membership,
      exists (select 1 from pg_namespace n where n.nspowner = r.oid) as owns_schema,
      exists (select 1 from pg_class c where c.relowner = r.oid) as owns_relation
    from pg_roles r where r.rolname = 'moaon_control_app'
  `);
  candidateRoleMetadata = candidateMetadata.rows[0];
  assert.deepEqual(candidateRoleMetadata, {
    rolcanlogin: false,
    rolsuper: false,
    rolinherit: false,
    rolcreaterole: false,
    rolcreatedb: false,
    rolreplication: false,
    rolbypassrls: false,
    has_membership: false,
    owns_schema: false,
    owns_relation: false,
  });

  // Test-only credential provisioning is separate from the candidate SQL.
  await adminPool.query(`alter role moaon_control_app login password '${applicationPassword}'`);
  applicationUrl = databaseUrl(supervisorUrl, databaseName, 'moaon_control_app', applicationPassword);
});

test.beforeEach(resetFixtures);

test.after(async () => {
  if (adminPool) await adminPool.end().catch(() => {});
  if (supervisorPool && databaseCreated) {
    await supervisorPool.query(
      'select pg_terminate_backend(pid) from pg_stat_activity where datname = $1 and pid <> pg_backend_pid()',
      [databaseName]
    ).catch(() => {});
    await supervisorPool.query(`drop database if exists ${databaseIdentifier}`).catch(() => {});
  }
  if (supervisorPool) {
    await supervisorPool.query('drop role if exists moaon_control_app').catch(() => {});
    for (const role of createdAuxiliaryRoles.reverse()) {
      if (/^(anon|authenticated|moaon_test_public_[0-9]+)$/.test(role)) {
        await supervisorPool.query(`drop role if exists "${role}"`).catch(() => {});
      }
    }
    await supervisorPool.end().catch(() => {});
  }
});

test('native PostgreSQL 17 server와 제한 역할 metadata를 실제로 검증한다', t => {
  assert.match(serverMetadata.version, /PostgreSQL 17\./);
  assert.match(serverMetadata.server_version, /^17\./);
  assert.equal(candidateRoleMetadata.rolcanlogin, false);
  t.diagnostic(`native server=${serverMetadata.server_version} supervisor_pid=${serverMetadata.pid}`);
});

test('같은 초대를 서로 다른 backend에서 동시에 수락해 membership/audit 하나만 남긴다', async t => {
  const setupDatabase = createAdapter();
  const invitation = await createInvitation(createStore(setupDatabase));
  await setupDatabase.close();

  const { settled, backendPids } = await runRace(
    sql => /from moaon_control\.tenants[\s\S]*for update/i.test(sql),
    store => store.acceptInvitation({ sessionCredential: SESSIONS.invitee, token: invitation.token }),
    store => store.acceptInvitation({ sessionCredential: SESSIONS.invitee, token: invitation.token })
  );
  assert.equal(settled.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal(settled.filter(result => result.status === 'rejected').length, 1);
  const state = await adminPool.query(`
    select
      (select count(*)::integer from moaon_control.memberships
       where tenant_id = $1 and user_id = $2) as memberships,
      (select count(*)::integer from moaon_control.audit_events
       where target_id = $3 and action = 'INVITATION_ACCEPTED') as accept_audits
  `, [IDS.tenant, IDS.invitee, invitation.invitationId]);
  assert.deepEqual(state.rows[0], { memberships: 1, accept_audits: 1 });
  t.diagnostic(`accept race backend_pids=${backendPids.join(',')}`);
});

test('두 active OWNER의 동시 self-demote 뒤에도 active OWNER가 남는다', async t => {
  await adminPool.query(`
    update moaon_control.memberships
    set role = 'OWNER'
    where tenant_id = $1 and user_id = $2
  `, [IDS.tenant, IDS.ownerB]);

  const { settled, backendPids } = await runRace(
    sql => /from moaon_control\.tenants[\s\S]*for update/i.test(sql),
    store => store.updateMembership({
      sessionCredential: SESSIONS.ownerA,
      tenantId: IDS.tenant,
      targetUserId: IDS.ownerA,
      expectedVersion: 1,
      role: 'VIEWER',
      status: 'ACTIVE',
    }),
    store => store.updateMembership({
      sessionCredential: SESSIONS.ownerB,
      tenantId: IDS.tenant,
      targetUserId: IDS.ownerB,
      expectedVersion: 1,
      role: 'VIEWER',
      status: 'ACTIVE',
    })
  );
  assert.equal(settled.filter(result => result.status === 'fulfilled').length, 1);
  const owners = await adminPool.query(`
    select count(*)::integer as count from moaon_control.memberships
    where tenant_id = $1 and role = 'OWNER' and status = 'ACTIVE'
  `, [IDS.tenant]);
  assert.equal(owners.rows[0].count, 1);
  t.diagnostic(`owner race backend_pids=${backendPids.join(',')}`);
});

test('초대 accept와 revoke 경합은 하나의 일관된 terminal state만 남긴다', async t => {
  const setupDatabase = createAdapter();
  const invitation = await createInvitation(createStore(setupDatabase));
  await setupDatabase.close();

  const { settled, backendPids } = await runRace(
    sql => /from moaon_control\.tenants[\s\S]*for update/i.test(sql),
    store => store.acceptInvitation({ sessionCredential: SESSIONS.invitee, token: invitation.token }),
    store => store.revokeInvitation({
      sessionCredential: SESSIONS.ownerA,
      tenantId: IDS.tenant,
      invitationId: invitation.invitationId,
    })
  );
  assert.equal(settled.filter(result => result.status === 'fulfilled').length, 1);
  const state = await adminPool.query(`
    select i.status,
      (select count(*)::integer from moaon_control.memberships
       where tenant_id = i.tenant_id and user_id = $2) as memberships,
      (select count(*)::integer from moaon_control.audit_events
       where target_id = i.id and action = 'INVITATION_ACCEPTED') as accepted_audits,
      (select count(*)::integer from moaon_control.audit_events
       where target_id = i.id and action = 'INVITATION_REVOKED') as revoked_audits
    from moaon_control.invitations i where i.id = $1
  `, [invitation.invitationId, IDS.invitee]);
  const terminal = state.rows[0];
  assert.equal(
    (terminal.status === 'ACCEPTED' && terminal.memberships === 1
      && terminal.accepted_audits === 1 && terminal.revoked_audits === 0)
    || (terminal.status === 'REVOKED' && terminal.memberships === 0
      && terminal.accepted_audits === 0 && terminal.revoked_audits === 1),
    true
  );
  t.diagnostic(`accept/revoke race backend_pids=${backendPids.join(',')}`);
});

test('audit trigger 실패는 membership과 invitation 변경을 전부 rollback한다', async () => {
  const database = createAdapter();
  const store = createStore(database);
  try {
    const invitation = await createInvitation(store);
    await adminPool.query(`
      create function moaon_control.fail_invitation_accept_audit()
      returns trigger language plpgsql as $$
      begin
        if new.action = 'INVITATION_ACCEPTED' then
          raise exception 'synthetic audit failure with private detail';
        end if;
        return new;
      end;
      $$;
      create trigger fail_invitation_accept_audit
      before insert on moaon_control.audit_events
      for each row execute function moaon_control.fail_invitation_accept_audit()
    `);
    await assert.rejects(
      () => store.acceptInvitation({ sessionCredential: SESSIONS.invitee, token: invitation.token }),
      error => error.code === 'CONTROL_STORE_UNAVAILABLE'
        && !/private detail|sql|insert/i.test(error.message)
    );
    const state = await adminPool.query(`
      select i.status, i.accepted_by,
        (select count(*)::integer from moaon_control.memberships
         where tenant_id = i.tenant_id and user_id = $2) as memberships
      from moaon_control.invitations i where i.id = $1
    `, [invitation.invitationId, IDS.invitee]);
    assert.deepEqual(state.rows[0], {
      status: 'PENDING',
      accepted_by: null,
      memberships: 0,
    });
  } finally {
    await database.close();
  }
});

test('rollback 뒤 다음 checkout에는 transaction과 SET LOCAL 상태가 남지 않는다', async () => {
  const database = createAdapter({ maxConnections: 1 });
  const domain = Object.assign(new Error('synthetic domain stop'), { code: 'DOMAIN_STOP' });
  try {
    await assert.rejects(
      () => database.transaction(async tx => {
        await tx.query("set local application_name = 'moaon-leaked-local'");
        throw domain;
      }),
      error => error === domain
    );
    const clean = await database.query(`
      select current_setting('application_name') as application_name,
        txid_current_if_assigned() as transaction_id
    `);
    assert.equal(clean.rows[0].application_name, '');
    assert.equal(clean.rows[0].transaction_id, null);
  } finally {
    await database.close();
  }
});

test('최소 privilege는 escalation/public/audit 변경/tenant 파괴를 실제로 거부한다', async () => {
  const database = createAdapter({ maxConnections: 1 });
  try {
    for (const sql of [
      'create role moaon_forbidden_escalation superuser',
      'set role moaon_test_admin',
      `update moaon_control.audit_events set action = 'MEMBERSHIP_UPDATED'`,
      'delete from moaon_control.tenants',
      'truncate table moaon_control.tenants',
      `insert into moaon_control.tenants (id, display_name, status)
       values ('79999999-0000-4000-8000-000000000001', 'forbidden', 'ACTIVE')`,
      `update moaon_control.tenants set status = 'SUSPENDED' where id = '${IDS.tenant}'`,
      `update moaon_control.tenants
       set id = '79999999-0000-4000-8000-000000000002'
       where id = '${IDS.tenant}'`,
    ]) {
      await assert.rejects(() => database.query(sql), error => error.code === 'CONTROL_DATABASE_UNAVAILABLE');
    }
  } finally {
    await database.close();
  }

  for (const role of ['anon', 'authenticated', publicProbeRole]) {
    await adminPool.query('begin');
    try {
      await adminPool.query(`set local role "${role}"`);
      await assert.rejects(
        () => adminPool.query('select * from moaon_control.memberships'),
        error => error.code === '42501'
      );
    } finally {
      await adminPool.query('rollback');
    }
  }

  const intact = await adminPool.query(`
    select status from moaon_control.tenants where id = $1
  `, [IDS.tenant]);
  assert.deepEqual(intact.rows, [{ status: 'ACTIVE' }]);
});

test('supervisor/superuser URL은 adapter가 접속 전에 거부한다', () => {
  const productionLike = databaseUrl(
    supervisorUrl,
    databaseName,
    'moaon_test_admin',
    'not-used'
  );
  assert.throws(() => createPostgresControlDatabase({
    connection: { connectionString: productionLike, ssl: false },
    localTestOnly: true,
  }), TypeError);
});
