'use strict';

const {createHmac} = require('node:crypto');
const {createBoundedAuthRpc} = require('./bounded-auth-rpc.js');

const KINDS = new Set(['LOGIN', 'RECOVERY_MAIL', 'RECOVERY_COMPLETE', 'EMAIL_CONFIRM']);

class AuthRequestLimitError extends Error {
  constructor() {
    super('Authentication request limit is unavailable.');
    this.name = 'AuthRequestLimitError';
    this.code = 'AUTH_REQUEST_LIMIT_UNAVAILABLE';
    this.status = 503;
  }
}

function validateAuthHmacKey(hmacKey) {
  const keyBytes = typeof hmacKey === 'string' ? Buffer.byteLength(hmacKey, 'utf8') : 0;
  if (typeof hmacKey !== 'string' || keyBytes < 32 || keyBytes > 1024) {
    throw new TypeError('An explicit bounded UTF-8 HMAC key is required.');
  }
  return hmacKey;
}

function validateAuthRequestInput({kind, subject} = {}) {
  if (!KINDS.has(kind)) throw new TypeError('A supported auth request kind is required.');
  if (typeof subject !== 'string' || subject.length < 1 || subject.length > 4096) {
    throw new TypeError('A nonempty bounded auth request subject is required.');
  }
  return {kind, subject};
}

function createAuthRequestLimit({rpcClient, hmacKey, timeoutMs = 10000} = {}) {
  validateAuthHmacKey(hmacKey);
  const transport = createBoundedAuthRpc({
    rpcClient,
    timeoutMs,
    errorFactory: () => new AuthRequestLimitError(),
  });
  return async function requestLimit(input) {
    const {kind, subject} = validateAuthRequestInput(input);
    const subjectHash = createHmac('sha256', hmacKey)
      .update(JSON.stringify([kind, subject]))
      .digest('hex');
    const data = await transport.call('moaon_consume_auth_request', {
      p_kind: kind,
      p_subject_hash: subjectHash,
    });
    if (data !== true && data !== false) throw new AuthRequestLimitError();
    return Object.freeze({allowed: data});
  };
}

module.exports = {
  createAuthRequestLimit,
  AuthRequestLimitError,
  validateAuthHmacKey,
  validateAuthRequestInput,
};
