'use strict';

const {createBoundedAuthRpc} = require('./bounded-auth-rpc.js');

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const VERSION = /^[0-9a-f]{64}$/;
const ACTIONS = new Set(['CONFIRM_COMPLETED', 'CLOSE_NOT_STARTED']);
const STATUSES = new Set(['PENDING', 'REVIEW_REQUIRED', 'COMPLETED', 'REJECTED']);
const STAGES = new Set(['FENCE_BEGIN', 'PASSWORD_UPDATE', 'PROVIDER_SIGNOUT', 'IDENTITY_RECHECK', 'FENCE_COMPLETE']);
const DECISIONS = new Set(['ALREADY_CLOSED', 'CHECK_REQUIRED', 'KEEP_BLOCKED', 'CONFIRM_COMPLETED', 'CLOSE_NOT_STARTED']);
const RESOLUTION_STATUS = Object.freeze({CONFIRM_COMPLETED: 'COMPLETED', CLOSE_NOT_STARTED: 'REJECTED'});

class RecoveryReviewResolutionError extends Error {
  constructor() {
    super('Recovery review resolution is unavailable.');
    this.name = 'RecoveryReviewResolutionError';
    this.code = 'RECOVERY_REVIEW_RESOLUTION_UNAVAILABLE';
    this.status = 503;
  }
}

function unavailable() {
  return new RecoveryReviewResolutionError();
}

function hasExactOwnKeys(value, expected) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  try {
    const keys = Reflect.ownKeys(value);
    return keys.length === expected.length && expected.every(key => keys.includes(key));
  } catch (_error) {
    return false;
  }
}

function readOwn(value, expected) {
  if (!hasExactOwnKeys(value, expected)) return null;
  const copy = {};
  try {
    for (const key of expected) copy[key] = value[key];
  } catch (_error) {
    return null;
  }
  return copy;
}

function normalizedUuid(value) {
  return typeof value === 'string' && UUID.test(value) ? value.toLowerCase() : null;
}

function invalidInput() {
  throw new TypeError('Exact recovery review resolution identifiers and action are required.');
}

function inspectInput(value) {
  const copy = readOwn(value, ['userId', 'operationId']);
  if (!copy) invalidInput();
  const userId = normalizedUuid(copy.userId);
  const operationId = normalizedUuid(copy.operationId);
  if (!userId || !operationId) invalidInput();
  return {userId, operationId};
}

function resolveInput(value) {
  const copy = readOwn(value, ['userId', 'operationId', 'resolutionId', 'expectedVersion', 'action']);
  if (!copy) invalidInput();
  const userId = normalizedUuid(copy.userId);
  const operationId = normalizedUuid(copy.operationId);
  const resolutionId = normalizedUuid(copy.resolutionId);
  if (!userId || !operationId || !resolutionId
    || typeof copy.expectedVersion !== 'string' || !VERSION.test(copy.expectedVersion)
    || !ACTIONS.has(copy.action)) invalidInput();
  return {userId, operationId, resolutionId, expectedVersion: copy.expectedVersion, action: copy.action};
}

function inspectResult(value, request) {
  const copy = readOwn(value, ['userId', 'operationId', 'status', 'stage', 'version', 'decision']);
  if (!copy) throw unavailable();
  const userId = normalizedUuid(copy.userId);
  const operationId = normalizedUuid(copy.operationId);
  const terminal = copy.status === 'COMPLETED' || copy.status === 'REJECTED';
  const stageCompatible = copy.status === 'PENDING'
    ? copy.stage === null
    : copy.status === 'REVIEW_REQUIRED'
      ? STAGES.has(copy.stage)
      : terminal && (copy.stage === null || STAGES.has(copy.stage));
  const decisionCompatible = terminal
    ? copy.decision === 'ALREADY_CLOSED'
    : STATUSES.has(copy.status) && DECISIONS.has(copy.decision) && copy.decision !== 'ALREADY_CLOSED';
  if (userId !== request.userId || operationId !== request.operationId
    || !stageCompatible || !decisionCompatible
    || typeof copy.version !== 'string' || !VERSION.test(copy.version)) throw unavailable();
  return Object.freeze({
    userId,
    operationId,
    status: copy.status,
    stage: copy.stage,
    version: copy.version,
    decision: copy.decision,
  });
}

function resolutionResult(value, request) {
  const copy = readOwn(value, ['userId', 'operationId', 'resolutionId', 'status']);
  if (!copy) throw unavailable();
  const userId = normalizedUuid(copy.userId);
  const operationId = normalizedUuid(copy.operationId);
  const resolutionId = normalizedUuid(copy.resolutionId);
  if (userId !== request.userId || operationId !== request.operationId
    || resolutionId !== request.resolutionId || copy.status !== RESOLUTION_STATUS[request.action]) {
    throw unavailable();
  }
  return Object.freeze({userId, operationId, resolutionId, status: copy.status});
}

function createRecoveryReviewResolver(options) {
  const optionKeys = options && typeof options === 'object' && Object.hasOwn(options, 'timeoutMs')
    ? ['rpcClient', 'operatorId', 'timeoutMs']
    : ['rpcClient', 'operatorId'];
  const config = readOwn(options, optionKeys);
  if (!config) throw new TypeError('Explicit recovery review resolver server dependencies are required.');
  const operatorId = normalizedUuid(config.operatorId);
  if (!operatorId) throw new TypeError('A trusted recovery review operator is required.');
  const timeoutMs = optionKeys.includes('timeoutMs') ? config.timeoutMs : 10000;
  const transport = createBoundedAuthRpc({
    rpcClient: config.rpcClient,
    timeoutMs,
    errorFactory: unavailable,
  });

  return Object.freeze({
    async inspect(value) {
      const request = inspectInput(value);
      const data = await transport.call('moaon_inspect_recovery_review', {
        p_operator_id: operatorId,
        p_user_id: request.userId,
        p_operation_id: request.operationId,
      });
      try {
        return inspectResult(data, request);
      } catch (_error) {
        throw unavailable();
      }
    },
    async resolve(value) {
      const request = resolveInput(value);
      const data = await transport.call('moaon_resolve_recovery_review', {
        p_operator_id: operatorId,
        p_user_id: request.userId,
        p_operation_id: request.operationId,
        p_resolution_id: request.resolutionId,
        p_expected_version: request.expectedVersion,
        p_action: request.action,
      });
      try {
        return resolutionResult(data, request);
      } catch (_error) {
        throw unavailable();
      }
    },
  });
}

module.exports = {createRecoveryReviewResolver, RecoveryReviewResolutionError};
