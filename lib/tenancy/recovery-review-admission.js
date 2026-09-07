'use strict';

const {createBoundedAuthRpc} = require('./bounded-auth-rpc.js');

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MODES = new Set(['inspect', 'resolve']);

class RecoveryReviewAdmissionError extends Error {
  constructor() {
    super('Recovery review admission is unavailable.');
    this.name = 'RecoveryReviewAdmissionError';
    this.code = 'RECOVERY_REVIEW_UNAVAILABLE';
    this.status = 503;
  }
}

function unavailable() {
  return new RecoveryReviewAdmissionError();
}

function readOwn(value, expected) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  let keys;
  try { keys = Reflect.ownKeys(value); } catch (_error) { return null; }
  if (keys.length !== expected.length || expected.some(key => !keys.includes(key))) return null;
  const copy = {};
  try { for (const key of expected) copy[key] = value[key]; } catch (_error) { return null; }
  return copy;
}

function normalizedUuid(value) {
  return typeof value === 'string' && UUID.test(value) ? value.toLowerCase() : null;
}

function createRecoveryReviewAdmission(options) {
  const expected = options && typeof options === 'object' && Object.hasOwn(options, 'timeoutMs')
    ? ['rpcClient', 'timeoutMs'] : ['rpcClient'];
  const config = readOwn(options, expected);
  if (!config) throw new TypeError('Explicit recovery review admission server dependencies are required.');
  const timeoutMs = expected.includes('timeoutMs') ? config.timeoutMs : 10_000;
  const transport = createBoundedAuthRpc({rpcClient: config.rpcClient, timeoutMs, errorFactory: unavailable});

  return async function admitRecoveryReview(value) {
    const copy = readOwn(value, ['operatorId', 'sessionId', 'mode']);
    const operatorId = normalizedUuid(copy?.operatorId);
    const sessionId = normalizedUuid(copy?.sessionId);
    if (!operatorId || !sessionId || !MODES.has(copy?.mode)) {
      throw new TypeError('Exact recovery review admission identifiers and mode are required.');
    }
    const allowed = await transport.call('moaon_consume_recovery_review', {
      p_operator_id: operatorId,
      p_session_id: sessionId,
      p_mode: copy.mode,
    });
    if (allowed !== true && allowed !== false) throw unavailable();
    return Object.freeze({allowed});
  };
}

module.exports = {createRecoveryReviewAdmission, RecoveryReviewAdmissionError};
