'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { PGlite } = require('@electric-sql/pglite');
const { createTenantControlStore } = require('../lib/tenancy/control-store.js');
const { resolveTenantContext } = require('../lib/tenancy/context.js');

const IDS = Object.freeze({
  tenantA: '10000000-0000-4000-8000-000000000001',
  tenantB: '10000000-0000-4000-8000-000000000002',
  owner: '20000000-0000-4000-8000-000000000001',
  shared: '20000000-0000-4000-8000-000000000002',
  invitee: '20000000-0000-4000-8000-000000000003',
});

const SESSIONS = Object.freeze({
  owner: 'opaque-owner-session',
  shared: 'opaque-shared-session',
  invitee: 'opaque-invitee-session',
  expired: 'opaque-expired-session',
  unverified: 'opaque-unverified-session',
  wrongEmail: 'opaque-wrong-email-session',
});

let database;
let store;

// One in-memory PGlite connection is intentionally shared and tests run sequentially.
// This suite is not evidence of separate-connection PostgreSQL race behavior.

function verifiedSession(userId, email, overrides = {}) {
  return {
    id: `30000000-0000-4000-8000-${userId.slice(-12)}`,
    userId,
    email,
    emailVerified: true,
    expiresAt: '2099-01-01T00:00:00.000Z',
    ...overrides,
  };
}

async function verifySession(credential) {
  const sessions = {
    [SESSIONS.owner]: verifiedSession(IDS.owner, 'owner@example.com'),
    [SESSIONS.shared]: verifiedSession(IDS.shared, 'shared@example.com'),
    [SESSIONS.invitee]: verifiedSession(IDS.invitee, 'invitee@example.com'),
    [SESSIONS.expired]: verifiedSession(IDS.invitee, 'invitee@example.com', {
      expiresAt: '2000-01-01T00:00:00.000Z',
    }),
    [SESSIONS.unverified]: verifiedSession(IDS.invitee, 'invitee@example.com', {
      emailVerified: false,
    }),
    [SESSIONS.wrongEmail]: verifiedSession(IDS.invitee, 'other@example.com'),
  };
  return sessions[credential] ? { ...sessions[credential] } : null;
}

async function resetFixtures() {
  await database.exec('drop trigger if exists fail_invitation_accept_audit on moaon_control.audit_events;');
  await database.exec('drop function if exists moaon_control.fail_invitation_accept_audit();');
  await database.exec(`
    truncate table moaon_control.audit_events,
      moaon_control.invitations,
      moaon_control.memberships,
      moaon_control.tenants;
    insert into moaon_control.tenants (id, display_name, status) values
      ('${IDS.tenantA}', '사업장 A', 'ACTIVE'),
      ('${IDS.tenantB}', '사업장 B', 'ACTIVE');
    insert into moaon_control.memberships (tenant_id, user_id, role, status, version) values
      ('${IDS.tenantA}', '${IDS.owner}', 'OWNER', 'ACTIVE', 3),
      ('${IDS.tenantB}', '${IDS.owner}', 'VIEWER', 'ACTIVE', 7),
      ('${IDS.tenantA}', '${IDS.shared}', 'OPERATOR', 'ACTIVE', 2),
      ('${IDS.tenantB}', '${IDS.shared}', 'VIEWER', 'ACTIVE', 5);
  `);
}

async function expectStoreError(run, code, status) {
  await assert.rejects(run, error => {
    assert.equal(error.code, code);
    assert.equal(error.status, status);
    assert.doesNotMatch(error.message, /opaque|example\.com|select|insert|token|forced audit/i);
    return true;
  });
}

function createInvite(overrides = {}) {
  return store.createInvitation({
    sessionCredential: SESSIONS.owner,
    tenantId: IDS.tenantA,
    expectedMembershipVersion: 3,
    email: 'invitee@example.com',
    role: 'OPERATOR',
    ...overrides,
  });
}

test.before(async () => {
  database = new PGlite();
  const schema = await fs.readFile(
    path.join(__dirname, '..', 'lib', 'tenancy', 'sql', 'control-plane.sql'),
    'utf8'
  );
  await database.exec(schema);
  store = createTenantControlStore({ database, verifySession });
});

