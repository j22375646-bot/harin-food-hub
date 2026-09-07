'use strict';

/**
 * Server-only transactional membership control store.
 *
 * Integration boundary:
 * - The current custom dashboard session needs a trusted server identity adapter.
 * - A restricted production PostgreSQL/Supabase connection adapter is not enabled.
 * - PGlite is test-only here and the suite deliberately uses one connection.
 *
 * This module creates neither a broad SQL API nor tenant-switching UI. Callers inject
 * trusted adapters; request data can only supply opaque credentials and fixed inputs.
 */

const { createHash, randomBytes, randomUUID } = require('node:crypto');
const { DashboardIdentityError } = require('./dashboard-identity.js');

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const INVITATION_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const INVITATION_ROLES = new Set(['OPERATOR', 'VIEWER']);
const MEMBERSHIP_STATUSES = new Set(['ACTIVE', 'SUSPENDED', 'REMOVED']);

class TenantControlStoreError extends Error {
  constructor(code, status, message) {
    super(message);
    this.name = 'TenantControlStoreError';
    this.code = code;
    this.status = status;
  }
}

function fail(code, status, message) {
  throw new TenantControlStoreError(code, status, message);
}

function presentString(value) {
  return typeof value === 'string' && value.length > 0 && value === value.trim();
}

function validUuid(value) {
  return presentString(value) && UUID_PATTERN.test(value);
}

function normalizedEmail(value) {
  if (typeof value !== 'string') return null;
  const email = value.trim().toLowerCase();
  if (email.length < 3 || email.length > 320 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return null;
  }
  return email;
}

function positiveInteger(value) {
  return Number.isInteger(value) && value > 0;
}

function isoTime(value) {
  const milliseconds = value instanceof Date ? value.getTime() : Date.parse(value);
  if (!Number.isFinite(milliseconds)) {
    fail('CONTROL_STORE_UNAVAILABLE', 503, 'Membership store is unavailable.');
  }
  return new Date(milliseconds).toISOString();
}

function rows(result) {
  return result && Array.isArray(result.rows) ? result.rows : [];
}

function parseDatabaseTime(result) {
  const value = rows(result)[0]?.database_now;
  const milliseconds = value instanceof Date ? value.getTime() : Date.parse(value);
  if (!Number.isFinite(milliseconds)) {
    fail('CONTROL_STORE_UNAVAILABLE', 503, 'Membership store is unavailable.');
  }
  return milliseconds;
}

function snapshotVerifiedSession(value, databaseNow) {
  if (!value || typeof value !== 'object'
    || !validUuid(value.id)
    || !validUuid(value.userId)
    || !presentString(value.expiresAt)) {
    fail('AUTH_REQUIRED', 401, 'Authentication is required.');
  }
  const expiry = Date.parse(value.expiresAt);
  if (!Number.isFinite(expiry) || expiry <= databaseNow) {
    fail('AUTH_REQUIRED', 401, 'Authentication is required.');
  }
  return Object.freeze({
    id: value.id,
    userId: value.userId,
    email: typeof value.email === 'string' ? value.email : null,
    emailVerified: value.emailVerified === true,
    expiresAt: new Date(expiry).toISOString(),
    expiresAtMilliseconds: expiry,
  });
}

function ensureSessionFresh(session, databaseNow) {
  if (!session || session.expiresAtMilliseconds <= databaseNow) {
    fail('AUTH_REQUIRED', 401, 'Authentication is required.');
  }
}

function safeError(error) {
  if (error instanceof TenantControlStoreError) throw error;
  fail('CONTROL_STORE_UNAVAILABLE', 503, 'Membership store is unavailable.');
}

function invalidInvitation() {
  fail('INVITATION_INVALID', 400, 'Invitation is invalid or unavailable.');
}

