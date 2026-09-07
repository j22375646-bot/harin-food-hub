'use strict';

const {createCipheriv, createDecipheriv, randomBytes} = require('node:crypto');
const {StepUpProviderError} = require('./supabase-step-up-provider.js');

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TOKEN_HASH = /^[0-9a-f]{64}$/;
const KEY_ID = /^[A-Za-z0-9_-]{1,64}$/;
const MAX_TOKEN = 16_384;
const EVIDENCE_MS = 300_000;
const CONFIGURATION_ERROR = 'Exact step-up storage configuration is required.';
const ISSUE_ERROR = 'Exact step-up issue input is required.';
const IDENTITY_ERROR = 'Exact step-up identity is required.';
const REVOKE_ERROR = 'Exact step-up revocation input is required.';

class StepUpStorageError extends Error {
  constructor(code) {
    const required = code === 'STEP_UP_REQUIRED';
    super(required ? 'Step-up verification is required.' : 'Step-up storage is unavailable.');
    this.name = 'StepUpStorageError';
    this.code = required ? 'STEP_UP_REQUIRED' : 'STEP_UP_UNAVAILABLE';
    this.status = required ? 403 : 503;
  }
}

function required() { return new StepUpStorageError('STEP_UP_REQUIRED'); }
function unavailable() { return new StepUpStorageError('STEP_UP_UNAVAILABLE'); }
function isObject(value) { return value !== null && typeof value === 'object' && !Array.isArray(value); }
function exactCopy(value, allowed, requiredKeys, message) {
  if (!isObject(value)) throw new TypeError(message);
  try {
    const keys = Reflect.ownKeys(value);
    if (keys.some(key => typeof key !== 'string' || !allowed.includes(key))
      || requiredKeys.some(key => !keys.includes(key))) throw new TypeError(message);
    const copy = {};
    for (const key of keys) copy[key] = value[key];
    return copy;
  } catch (_error) {
    throw new TypeError(message);
  }
}
function uuid(value) { return typeof value === 'string' && UUID.test(value) ? value.toLowerCase() : null; }
function strictString(value, maximum) {
  return typeof value === 'string' && value.length > 0 && value.length <= maximum && value === value.trim();
}
function canonicalIso(value) {
  if (typeof value !== 'string') return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && new Date(parsed).toISOString() === value ? parsed : null;
}
function currentTime(now) {
  let value;
  try { value = now(); } catch (_error) { throw unavailable(); }
  if (typeof value !== 'number' || !Number.isFinite(value)) throw unavailable();
  return value;
}
function serverOnly(message) {
  if (typeof window !== 'undefined' || typeof document !== 'undefined') throw new TypeError(message);
}
function frozenProof(copy) {
  return Object.freeze({
    userId: copy.userId,
    sessionId: copy.sessionId,
    method: copy.method,
    verifiedAt: copy.verifiedAt,
    expiresAt: copy.expiresAt,
  });
}
function validateProof(value, identity, nowMs, unavailableOnMalformed = true) {
  let copy;
  try {
    copy = exactCopy(value, ['userId', 'sessionId', 'method', 'verifiedAt', 'expiresAt'],
      ['userId', 'sessionId', 'method', 'verifiedAt', 'expiresAt'], 'Malformed proof.');
  } catch (_error) {
    throw unavailableOnMalformed ? unavailable() : required();
  }
  const userId = uuid(copy.userId);
  const sessionId = uuid(copy.sessionId);
  const verifiedMs = canonicalIso(copy.verifiedAt);
  const expiresMs = canonicalIso(copy.expiresAt);
  if (!userId || !sessionId || copy.method !== 'mfa' || verifiedMs === null || expiresMs === null) throw unavailable();
  if (userId !== identity.userId || sessionId !== identity.sessionId
    || verifiedMs > nowMs || nowMs - verifiedMs >= EVIDENCE_MS || expiresMs <= nowMs
    || expiresMs > verifiedMs + EVIDENCE_MS) throw required();
  return frozenProof({...copy, userId, sessionId});
}
function validateEnvelope(value) {
  let copy;
  try {
    copy = exactCopy(value, ['v', 'keyId', 'iv', 'ciphertext', 'tag'],
      ['v', 'keyId', 'iv', 'ciphertext', 'tag'], 'Malformed envelope.');
  } catch (_error) { throw unavailable(); }
  if (copy.v !== 1 || typeof copy.keyId !== 'string' || !KEY_ID.test(copy.keyId)) throw unavailable();
  for (const [name, bytes] of [['iv', 12], ['tag', 16]]) {
    if (typeof copy[name] !== 'string' || !/^[A-Za-z0-9_-]+$/.test(copy[name])) throw unavailable();
    const decoded = Buffer.from(copy[name], 'base64url');
    if (decoded.length !== bytes || decoded.toString('base64url') !== copy[name]) throw unavailable();
  }
  if (typeof copy.ciphertext !== 'string' || copy.ciphertext.length < 1 || copy.ciphertext.length > 50000
    || !/^[A-Za-z0-9_-]+$/.test(copy.ciphertext)) throw unavailable();
  const decoded = Buffer.from(copy.ciphertext, 'base64url');
  if (!decoded.length || decoded.toString('base64url') !== copy.ciphertext) throw unavailable();
  return copy;
}
function aadFor(keyId, identity) {
  return Buffer.from(JSON.stringify(['moaon-step-up-v1', keyId, identity.userId, identity.sessionId,
    identity.operationId, identity.providerSessionId, identity.factorId]));
}
function sealSession(key, keyId, identity, session) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv, {authTagLength: 16});
  cipher.setAAD(aadFor(keyId, identity));
  const plaintext = Buffer.from(JSON.stringify({accessToken: session.accessToken, refreshToken: session.refreshToken}));
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return Object.freeze({
    v: 1,
    keyId,
    iv: iv.toString('base64url'),
    ciphertext: ciphertext.toString('base64url'),
    tag: cipher.getAuthTag().toString('base64url'),
  });
}
function openSession(key, expectedKeyId, identity, envelope) {
  const sealed = validateEnvelope(envelope);
  if (sealed.keyId !== expectedKeyId) throw unavailable();
  try {
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(sealed.iv, 'base64url'), {authTagLength: 16});
    decipher.setAAD(aadFor(sealed.keyId, identity));
    decipher.setAuthTag(Buffer.from(sealed.tag, 'base64url'));
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(sealed.ciphertext, 'base64url')),
      decipher.final(),
    ]).toString('utf8');
    const decoded = JSON.parse(plaintext);
    const copy = exactCopy(decoded, ['accessToken', 'refreshToken'], ['accessToken', 'refreshToken'], 'Malformed session.');
    if (!strictString(copy.accessToken, MAX_TOKEN) || !strictString(copy.refreshToken, MAX_TOKEN)) throw unavailable();
    return Object.freeze({accessToken: copy.accessToken, refreshToken: copy.refreshToken});
  } catch (_error) { throw unavailable(); }
}
function rpcResponse(value) {
  let copy;
  try {
    copy = exactCopy(value, ['data', 'error', 'count', 'status', 'statusText'], ['data', 'error'], 'Malformed RPC response.');
  } catch (_error) { throw unavailable(); }
  if (copy.error !== null && copy.error !== undefined) {
    let error;
    try { error = exactCopy(copy.error, ['code', 'message', 'details', 'hint'], ['code', 'message'], 'Malformed RPC error.'); }
    catch (_error) { throw unavailable(); }
    if (error.code === 'P0001' && error.message === 'STEP_UP_REQUIRED') throw required();
    throw unavailable();
  }
  return copy.data;
}

