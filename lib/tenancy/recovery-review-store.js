'use strict';

const {createBoundedAuthRpc} = require('./bounded-auth-rpc.js');

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const UTC_MILLISECONDS = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const STAGES = new Set(['FENCE_BEGIN', 'PASSWORD_UPDATE', 'PROVIDER_SIGNOUT', 'IDENTITY_RECHECK', 'FENCE_COMPLETE']);
const UNRESOLVED = new Set(['PENDING', 'REVIEW_REQUIRED']);

class RecoveryReviewStoreError extends Error {
  constructor() {
    super('Recovery review storage is unavailable.');
    this.name = 'RecoveryReviewStoreError';
    this.code = 'RECOVERY_REVIEW_UNAVAILABLE';
    this.status = 503;
  }
}

function exactObject(value, keys) {
  return value && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).length === keys.length
    && keys.every(key => Object.hasOwn(value, key));
}

function identifiers(value, extraKeys = []) {
  const keys = ['userId', 'operationId', ...extraKeys];
  if (!exactObject(value, keys) || typeof value.userId !== 'string'
    || typeof value.operationId !== 'string' || !UUID.test(value.userId) || !UUID.test(value.operationId)) {
    throw new TypeError('Valid server recovery review identifiers are required.');
  }
  return {p_user_id: value.userId, p_operation_id: value.operationId};
}

function canonicalTimestamp(value) {
  if (typeof value !== 'string' || !UTC_MILLISECONDS.test(value)) return false;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && new Date(parsed).toISOString() === value;
}

function reviewRows(value, limit) {
  if (!Array.isArray(value) || value.length > limit) throw new RecoveryReviewStoreError();
  const rows = value.map(row => {
    const keys = ['userId', 'operationId', 'status', 'stage', 'createdAt', 'updatedAt'];
    if (!exactObject(row, keys) || typeof row.userId !== 'string'
      || typeof row.operationId !== 'string' || !UUID.test(row.userId) || !UUID.test(row.operationId)
      || !UNRESOLVED.has(row.status) || !canonicalTimestamp(row.createdAt)
      || !canonicalTimestamp(row.updatedAt) || Date.parse(row.updatedAt) < Date.parse(row.createdAt)
      || (row.status === 'PENDING' && row.stage !== null)
      || (row.status === 'REVIEW_REQUIRED' && !STAGES.has(row.stage))) {
      throw new RecoveryReviewStoreError();
    }
    return Object.freeze({
      userId: row.userId,
      operationId: row.operationId,
      status: row.status,
      stage: row.stage,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    });
  });
  for (let index = 1; index < rows.length; index++) {
    const previous = rows[index - 1];
    const current = rows[index];
    if (previous.createdAt > current.createdAt
      || (previous.createdAt === current.createdAt && previous.operationId >= current.operationId)) {
      throw new RecoveryReviewStoreError();
    }
  }
  return Object.freeze(rows);
}

function createRecoveryReviewStore({rpcClient, timeoutMs = 10000} = {}) {
  const transport = createBoundedAuthRpc({
    rpcClient,
    timeoutMs,
    errorFactory: () => new RecoveryReviewStoreError(),
  });
  async function mutation(name, value, extraKeys) {
    const args = identifiers(value, extraKeys);
    if (extraKeys.includes('stage')) {
      if (!STAGES.has(value.stage)) throw new TypeError('A fixed recovery review stage is required.');
      args.p_stage = value.stage;
    }
    if (await transport.call(name, args) !== true) throw new RecoveryReviewStoreError();
    return true;
  }
  return Object.freeze({
    start(value) {
      return mutation('moaon_start_recovery_review', value, []);
    },
    markRequired(value) {
      return mutation('moaon_require_recovery_review', value, ['stage']);
    },
    complete(value) {
      return mutation('moaon_complete_recovery_review', value, []);
    },
    reject(value) {
      return mutation('moaon_reject_recovery_review', value, []);
    },
    async list(value = {}) {
      if (!exactObject(value, Object.hasOwn(value || {}, 'limit') ? ['limit'] : [])) {
        throw new TypeError('Only a bounded recovery review list limit is supported.');
      }
      const limit = Object.hasOwn(value, 'limit') ? value.limit : 50;
      if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
        throw new TypeError('Recovery review list limit must be an integer from 1 to 100.');
      }
      return reviewRows(await transport.call('moaon_list_recovery_reviews', {p_limit: limit}), limit);
    },
  });
}

module.exports = {createRecoveryReviewStore, RecoveryReviewStoreError};
