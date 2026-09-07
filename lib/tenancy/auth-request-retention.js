'use strict';

const {createBoundedAuthRpc} = require('./bounded-auth-rpc.js');

class AuthRequestRetentionError extends Error {
  constructor() {
    super('Authentication request retention is unavailable.');
    this.name = 'AuthRequestRetentionError';
    this.code = 'AUTH_REQUEST_RETENTION_UNAVAILABLE';
    this.status = 503;
  }
}

function isBoundedCount(value) {
  return Number.isInteger(value) && value >= 0 && value <= 500;
}

function validatedResult(data) {
  try {
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new TypeError();
    const keys = Reflect.ownKeys(data);
    if (keys.length !== 2 || !keys.includes('requestDeleted') || !keys.includes('ipDeleted')) {
      throw new TypeError();
    }
    const requestDeleted = data.requestDeleted;
    const ipDeleted = data.ipDeleted;
    if (!isBoundedCount(requestDeleted) || !isBoundedCount(ipDeleted)) throw new TypeError();
    return Object.freeze({requestDeleted, ipDeleted});
  } catch (_error) {
    throw new AuthRequestRetentionError();
  }
}

function createAuthRequestRetention({rpcClient, timeoutMs = 10000} = {}) {
  const transport = createBoundedAuthRpc({
    rpcClient,
    timeoutMs,
    errorFactory: () => new AuthRequestRetentionError(),
  });

  async function prune(...args) {
    if (args.length !== 0) throw new TypeError('Auth request retention accepts no arguments.');
    const data = await transport.call('moaon_prune_auth_request_limits');
    return validatedResult(data);
  }

  return Object.freeze({prune});
}

module.exports = {createAuthRequestRetention, AuthRequestRetentionError};