function createTenantControlStore({ database, verifySession } = {}) {
  if (!database || typeof database.query !== 'function'
    || typeof database.transaction !== 'function'
    || typeof verifySession !== 'function') {
    throw new TypeError('Trusted database and session adapters are required.');
  }

  async function databaseClock(client = database) {
    return parseDatabaseTime(await client.query('select clock_timestamp() as database_now', []));
  }

  async function authenticate(sessionCredential) {
    if (!presentString(sessionCredential)) {
      fail('AUTH_REQUIRED', 401, 'Authentication is required.');
    }
    const startedAt = await databaseClock();
    let verified;
    try {
      verified = await verifySession(sessionCredential);
    } catch (error) {
      if (error instanceof DashboardIdentityError
        && error.code === 'IDENTITY_UNAVAILABLE'
        && error.status === 503) {
        fail('IDENTITY_UNAVAILABLE', 503, 'Identity verification is unavailable.');
      }
      fail('AUTH_REQUIRED', 401, 'Authentication is required.');
    }
    const session = snapshotVerifiedSession(verified, startedAt);
    ensureSessionFresh(session, await databaseClock());
    return session;
  }

  async function lockTenant(client, tenantId) {
    const result = await client.query(`
      select id, status
      from moaon_control.tenants
      where id = $1::uuid
      for update
    `, [tenantId]);
    return rows(result)[0] || null;
  }

  async function readActorMembership(client, tenantId, userId) {
    const result = await client.query(`
      select user_id, role, status, version
      from moaon_control.memberships
      where tenant_id = $1::uuid and user_id = $2::uuid
      for update
    `, [tenantId, userId]);
    return rows(result)[0] || null;
  }

  function requireActiveOwner(membership) {
    if (!membership || membership.role !== 'OWNER' || membership.status !== 'ACTIVE') {
      fail('TENANT_ACCESS_DENIED', 403, 'Tenant access is denied.');
    }
  }

  async function findMembership({ sessionCredential, tenantId } = {}) {
    if (!validUuid(tenantId)) {
      fail('TENANT_REQUIRED', 400, 'Tenant is required.');
    }
    try {
      const session = await authenticate(sessionCredential);
      const result = await database.query(`
        select m.user_id, m.tenant_id, m.role, m.status, m.version
        from moaon_control.memberships m
        join moaon_control.tenants t on t.id = m.tenant_id
        where m.user_id = $1::uuid
          and m.tenant_id = $2::uuid
          and m.status = 'ACTIVE'
          and t.status = 'ACTIVE'
      `, [session.userId, tenantId]);
      ensureSessionFresh(session, await databaseClock());
      const membership = rows(result)[0];
      if (!membership) return null;
      return {
        userId: membership.user_id,
        tenantId: membership.tenant_id,
        role: membership.role,
        status: membership.status,
        version: membership.version,
      };
    } catch (error) {
      safeError(error);
    }
  }

  async function createInvitation({
    sessionCredential,
    tenantId,
    expectedMembershipVersion,
    email,
    role,
  } = {}) {
    if (!validUuid(tenantId)) fail('TENANT_REQUIRED', 400, 'Tenant is required.');
    const inviteEmail = normalizedEmail(email);
    if (!inviteEmail || !INVITATION_ROLES.has(role) || !positiveInteger(expectedMembershipVersion)) {
      fail('INVALID_INPUT', 400, 'Invitation input is invalid.');
    }

    try {
      const session = await authenticate(sessionCredential);
      const token = randomBytes(32).toString('base64url');
      const tokenHash = createHash('sha256').update(token, 'utf8').digest('hex');
      const invitationId = randomUUID();

      const created = await database.transaction(async client => {
        const tenant = await lockTenant(client, tenantId);
        const databaseNow = await databaseClock(client);
        ensureSessionFresh(session, databaseNow);
        if (tenant?.status !== 'ACTIVE') {
          fail('TENANT_ACCESS_DENIED', 403, 'Tenant access is denied.');
        }
        const actor = await readActorMembership(client, tenantId, session.userId);
        requireActiveOwner(actor);
        if (actor.version !== expectedMembershipVersion) {
          fail('MEMBERSHIP_VERSION_CONFLICT', 409, 'Membership version is stale.');
        }
        // The trusted session only proves the actor's own email. No auth-directory
        // lookup is performed for other invite addresses in this foundation slice.
        if (session.emailVerified && normalizedEmail(session.email) === inviteEmail) {
          fail('MEMBERSHIP_CONFLICT', 409, 'Membership already exists.');
        }

        const inserted = await client.query(`
          insert into moaon_control.invitations (
            id, tenant_id, invite_email, role, token_hash, expires_at,
            status, accepted_by, created_by, created_at, accepted_at
          ) values (
            $1::uuid, $2::uuid, $3, $4, $5,
            $6::timestamptz + interval '24 hours',
            'PENDING', null, $7::uuid, $6::timestamptz, null
          )
          returning id, expires_at
        `, [
          invitationId,
          tenantId,
          inviteEmail,
          role,
          tokenHash,
          new Date(databaseNow).toISOString(),
          session.userId,
        ]);
        await client.query(`
          insert into moaon_control.audit_events (
            id, tenant_id, actor_user_id, action, target_id, created_at
          ) values ($1::uuid, $2::uuid, $3::uuid, 'INVITATION_CREATED', $4::uuid, $5::timestamptz)
        `, [randomUUID(), tenantId, session.userId, invitationId, new Date(databaseNow).toISOString()]);
        return rows(inserted)[0];
      });

      return Object.freeze({
        invitationId: created.id,
        expiresAt: isoTime(created.expires_at),
        token,
      });
    } catch (error) {
      safeError(error);
    }
  }

  async function acceptInvitation({ sessionCredential, token } = {}) {
    if (!presentString(token) || !INVITATION_TOKEN_PATTERN.test(token)) {
      invalidInvitation();
    }

    try {
      const session = await authenticate(sessionCredential);
      const sessionEmail = normalizedEmail(session.email);
      if (!session.emailVerified || !sessionEmail) {
        fail('EMAIL_VERIFICATION_REQUIRED', 403, 'A verified email is required.');
      }
      const tokenHash = createHash('sha256').update(token, 'utf8').digest('hex');
      const located = await database.query(`
        select tenant_id
        from moaon_control.invitations
        where token_hash = $1
      `, [tokenHash]);
      const tenantId = rows(located)[0]?.tenant_id;
      if (!validUuid(tenantId)) invalidInvitation();

      return await database.transaction(async client => {
        const tenant = await lockTenant(client, tenantId);
        const databaseNow = await databaseClock(client);
        ensureSessionFresh(session, databaseNow);
        if (tenant?.status !== 'ACTIVE') invalidInvitation();

        const invitationResult = await client.query(`
          select id, tenant_id, invite_email, role, status, expires_at, created_by
          from moaon_control.invitations
          where token_hash = $1 and tenant_id = $2::uuid
          for update
        `, [tokenHash, tenantId]);
        const invitation = rows(invitationResult)[0];
        if (!invitation
          || invitation.status !== 'PENDING'
          || invitation.invite_email !== sessionEmail
          || Date.parse(invitation.expires_at) <= databaseNow) {
          invalidInvitation();
        }

        const inviter = await readActorMembership(client, tenantId, invitation.created_by);
        if (!inviter || inviter.role !== 'OWNER' || inviter.status !== 'ACTIVE') {
          invalidInvitation();
        }
        const existing = await client.query(`
          select role, status, version
          from moaon_control.memberships
          where tenant_id = $1::uuid and user_id = $2::uuid
          for update
        `, [tenantId, session.userId]);
        if (rows(existing).length > 0) {
          fail('MEMBERSHIP_CONFLICT', 409, 'Membership already exists.');
        }

        const inserted = await client.query(`
          insert into moaon_control.memberships (
            tenant_id, user_id, role, status, version, created_at, updated_at
          ) values ($1::uuid, $2::uuid, $3, 'ACTIVE', 1, $4::timestamptz, $4::timestamptz)
          returning tenant_id, user_id, role, status, version
        `, [tenantId, session.userId, invitation.role, new Date(databaseNow).toISOString()]);
        await client.query(`
          update moaon_control.invitations
          set status = 'ACCEPTED', accepted_by = $1::uuid, accepted_at = $2::timestamptz
          where id = $3::uuid and status = 'PENDING'
        `, [session.userId, new Date(databaseNow).toISOString(), invitation.id]);
        await client.query(`
          insert into moaon_control.audit_events (
            id, tenant_id, actor_user_id, action, target_id, created_at
          ) values ($1::uuid, $2::uuid, $3::uuid, 'INVITATION_ACCEPTED', $4::uuid, $5::timestamptz)
        `, [randomUUID(), tenantId, session.userId, invitation.id, new Date(databaseNow).toISOString()]);

        const membership = rows(inserted)[0];
        return Object.freeze({
          invitationId: invitation.id,
          tenantId: membership.tenant_id,
          userId: membership.user_id,
          role: membership.role,
          status: membership.status,
          version: membership.version,
        });
      });
    } catch (error) {
      safeError(error);
    }
  }

  async function revokeInvitation({ sessionCredential, tenantId, invitationId } = {}) {
    if (!validUuid(tenantId)) fail('TENANT_REQUIRED', 400, 'Tenant is required.');
    if (!validUuid(invitationId)) invalidInvitation();

    try {
      const session = await authenticate(sessionCredential);
      return await database.transaction(async client => {
        const tenant = await lockTenant(client, tenantId);
        const databaseNow = await databaseClock(client);
        ensureSessionFresh(session, databaseNow);
        if (tenant?.status !== 'ACTIVE') {
          fail('TENANT_ACCESS_DENIED', 403, 'Tenant access is denied.');
        }
        const actor = await readActorMembership(client, tenantId, session.userId);
        requireActiveOwner(actor);

        const invitationResult = await client.query(`
          select id, status
          from moaon_control.invitations
          where id = $1::uuid and tenant_id = $2::uuid
          for update
        `, [invitationId, tenantId]);
        const invitation = rows(invitationResult)[0];
        if (!invitation || invitation.status !== 'PENDING') invalidInvitation();

        await client.query(`
          update moaon_control.invitations
          set status = 'REVOKED'
          where id = $1::uuid and tenant_id = $2::uuid and status = 'PENDING'
        `, [invitationId, tenantId]);
        await client.query(`
          insert into moaon_control.audit_events (
            id, tenant_id, actor_user_id, action, target_id, created_at
          ) values ($1::uuid, $2::uuid, $3::uuid, 'INVITATION_REVOKED', $4::uuid, $5::timestamptz)
        `, [randomUUID(), tenantId, session.userId, invitationId, new Date(databaseNow).toISOString()]);

        return Object.freeze({ invitationId, status: 'REVOKED' });
      });
    } catch (error) {
      safeError(error);
    }
  }

  async function updateMembership({
    sessionCredential,
    tenantId,
    targetUserId,
    expectedVersion,
    role,
    status,
  } = {}) {
    if (!validUuid(tenantId)) fail('TENANT_REQUIRED', 400, 'Tenant is required.');
    if (!validUuid(targetUserId)
      || !positiveInteger(expectedVersion)
      || !INVITATION_ROLES.has(role)
      || !MEMBERSHIP_STATUSES.has(status)) {
      fail('INVALID_INPUT', 400, 'Membership input is invalid.');
    }

    try {
      const session = await authenticate(sessionCredential);
      return await database.transaction(async client => {
        const tenant = await lockTenant(client, tenantId);
        const databaseNow = await databaseClock(client);
        ensureSessionFresh(session, databaseNow);
        if (tenant?.status !== 'ACTIVE') {
          fail('TENANT_ACCESS_DENIED', 403, 'Tenant access is denied.');
        }
        const actor = await readActorMembership(client, tenantId, session.userId);
        requireActiveOwner(actor);
        const target = targetUserId === session.userId
          ? actor
          : await readActorMembership(client, tenantId, targetUserId);

        if (!target) fail('MEMBERSHIP_NOT_FOUND', 404, 'Membership was not found.');
        if (target.version !== expectedVersion) {
          fail('MEMBERSHIP_VERSION_CONFLICT', 409, 'Membership version is stale.');
        }
        if (target.role === role && target.status === status) {
          fail('MEMBERSHIP_UNCHANGED', 409, 'Membership has no change.');
        }

        if (target.role === 'OWNER' && target.status === 'ACTIVE') {
          const otherOwners = await client.query(`
            select count(*)::integer as count
            from moaon_control.memberships
            where tenant_id = $1::uuid
              and user_id <> $2::uuid
              and role = 'OWNER'
              and status = 'ACTIVE'
          `, [tenantId, targetUserId]);
          if (rows(otherOwners)[0]?.count < 1) {
            fail('LAST_OWNER_REQUIRED', 409, 'At least one active owner is required.');
          }
        }

        const updated = await client.query(`
          update moaon_control.memberships
          set role = $1, status = $2, version = version + 1, updated_at = $3::timestamptz
          where tenant_id = $4::uuid and user_id = $5::uuid and version = $6
          returning tenant_id, user_id, role, status, version
        `, [
          role,
          status,
          new Date(databaseNow).toISOString(),
          tenantId,
          targetUserId,
          expectedVersion,
        ]);
        const membership = rows(updated)[0];
        if (!membership) {
          fail('MEMBERSHIP_VERSION_CONFLICT', 409, 'Membership version is stale.');
        }
        await client.query(`
          insert into moaon_control.audit_events (
            id, tenant_id, actor_user_id, action, target_id, created_at
          ) values ($1::uuid, $2::uuid, $3::uuid, 'MEMBERSHIP_UPDATED', $4::uuid, $5::timestamptz)
        `, [randomUUID(), tenantId, session.userId, targetUserId, new Date(databaseNow).toISOString()]);

        return Object.freeze({
          userId: membership.user_id,
          tenantId: membership.tenant_id,
          role: membership.role,
          status: membership.status,
          version: membership.version,
        });
      });
    } catch (error) {
      safeError(error);
    }
  }

  return Object.freeze({
    findMembership,
    createInvitation,
    acceptInvitation,
    revokeInvitation,
    updateMembership,
  });
}

module.exports = { createTenantControlStore, TenantControlStoreError };
