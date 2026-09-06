'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const path = require('node:path');

function isolatedSync({ failRevenue = false } = {}) {
  const updates = [];
  const db = { from(table) {
    const query = {
      insert() { return query; },
      select() { return query; },
      eq() { return query; },
      gte() { return query; },
      upsert() { return query; },
      update(row) { updates.push({ table, row }); return query; },
      single: async () => ({ data: { id: 'sync-warning-test' } }),
      then(resolve, reject) { return Promise.resolve({ data: [], count: 0 }).then(resolve, reject); }
    };
    return query;
  } };
  const filename = path.resolve(__dirname, '../lib/coupang/sync.js');
  const localRequire = createRequire(filename);
  const overrides = {
    './config.js': { getConfig: () => ({ vendorId: 'test-vendor', syncDays: 1 }) },
    '../cafe24/supabase.js': { getSupabase: () => db },
    './client.js': { request: async (method, endpoint) => {
      if (failRevenue && endpoint.endsWith('/revenue-history')) throw new Error('503 revenue unavailable');
      return { status: 200, data: [] };
    } },
    './operations.js': { syncOperations: async () => ({ counts: {}, errors: [] }) }
  };
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), {
    module, exports: module.exports, process,
    require: name => overrides[name] || localRequire(name)
  }, { filename });
  return { syncAll: module.exports.syncAll, updates };
}

test('calibration evidence hold is a warning without marking successful collection partial', async () => {
  const { syncAll, updates } = isolatedSync();
  const result = await syncAll();
  assert.equal(result.status, 'SUCCESS');
  assert.equal(result.errors.length, 0);
  assert.equal(result.counts.costCalibration, 0);
  assert.equal(result.warnings[0].code, 'PENDING_TYPED_EVIDENCE');
  const saved = updates.find(({ table, row }) => table === 'sync_logs' && row.finished_at).row;
  assert.equal(saved.status, 'SUCCESS');
  assert.equal(saved.error_message, null);
  assert.equal(saved.metadata.warnings[0].code, 'PENDING_TYPED_EVIDENCE');
});

test('real revenue collection errors still produce partial status alongside the calibration warning', async () => {
  const { syncAll, updates } = isolatedSync({ failRevenue: true });
  const result = await syncAll();
  assert.equal(result.status, 'PARTIAL');
  assert.equal(result.errors.length, 1);
  assert.equal(result.errors[0].dataset, 'settlements');
  assert.match(result.errors[0].message, /503 revenue unavailable/);
  assert.equal(result.warnings[0].code, 'PENDING_TYPED_EVIDENCE');
  const saved = updates.find(({ table, row }) => table === 'sync_logs' && row.finished_at).row;
  assert.equal(saved.status, 'PARTIAL');
  assert.match(saved.error_message, /503 revenue unavailable/);
  assert.doesNotMatch(saved.error_message, /PENDING_TYPED_EVIDENCE/);
});
