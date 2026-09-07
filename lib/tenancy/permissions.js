'use strict';

const { isTenantContext } = require('./context.js');

const ACTION_ROLES = new Map([
  ['workspace.read', new Set(['OWNER', 'OPERATOR', 'VIEWER'])],
  ['orders.write', new Set(['OWNER', 'OPERATOR'])],
  ['connections.manage', new Set(['OWNER'])],
  ['members.manage', new Set(['OWNER'])],
]);

class PermissionError extends Error {
  constructor() {
    super('Permission is denied.');
    this.name = 'PermissionError';
    this.code = 'PERMISSION_DENIED';
    this.status = 403;
  }
}

/** Authorizes one action against a context issued for the current server request. */
function authorizeAction(context, action) {
  const allowedRoles = typeof action === 'string' ? ACTION_ROLES.get(action) : undefined;
  if (!isTenantContext(context) || !allowedRoles || !allowedRoles.has(context.role)) {
    throw new PermissionError();
  }
  return true;
}

module.exports = { authorizeAction, PermissionError };