test.beforeEach(resetFixtures);
test.after(async () => database?.close());

test('검증된 세션 본인의 활성 사업장 membership만 resolveTenantContext 형태로 반환한다', async () => {
  assert.deepEqual(
    await store.findMembership({ sessionCredential: SESSIONS.owner, tenantId: IDS.tenantA }),
    {
      userId: IDS.owner,
      tenantId: IDS.tenantA,
      role: 'OWNER',
      status: 'ACTIVE',
      version: 3,
    }
  );
  assert.deepEqual(
    await store.findMembership({ sessionCredential: SESSIONS.owner, tenantId: IDS.tenantB }),
    {
      userId: IDS.owner,
      tenantId: IDS.tenantB,
      role: 'VIEWER',
      status: 'ACTIVE',
      version: 7,
    }
  );
});

test('초대 원문은 한 번만 반환하고 DB에는 SHA256 해시와 식별자 audit만 저장한다', async () => {
  const invitation = await store.createInvitation({
    sessionCredential: SESSIONS.owner,
    tenantId: IDS.tenantA,
    expectedMembershipVersion: 3,
    email: '  Invitee@Example.COM ',
    role: 'OPERATOR',
  });

  assert.match(invitation.token, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(invitation.invitationId.length, 36);
  assert.ok(Date.parse(invitation.expiresAt) > Date.now());

  const persisted = await database.query(`
    select invite_email, token_hash, expires_at, status
    from moaon_control.invitations
    where id = $1::uuid
  `, [invitation.invitationId]);
  assert.equal(persisted.rows[0].invite_email, 'invitee@example.com');
  assert.match(persisted.rows[0].token_hash, /^[0-9a-f]{64}$/);
  assert.notEqual(persisted.rows[0].token_hash, invitation.token);
  assert.equal(persisted.rows[0].status, 'PENDING');
  assert.equal(
    Date.parse(persisted.rows[0].expires_at) - Date.now() > 23 * 60 * 60 * 1000,
    true
  );

  const audit = await database.query(`
    select actor_user_id, action, target_id
    from moaon_control.audit_events
    where target_id = $1::uuid
  `, [invitation.invitationId]);
  assert.deepEqual(audit.rows, [{
    actor_user_id: IDS.owner,
    action: 'INVITATION_CREATED',
    target_id: invitation.invitationId,
  }]);
  assert.doesNotMatch(JSON.stringify(audit.rows), /invitee|example|token/i);
});

test('검증된 같은 이메일의 사용자가 초대를 수락하면 membership·초대·audit가 원자적으로 기록된다', async () => {
  const invitation = await store.createInvitation({
    sessionCredential: SESSIONS.owner,
    tenantId: IDS.tenantA,
    expectedMembershipVersion: 3,
    email: 'invitee@example.com',
    role: 'VIEWER',
  });

  const accepted = await store.acceptInvitation({
    sessionCredential: SESSIONS.invitee,
    token: invitation.token,
  });
  assert.deepEqual(accepted, {
    invitationId: invitation.invitationId,
    tenantId: IDS.tenantA,
    userId: IDS.invitee,
    role: 'VIEWER',
    status: 'ACTIVE',
    version: 1,
  });
  assert.equal(Object.hasOwn(accepted, 'token'), false);

  const stored = await database.query(`
    select m.role, m.status, m.version, i.status as invitation_status, i.accepted_by
    from moaon_control.memberships m
    join moaon_control.invitations i
      on i.tenant_id = m.tenant_id and i.accepted_by = m.user_id
    where m.tenant_id = $1::uuid and m.user_id = $2::uuid
  `, [IDS.tenantA, IDS.invitee]);
  assert.deepEqual(stored.rows, [{
    role: 'VIEWER',
    status: 'ACTIVE',
    version: 1,
    invitation_status: 'ACCEPTED',
    accepted_by: IDS.invitee,
  }]);

  const actions = await database.query(`
    select action from moaon_control.audit_events
    where target_id = $1::uuid order by created_at, action
  `, [invitation.invitationId]);
  assert.deepEqual(actions.rows.map(row => row.action).sort(), [
    'INVITATION_ACCEPTED',
    'INVITATION_CREATED',
  ]);
});

test('OWNER는 선택한 사업장의 pending 초대만 회수하고 audit를 남긴다', async () => {
  const invitation = await store.createInvitation({
    sessionCredential: SESSIONS.owner,
    tenantId: IDS.tenantA,
    expectedMembershipVersion: 3,
    email: 'invitee@example.com',
    role: 'OPERATOR',
  });

  assert.deepEqual(await store.revokeInvitation({
    sessionCredential: SESSIONS.owner,
    tenantId: IDS.tenantA,
    invitationId: invitation.invitationId,
  }), {
    invitationId: invitation.invitationId,
    status: 'REVOKED',
  });

  const stored = await database.query(`
    select status, accepted_by from moaon_control.invitations where id = $1::uuid
  `, [invitation.invitationId]);
  assert.deepEqual(stored.rows, [{ status: 'REVOKED', accepted_by: null }]);
  const audit = await database.query(`
    select action, actor_user_id from moaon_control.audit_events
    where target_id = $1::uuid and action = 'INVITATION_REVOKED'
  `, [invitation.invitationId]);
  assert.deepEqual(audit.rows, [{ action: 'INVITATION_REVOKED', actor_user_id: IDS.owner }]);
});

test('초대 회수는 OWNER 확인 전 상태 oracle을 만들지 않고 모든 거부 경로를 무변경으로 유지한다', async () => {
  const pending = await createInvite({ email: 'pending@example.com' });

  await database.query(`
    update moaon_control.memberships set role = 'OWNER'
    where tenant_id = $1::uuid and user_id = $2::uuid
  `, [IDS.tenantB, IDS.owner]);
  const foreign = await createInvite({
    tenantId: IDS.tenantB,
    expectedMembershipVersion: 7,
    email: 'foreign@example.com',
  });
  await database.query(`
    update moaon_control.memberships set role = 'VIEWER'
    where tenant_id = $1::uuid and user_id = $2::uuid
  `, [IDS.tenantB, IDS.owner]);

  const accepted = await createInvite({ email: 'accepted@example.com' });
  await database.query(`
    update moaon_control.invitations
    set status = 'ACCEPTED', accepted_by = $1::uuid, accepted_at = clock_timestamp()
    where id = $2::uuid
  `, [IDS.shared, accepted.invitationId]);
  const revoked = await createInvite({ email: 'revoked@example.com' });
  await store.revokeInvitation({
    sessionCredential: SESSIONS.owner,
    tenantId: IDS.tenantA,
    invitationId: revoked.invitationId,
  });
  const missingId = '40000000-0000-4000-8000-000000000099';

  const beforeInvitations = await database.query(`
    select id, tenant_id, status, accepted_by from moaon_control.invitations order by id
  `);
  const beforeAudit = await database.query(`
    select id, tenant_id, actor_user_id, action, target_id from moaon_control.audit_events order by id
  `);

  for (const invitationId of [
    pending.invitationId,
    foreign.invitationId,
    missingId,
    accepted.invitationId,
    revoked.invitationId,
  ]) {
    await expectStoreError(
      () => store.revokeInvitation({
        sessionCredential: SESSIONS.shared,
        tenantId: IDS.tenantA,
        invitationId,
      }),
      'TENANT_ACCESS_DENIED',
      403
    );
  }

  for (const invitationId of [
    foreign.invitationId,
    missingId,
    accepted.invitationId,
    revoked.invitationId,
  ]) {
    await expectStoreError(
      () => store.revokeInvitation({
        sessionCredential: SESSIONS.owner,
        tenantId: IDS.tenantA,
        invitationId,
      }),
      'INVITATION_INVALID',
      400
    );
  }

  const afterInvitations = await database.query(`
    select id, tenant_id, status, accepted_by from moaon_control.invitations order by id
  `);
  const afterAudit = await database.query(`
    select id, tenant_id, actor_user_id, action, target_id from moaon_control.audit_events order by id
  `);
  assert.deepEqual(afterInvitations.rows, beforeInvitations.rows);
  assert.deepEqual(afterAudit.rows, beforeAudit.rows);
});

test('OWNER의 실제 membership 변경은 버전을 하나 올리고 hard delete 없이 audit를 남긴다', async () => {
  assert.deepEqual(await store.updateMembership({
    sessionCredential: SESSIONS.owner,
    tenantId: IDS.tenantA,
    targetUserId: IDS.shared,
    expectedVersion: 2,
    role: 'VIEWER',
    status: 'SUSPENDED',
  }), {
    userId: IDS.shared,
    tenantId: IDS.tenantA,
    role: 'VIEWER',
    status: 'SUSPENDED',
    version: 3,
  });

  const persisted = await database.query(`
    select role, status, version from moaon_control.memberships
    where tenant_id = $1::uuid and user_id = $2::uuid
  `, [IDS.tenantA, IDS.shared]);
  assert.deepEqual(persisted.rows, [{ role: 'VIEWER', status: 'SUSPENDED', version: 3 }]);
  const audit = await database.query(`
    select action, target_id from moaon_control.audit_events
    where action = 'MEMBERSHIP_UPDATED'
  `);
  assert.deepEqual(audit.rows, [{ action: 'MEMBERSHIP_UPDATED', target_id: IDS.shared }]);
});

test('fake·만료·검증 중 만료된 세션과 잘못된 식별자를 mutation 전에 거부한다', async () => {
  await expectStoreError(
    () => store.findMembership({ sessionCredential: 'fake-session', tenantId: IDS.tenantA }),
    'AUTH_REQUIRED',
    401
  );
  await expectStoreError(
    () => store.findMembership({ sessionCredential: SESSIONS.expired, tenantId: IDS.tenantA }),
    'AUTH_REQUIRED',
    401
  );
  await expectStoreError(
    () => store.findMembership({ sessionCredential: SESSIONS.owner, tenantId: 'not-a-uuid' }),
    'TENANT_REQUIRED',
    400
  );

  const expiringStore = createTenantControlStore({
    database,
    verifySession: async () => {
      const session = verifiedSession(IDS.owner, 'owner@example.com', {
        expiresAt: new Date(Date.now() + 30).toISOString(),
      });
      await new Promise(resolve => setTimeout(resolve, 60));
      return session;
    },
  });
  await expectStoreError(
    () => expiringStore.findMembership({ sessionCredential: 'expiring', tenantId: IDS.tenantA }),
    'AUTH_REQUIRED',
    401
  );

  const lockDelayedStore = createTenantControlStore({
    database: {
      query: database.query.bind(database),
      transaction: callback => database.transaction(async client => {
        await new Promise(resolve => setTimeout(resolve, 400));
        return callback(client);
      }),
    },
    verifySession: async () => verifiedSession(IDS.owner, 'owner@example.com', {
      expiresAt: new Date(Date.now() + 250).toISOString(),
    }),
  });
  const revokedInvitation = await createInvite();
  await store.revokeInvitation({
    sessionCredential: SESSIONS.owner,
    tenantId: IDS.tenantA,
    invitationId: revokedInvitation.invitationId,
  });
  await database.query(`
    update moaon_control.tenants set status = 'SUSPENDED' where id = $1::uuid
  `, [IDS.tenantB]);
  const beforeInvitations = await database.query(`
    select id, status from moaon_control.invitations order by id
  `);
  const beforeAudit = await database.query(`
    select id, action, target_id from moaon_control.audit_events order by id
  `);

  const expiredDuringLockOperations = [
    () => lockDelayedStore.createInvitation({
      sessionCredential: 'expires-during-lock',
      tenantId: IDS.tenantA,
      expectedMembershipVersion: 2,
      email: 'invitee@example.com',
      role: 'VIEWER',
    }),
    () => lockDelayedStore.createInvitation({
      sessionCredential: 'expires-during-lock',
      tenantId: IDS.tenantA,
      expectedMembershipVersion: 3,
      email: 'owner@example.com',
      role: 'VIEWER',
    }),
    () => lockDelayedStore.createInvitation({
      sessionCredential: 'expires-during-lock',
      tenantId: IDS.tenantB,
      expectedMembershipVersion: 7,
      email: 'invitee@example.com',
      role: 'VIEWER',
    }),
    () => lockDelayedStore.acceptInvitation({
      sessionCredential: 'expires-during-lock',
      token: revokedInvitation.token,
    }),
    () => lockDelayedStore.revokeInvitation({
      sessionCredential: 'expires-during-lock',
      tenantId: IDS.tenantA,
      invitationId: revokedInvitation.invitationId,
    }),
  ];
  for (const run of expiredDuringLockOperations) {
    await expectStoreError(run, 'AUTH_REQUIRED', 401);
  }

  const afterInvitations = await database.query(`
    select id, status from moaon_control.invitations order by id
  `);
  const afterAudit = await database.query(`
    select id, action, target_id from moaon_control.audit_events order by id
  `);
  assert.deepEqual(afterInvitations.rows, beforeInvitations.rows);
  assert.deepEqual(afterAudit.rows, beforeAudit.rows);
});

test('active OWNER 자신의 검증된 이메일은 잠금·권한·version 확인 뒤 초대하지 않는다', async () => {
  await expectStoreError(
    () => createInvite({ email: ' OWNER@EXAMPLE.COM ' }),
    'MEMBERSHIP_CONFLICT',
    409
  );
  await expectStoreError(
    () => createInvite({ role: 'OWNER' }),
    'INVALID_INPUT',
    400
  );
});

test('미검증 이메일은 별도 거부하고 wrong·unknown·revoked·expired·reused token은 같은 일반 오류다', async () => {
  const unverified = await createInvite();
  await expectStoreError(
    () => store.acceptInvitation({ sessionCredential: SESSIONS.unverified, token: unverified.token }),
    'EMAIL_VERIFICATION_REQUIRED',
    403
  );

  const wrongEmail = await createInvite();
  await expectStoreError(
    () => store.acceptInvitation({ sessionCredential: SESSIONS.wrongEmail, token: wrongEmail.token }),
    'INVITATION_INVALID',
    400
  );
  await expectStoreError(
    () => store.acceptInvitation({ sessionCredential: SESSIONS.invitee, token: 'A'.repeat(43) }),
    'INVITATION_INVALID',
    400
  );

  const revoked = await createInvite();
  await database.query(`
    update moaon_control.invitations set status = 'REVOKED' where id = $1::uuid
  `, [revoked.invitationId]);
  await expectStoreError(
    () => store.acceptInvitation({ sessionCredential: SESSIONS.invitee, token: revoked.token }),
    'INVITATION_INVALID',
    400
  );

  const expired = await createInvite();
  await database.query(`
    update moaon_control.invitations
    set created_at = clock_timestamp() - interval '48 hours',
        expires_at = clock_timestamp() - interval '24 hours'
    where id = $1::uuid
  `, [expired.invitationId]);
  await expectStoreError(
    () => store.acceptInvitation({ sessionCredential: SESSIONS.invitee, token: expired.token }),
    'INVITATION_INVALID',
    400
  );

  const accepted = await createInvite();
  await store.acceptInvitation({ sessionCredential: SESSIONS.invitee, token: accepted.token });
  await expectStoreError(
    () => store.acceptInvitation({ sessionCredential: SESSIONS.invitee, token: accepted.token }),
    'INVITATION_INVALID',
    400
  );
});

test('기존 membership은 초대로 역할 상승·재활성화하지 않는다', async () => {
  const activeMemberInvite = await createInvite({ email: 'shared@example.com', role: 'VIEWER' });
  await expectStoreError(
    () => store.acceptInvitation({
      sessionCredential: SESSIONS.shared,
      token: activeMemberInvite.token,
    }),
    'MEMBERSHIP_CONFLICT',
    409
  );
  let membership = await database.query(`
    select role, status, version from moaon_control.memberships
    where tenant_id = $1::uuid and user_id = $2::uuid
  `, [IDS.tenantA, IDS.shared]);
  assert.deepEqual(membership.rows, [{ role: 'OPERATOR', status: 'ACTIVE', version: 2 }]);

  const removedMemberInvite = await createInvite({ role: 'OPERATOR' });
  await database.query(`
    insert into moaon_control.memberships (tenant_id, user_id, role, status, version)
    values ($1::uuid, $2::uuid, 'VIEWER', 'REMOVED', 4)
  `, [IDS.tenantA, IDS.invitee]);
  await expectStoreError(
    () => store.acceptInvitation({
      sessionCredential: SESSIONS.invitee,
      token: removedMemberInvite.token,
    }),
    'MEMBERSHIP_CONFLICT',
    409
  );
  membership = await database.query(`
    select role, status, version from moaon_control.memberships
    where tenant_id = $1::uuid and user_id = $2::uuid
  `, [IDS.tenantA, IDS.invitee]);
  assert.deepEqual(membership.rows, [{ role: 'VIEWER', status: 'REMOVED', version: 4 }]);
});

test('초대자가 더 이상 active OWNER가 아니면 기존 token도 수락되지 않는다', async () => {
  const invitation = await createInvite();
  await database.query(`
    update moaon_control.memberships
    set status = 'REMOVED', version = version + 1
    where tenant_id = $1::uuid and user_id = $2::uuid
  `, [IDS.tenantA, IDS.owner]);

  await expectStoreError(
    () => store.acceptInvitation({ sessionCredential: SESSIONS.invitee, token: invitation.token }),
    'INVITATION_INVALID',
    400
  );
  assert.equal(await store.findMembership({
    sessionCredential: SESSIONS.invitee,
    tenantId: IDS.tenantA,
  }), null);
});

test('교차 사업장 mutation과 오래된 OWNER session 재사용을 현재 DB 권한으로 거부한다', async () => {
  await expectStoreError(
    () => store.createInvitation({
      sessionCredential: SESSIONS.shared,
      tenantId: IDS.tenantA,
      expectedMembershipVersion: 2,
      email: 'invitee@example.com',
      role: 'VIEWER',
    }),
    'TENANT_ACCESS_DENIED',
    403
  );
  await expectStoreError(
    () => store.updateMembership({
      sessionCredential: SESSIONS.owner,
      tenantId: IDS.tenantB,
      targetUserId: IDS.shared,
      expectedVersion: 5,
      role: 'OPERATOR',
      status: 'ACTIVE',
    }),
    'TENANT_ACCESS_DENIED',
    403
  );

  const invitation = await createInvite();
  await database.query(`
    update moaon_control.memberships set role = 'OWNER'
    where tenant_id = $1::uuid and user_id = $2::uuid
  `, [IDS.tenantB, IDS.owner]);
  await expectStoreError(
    () => store.revokeInvitation({
      sessionCredential: SESSIONS.owner,
      tenantId: IDS.tenantB,
      invitationId: invitation.invitationId,
    }),
    'INVITATION_INVALID',
    400
  );

  await database.query(`
    update moaon_control.memberships set status = 'REMOVED', version = version + 1
    where tenant_id = $1::uuid and user_id = $2::uuid
  `, [IDS.tenantA, IDS.owner]);
  await expectStoreError(
    () => store.revokeInvitation({
      sessionCredential: SESSIONS.owner,
      tenantId: IDS.tenantA,
      invitationId: invitation.invitationId,
    }),
    'TENANT_ACCESS_DENIED',
    403
  );
});

test('stale version과 마지막 active OWNER 제거를 거부하고 알 수 없는 역할을 fail-closed 처리한다', async () => {
  await expectStoreError(
    () => store.updateMembership({
      sessionCredential: SESSIONS.owner,
      tenantId: IDS.tenantA,
      targetUserId: IDS.shared,
      expectedVersion: 1,
      role: 'VIEWER',
      status: 'ACTIVE',
    }),
    'MEMBERSHIP_VERSION_CONFLICT',
    409
  );
  await expectStoreError(
    () => store.updateMembership({
      sessionCredential: SESSIONS.owner,
      tenantId: IDS.tenantA,
      targetUserId: IDS.owner,
      expectedVersion: 3,
      role: 'OPERATOR',
      status: 'REMOVED',
    }),
    'LAST_OWNER_REQUIRED',
    409
  );
  await expectStoreError(
    () => store.updateMembership({
      sessionCredential: SESSIONS.owner,
      tenantId: IDS.tenantA,
      targetUserId: IDS.shared,
      expectedVersion: 2,
      role: 'OWNER',
      status: 'ACTIVE',
    }),
    'INVALID_INPUT',
    400
  );
});

test('membership 변경 뒤 fresh resolveTenantContext는 이전 context가 아니라 최신 role/version을 사용한다', async () => {
  const dependencies = {
    findMembership: ({ tenantId }) => store.findMembership({
      sessionCredential: SESSIONS.shared,
      tenantId,
    }),
    now: () => new Date(),
  };
  const session = {
    id: verifiedSession(IDS.shared, 'shared@example.com').id,
    userId: IDS.shared,
    expiresAt: '2099-01-01T00:00:00.000Z',
  };
  const before = await resolveTenantContext(
    { session, requestedTenantId: IDS.tenantA },
    dependencies
  );
  assert.equal(before.role, 'OPERATOR');
  assert.equal(before.membershipVersion, 2);

  await store.updateMembership({
    sessionCredential: SESSIONS.owner,
    tenantId: IDS.tenantA,
    targetUserId: IDS.shared,
    expectedVersion: 2,
    role: 'VIEWER',
    status: 'ACTIVE',
  });
  const after = await resolveTenantContext(
    { session, requestedTenantId: IDS.tenantA },
    dependencies
  );
  assert.equal(before.role, 'OPERATOR');
  assert.equal(after.role, 'VIEWER');
  assert.equal(after.membershipVersion, 3);
});

test('강제 audit INSERT 실패는 invitation 수락과 membership INSERT를 모두 rollback한다', async () => {
  const invitation = await createInvite();
  await database.exec(`
    create function moaon_control.fail_invitation_accept_audit()
    returns trigger language plpgsql as $$
    begin
      if new.action = 'INVITATION_ACCEPTED' then
        raise exception 'forced audit SQL secret invitee@example.com token';
      end if;
      return new;
    end;
    $$;
    create trigger fail_invitation_accept_audit
    before insert on moaon_control.audit_events
    for each row execute function moaon_control.fail_invitation_accept_audit();
  `);

  await expectStoreError(
    () => store.acceptInvitation({ sessionCredential: SESSIONS.invitee, token: invitation.token }),
    'CONTROL_STORE_UNAVAILABLE',
    503
  );
  const membership = await database.query(`
    select * from moaon_control.memberships
    where tenant_id = $1::uuid and user_id = $2::uuid
  `, [IDS.tenantA, IDS.invitee]);
  assert.equal(membership.rows.length, 0);
  const persistedInvitation = await database.query(`
    select status, accepted_by from moaon_control.invitations where id = $1::uuid
  `, [invitation.invitationId]);
  assert.deepEqual(persistedInvitation.rows, [{ status: 'PENDING', accepted_by: null }]);
});

test('candidate schema는 모든 control table에 RLS default deny를 두고 공개 grant/policy를 만들지 않는다', async () => {
  const rls = await database.query(`
    select c.relname, c.relrowsecurity
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'moaon_control' and c.relkind = 'r'
    order by c.relname
  `);
  assert.deepEqual(rls.rows, [
    { relname: 'audit_events', relrowsecurity: true },
    { relname: 'invitations', relrowsecurity: true },
    { relname: 'memberships', relrowsecurity: true },
    { relname: 'tenants', relrowsecurity: true },
  ]);
  const policies = await database.query(`
    select count(*)::integer as count from pg_policy p
    join pg_class c on c.oid = p.polrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'moaon_control'
  `);
  assert.equal(policies.rows[0].count, 0);
  const publicGrants = await database.query(`
    select count(*)::integer as count
    from information_schema.role_table_grants
    where table_schema = 'moaon_control'
      and grantee in ('PUBLIC', 'anon', 'authenticated')
  `);
  assert.equal(publicGrants.rows[0].count, 0);
});