function createDeadline(timeoutMs, now) {
  const startedAt = currentTime(now);
  const expiresAt = startedAt + timeoutMs;
  if (!Number.isFinite(expiresAt) || expiresAt <= startedAt) throw unavailable();
  let closed = false;
  function remaining() {
    const value = currentTime(now);
    if (closed || value < startedAt || value >= expiresAt) throw unavailable();
    return Math.max(1, Math.ceil(expiresAt - value));
  }
  return Object.freeze({
    checkpoint: remaining,
    async dispatch(operation) {
      const wait = remaining();
      let timer;
      try {
        const value = await Promise.race([
          Promise.resolve().then(operation),
          new Promise((_resolve, reject) => { timer = setTimeout(() => { closed = true; reject(unavailable()); }, wait); }),
        ]);
        remaining();
        return value;
      } finally { clearTimeout(timer); }
    },
    close() { closed = true; },
  });
}

function createStepUpStorage(configuration) {
  serverOnly(CONFIGURATION_ERROR);
  const config = exactCopy(configuration,
    ['rpcClient', 'provider', 'encryptionKey', 'keyId', 'timeoutMs', 'now'],
    ['rpcClient', 'provider', 'encryptionKey', 'keyId'], CONFIGURATION_ERROR);
  const rpcHost = config.rpcClient;
  const providerHost = config.provider;
  let rpc;
  let verifyTotp;
  try {
    if (!isObject(rpcHost) || !isObject(providerHost)) throw new TypeError(CONFIGURATION_ERROR);
    rpc = rpcHost.rpc;
    verifyTotp = providerHost.verifyTotp;
  } catch (_error) { throw new TypeError(CONFIGURATION_ERROR); }
  const timeoutMs = config.timeoutMs === undefined ? 10_000 : config.timeoutMs;
  const now = config.now === undefined ? Date.now : config.now;
  if (typeof rpc !== 'function' || typeof verifyTotp !== 'function'
    || typeof config.encryptionKey !== 'string' || !/^[0-9a-f]{64}$/.test(config.encryptionKey)
    || typeof config.keyId !== 'string' || !KEY_ID.test(config.keyId)
    || !Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 30_000 || typeof now !== 'function') {
    throw new TypeError(CONFIGURATION_ERROR);
  }
  const key = Buffer.from(config.encryptionKey, 'hex');

  function identityInput(value) {
    const copy = exactCopy(value, ['userId', 'sessionId'], ['userId', 'sessionId'], IDENTITY_ERROR);
    const userId = uuid(copy.userId);
    const sessionId = uuid(copy.sessionId);
    if (!userId || !sessionId) throw new TypeError(IDENTITY_ERROR);
    return {userId, sessionId};
  }
  async function callRpc(deadline, name, args) {
    let response;
    try { response = await deadline.dispatch(() => rpc.call(rpcHost, name, Object.freeze(args))); }
    catch (error) {
      if (error instanceof StepUpStorageError) throw error;
      throw unavailable();
    }
    return rpcResponse(response);
  }
  function readResult(value, identity, includeSession, nowMs) {
    if (value === null || value === undefined) throw required();
    let copy;
    try {
      copy = exactCopy(value, ['proof', 'operationId', 'providerSessionId', 'factorId', 'sealedSession'],
        ['proof', 'operationId', 'providerSessionId', 'factorId', 'sealedSession'], 'Malformed read result.');
    } catch (_error) { throw unavailable(); }
    const operationId = uuid(copy.operationId);
    const providerSessionId = uuid(copy.providerSessionId);
    const factorId = uuid(copy.factorId);
    if (!operationId || !providerSessionId || !factorId
      || (!includeSession && copy.sealedSession !== null) || (includeSession && copy.sealedSession === null)) throw unavailable();
    return {
      proof: validateProof(copy.proof, identity, nowMs),
      operationId,
      providerSessionId,
      factorId,
      sealedSession: copy.sealedSession,
    };
  }

  async function issue(candidate) {
    serverOnly('Step-up storage is server-only.');
    const input = exactCopy(candidate,
      ['userId', 'sessionId', 'tokenHash', 'operationId', 'accessToken', 'refreshToken', 'factorId', 'code'],
      ['userId', 'sessionId', 'tokenHash', 'operationId', 'accessToken', 'refreshToken', 'factorId', 'code'], ISSUE_ERROR);
    input.userId = uuid(input.userId);
    input.sessionId = uuid(input.sessionId);
    input.operationId = uuid(input.operationId);
    input.factorId = uuid(input.factorId);
    if (!input.userId || !input.sessionId || !input.operationId || !input.factorId
      || typeof input.tokenHash !== 'string' || !TOKEN_HASH.test(input.tokenHash)
      || !strictString(input.accessToken, MAX_TOKEN) || !strictString(input.refreshToken, MAX_TOKEN)
      || typeof input.code !== 'string' || !/^\d{6}$/.test(input.code)) throw new TypeError(ISSUE_ERROR);
    const deadline = createDeadline(timeoutMs, now);
    try {
      const begin = await callRpc(deadline, 'moaon_begin_step_up', {
        p_user_id: input.userId, p_session_id: input.sessionId,
        p_token_hash: input.tokenHash, p_operation_id: input.operationId,
      });
      let beginCopy;
      try {
        beginCopy = exactCopy(begin, ['operationId', 'startedAt', 'expiresAt'],
          ['operationId', 'startedAt', 'expiresAt'], 'Malformed begin result.');
      } catch (_error) { throw unavailable(); }
      const beginOperation = uuid(beginCopy.operationId);
      const beginStartedMs = canonicalIso(beginCopy.startedAt);
      const beginExpiresMs = canonicalIso(beginCopy.expiresAt);
      const beginNow = currentTime(now);
      if (beginOperation !== input.operationId || beginStartedMs === null || beginExpiresMs === null
        || beginStartedMs > beginNow || beginExpiresMs <= beginNow || beginExpiresMs > beginStartedMs + 60_000) throw unavailable();

      let providerValue;
      try {
        providerValue = await deadline.dispatch(() => verifyTotp.call(providerHost, Object.freeze({
          userId: input.userId, accessToken: input.accessToken, refreshToken: input.refreshToken,
          factorId: input.factorId, code: input.code,
        })));
      } catch (error) {
        if (error instanceof StepUpStorageError) throw error;
        if (error instanceof StepUpProviderError && error.code === 'STEP_UP_REJECTED') throw required();
        throw unavailable();
      }
      let providerCopy;
      let evidence;
      let session;
      try {
        providerCopy = exactCopy(providerValue, ['evidence', 'session'], ['evidence', 'session'], 'Malformed provider result.');
        evidence = exactCopy(providerCopy.evidence,
          ['userId', 'providerSessionId', 'factorId', 'method', 'verifiedAt', 'expiresAt'],
          ['userId', 'providerSessionId', 'factorId', 'method', 'verifiedAt', 'expiresAt'], 'Malformed provider evidence.');
        session = exactCopy(providerCopy.session, ['accessToken', 'refreshToken'], ['accessToken', 'refreshToken'], 'Malformed provider session.');
      } catch (_error) { throw unavailable(); }
      evidence.userId = uuid(evidence.userId);
      evidence.providerSessionId = uuid(evidence.providerSessionId);
      evidence.factorId = uuid(evidence.factorId);
      const verifiedMs = canonicalIso(evidence.verifiedAt);
      const providerExpiresMs = canonicalIso(evidence.expiresAt);
      const providerNow = currentTime(now);
      if (evidence.userId !== input.userId || !evidence.providerSessionId || evidence.factorId !== input.factorId
        || evidence.method !== 'mfa' || verifiedMs === null || providerExpiresMs === null
        || verifiedMs < Math.floor(beginStartedMs / 1000) * 1000 || verifiedMs > providerNow
        || providerNow - verifiedMs >= EVIDENCE_MS || providerExpiresMs <= providerNow
        || providerExpiresMs > verifiedMs + EVIDENCE_MS || !strictString(session.accessToken, MAX_TOKEN)
        || !strictString(session.refreshToken, MAX_TOKEN)) throw unavailable();
      deadline.checkpoint();
      if (currentTime(now) >= beginExpiresMs) throw unavailable();
      const sealed = sealSession(key, config.keyId, {
        userId: input.userId, sessionId: input.sessionId, operationId: input.operationId,
        providerSessionId: evidence.providerSessionId, factorId: evidence.factorId,
      }, session);
      const committed = await callRpc(deadline, 'moaon_commit_step_up', {
        p_user_id: input.userId,
        p_session_id: input.sessionId,
        p_token_hash: input.tokenHash,
        p_operation_id: input.operationId,
        p_provider_session_id: evidence.providerSessionId,
        p_factor_id: evidence.factorId,
        p_verified_at: evidence.verifiedAt,
        p_expires_at: evidence.expiresAt,
        p_sealed_session: sealed,
      });
      const proof = validateProof(committed, {userId: input.userId, sessionId: input.sessionId}, currentTime(now));
      if (proof.verifiedAt !== evidence.verifiedAt || Date.parse(proof.expiresAt) > providerExpiresMs) throw unavailable();
      return proof;
    } finally { deadline.close(); }
  }

  async function read(identityCandidate, includeSession) {
    serverOnly('Step-up storage is server-only.');
    const identity = identityInput(identityCandidate);
    const deadline = createDeadline(timeoutMs, now);
    try {
      const value = await callRpc(deadline, 'moaon_read_step_up', {
        p_user_id: identity.userId,
        p_session_id: identity.sessionId,
        p_include_session: includeSession,
      });
      return readResult(value, identity, includeSession, currentTime(now));
    } finally { deadline.close(); }
  }

  async function verifyStepUp(identity) {
    return (await read(identity, false)).proof;
  }

  async function loadSession(identity) {
    const value = await read(identity, true);
    return openSession(key, config.keyId, {
      userId: value.proof.userId,
      sessionId: value.proof.sessionId,
      operationId: value.operationId,
      providerSessionId: value.providerSessionId,
      factorId: value.factorId,
    }, value.sealedSession);
  }

  async function revoke(candidate) {
    serverOnly('Step-up storage is server-only.');
    const input = exactCopy(candidate, ['userId', 'sessionId', 'tokenHash'],
      ['userId', 'sessionId', 'tokenHash'], REVOKE_ERROR);
    input.userId = uuid(input.userId);
    input.sessionId = uuid(input.sessionId);
    if (!input.userId || !input.sessionId || typeof input.tokenHash !== 'string' || !TOKEN_HASH.test(input.tokenHash)) {
      throw new TypeError(REVOKE_ERROR);
    }
    const deadline = createDeadline(timeoutMs, now);
    try {
      const value = await callRpc(deadline, 'moaon_revoke_step_up', {
        p_user_id: input.userId, p_session_id: input.sessionId, p_token_hash: input.tokenHash,
      });
      if (value !== true) throw unavailable();
      return true;
    } finally { deadline.close(); }
  }

  return Object.freeze({issue, verifyStepUp, loadSession, revoke});
}

module.exports = {createStepUpStorage, StepUpStorageError};
