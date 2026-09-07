'use strict';

const issuedContexts = new WeakSet();
const ROLES = new Set(['OWNER', 'OPERATOR', 'VIEWER']);

class TenantContextError extends Error {
  constructor(code, status, message) {
    super(message);
    this.name = 'TenantContextError';
    this.code = code;
    this.status = status;
  }
}

function fail(code, status, message) {
  throw new TenantContextError(code, status, message);
}

function presentString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function sessionIsValid(session, currentTime) {
  if (!session || typeof session !== 'object') return false;
  if (!presentString(session.id) || !presentString(session.userId)) return false;
  if (!presentString(session.expiresAt)) return false;
  const expiresAt = Date.parse(session.expiresAt);
  return Number.isFinite(expiresAt) && expiresAt > currentTime;
}

function membershipIsValid(membership, userId, tenantId) {
  return Boolean(
    membership
    && typeof membership === 'object'
    && membership.userId === userId
    && membership.tenantId === tenantId
    && membership.status === 'ACTIVE'
    && ROLES.has(membership.role)
    && Number.isInteger(membership.version)
    && membership.version > 0
  );
}

/**
 * Resolves a fresh tenant context for one server request.
 * Do not cache or retain the returned context beyond that request.
 */
async function resolveTenantContext(input = {}, dependencies = {}) {
  const { session, requestedTenantId } = input || {};
  const currentTime = dependencies.now instanceof Function
    ? new Date(dependencies.now()).getTime()
    : Number.NaN;

  if (!sessionIsValid(session, currentTime)) {
    fail('AUTH_REQUIRED', 401, 'Authentication is required.');
  }
  if (!presentString(requestedTenantId)) {
    fail('TENANT_REQUIRED', 400, 'Tenant is required.');
  }

  let membership;
  try {
    membership = await dependencies.findMembership({
      userId: session.userId,
      tenantId: requestedTenantId,
    });
  } catch (_error) {
    fail('TENANT_LOOKUP_FAILED', 503, 'Tenant membership lookup failed.');
  }

  if (!membershipIsValid(membership, session.userId, requestedTenantId)) {
    fail('TENANT_ACCESS_DENIED', 403, 'Tenant access is denied.');
  }

  const context = Object.freeze({
    userId: session.userId,
    sessionId: session.id,
    tenantId: requestedTenantId,
    role: membership.role,
    membershipVersion: membership.version,
  });
  issuedContexts.add(context);
  return context;
}

function isTenantContext(value) {
  return Boolean(value && typeof value === 'object' && issuedContexts.has(value));
}

module.exports = { resolveTenantContext, isTenantContext, TenantContextError };
