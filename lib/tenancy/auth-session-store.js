'use strict';

/**
 * Server-only candidate RPC transport; not an authentication authority or route.
 * The caller must authenticate the provider identity before issuing a session,
 * and confirm password update AND provider-session revocation before completion.
 * Never forward client-supplied identities directly to these methods.
 * Production legacy login is intentionally not wired to this candidate yet.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

class AuthSessionStoreError extends Error {
  constructor(code = 'AUTH_TRANSITION_UNAVAILABLE') {
    super(code === 'AUTH_TRANSITION_REJECTED'
      ? '로그인 상태 변경이 허용되지 않습니다.'
      : '로그인 상태 변경 결과를 확인할 수 없습니다. 자동으로 재시도하지 마세요.');
    this.name = 'AuthSessionStoreError';
    this.code = code;
  }
}

function uuid(value) {
  if (typeof value !== 'string' || !UUID.test(value)) throw new TypeError('A valid UUID is required.');
  return value;
}

function createAuthSessionStore({rpcClient, timeoutMs = 10000} = {}) {
  if (!rpcClient || typeof rpcClient.rpc !== 'function'
    || !Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 30000) {
    throw new TypeError('An explicit server RPC client and bounded timeout are required.');
  }
  const rpc = rpcClient.rpc.bind(rpcClient);
  async function call(name, args) {
    let timer;
    try {
      // A timeout does not cancel an already committed DB operation. No retries,
      // compensating unlocks, or provider writes are attempted by this transport.
      const result = await Promise.race([
        Promise.resolve().then(() => rpc(name, args)),
        new Promise((_, reject) => {timer = setTimeout(() => reject(new AuthSessionStoreError()), timeoutMs);}),
      ]);
      if (result?.error?.code === 'P0001' && result.error.message === 'AUTH_TRANSITION_REJECTED') {
        throw new AuthSessionStoreError('AUTH_TRANSITION_REJECTED');
      }
      if (result?.error || result?.data !== true) throw new AuthSessionStoreError();
      return true;
    } catch (error) {
      if (error instanceof AuthSessionStoreError) throw error;
      throw new AuthSessionStoreError();
    } finally { clearTimeout(timer); }
  }
  return Object.freeze({
    async beginLogin({userId, ticketId}) {
      return call('moaon_begin_login', {p_user_id:uuid(userId),p_ticket_id:uuid(ticketId)});
    },
    async issueSession({userId, ticketId, sessionId, tokenHash, expiresAt}) {
      if (typeof tokenHash !== 'string' || !/^[0-9a-f]{64}$/.test(tokenHash)
        || typeof expiresAt !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(expiresAt)
        || !Number.isFinite(Date.parse(expiresAt)) || new Date(expiresAt).toISOString() !== expiresAt) {
        throw new TypeError('A token hash and valid UTC session expiry are required.');
      }
      return call('moaon_issue_session', {
        p_user_id:uuid(userId),p_ticket_id:uuid(ticketId),p_session_id:uuid(sessionId),
        p_token_hash:tokenHash,p_expires_at:expiresAt,
      });
    },
    async beginPasswordChange({userId, operationId}) {
      return call('moaon_begin_password_change', {p_user_id:uuid(userId),p_operation_id:uuid(operationId)});
    },
    async completePasswordChange({userId, operationId}) {
      return call('moaon_complete_password_change', {p_user_id:uuid(userId),p_operation_id:uuid(operationId)});
    },
  });
}

module.exports = {createAuthSessionStore, AuthSessionStoreError};
