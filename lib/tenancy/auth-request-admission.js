'use strict';

const {createHmac} = require('node:crypto');
const {createBoundedAuthRpc} = require('./bounded-auth-rpc.js');
const {
  createAuthRequestLimit,
  AuthRequestLimitError,
  validateAuthHmacKey,
  validateAuthRequestInput,
} = require('./auth-request-limit.js');
const {canonicalizeTrustedClientIp} = require('./auth-client-ip.js');

function createAuthRequestAdmission({
  rpcClient,
  hmacKey,
  trustedClientIp,
  timeoutMs = 10000,
} = {}) {
  validateAuthHmacKey(hmacKey);
  const canonicalIp = canonicalizeTrustedClientIp(trustedClientIp);
  const subjectLimit = createAuthRequestLimit({rpcClient, hmacKey, timeoutMs});
  const transport = createBoundedAuthRpc({
    rpcClient,
    timeoutMs,
    errorFactory: () => new AuthRequestLimitError(),
  });
  const ipHash = createHmac('sha256', hmacKey)
    .update(JSON.stringify(['CLIENT_IP', canonicalIp]))
    .digest('hex');

  return async function requestLimit(input) {
    const {kind, subject} = validateAuthRequestInput(input);
    const admitted = await transport.call('moaon_consume_auth_admission', {
      p_ip_hash: ipHash,
    });
    if (admitted !== true && admitted !== false) throw new AuthRequestLimitError();
    if (admitted === false) return Object.freeze({allowed: false});
    return subjectLimit({kind, subject});
  };
}

module.exports = {createAuthRequestAdmission, AuthRequestLimitError};
