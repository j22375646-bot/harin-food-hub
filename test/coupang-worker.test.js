'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const queue = require('../lib/coupang/request-queue.js');
const worker = require('../scripts/coupang-local-worker.js');

function chain(terminal, calls) {
  const query = {};
  for (const method of ['select', 'eq', 'in', 'order', 'limit']) query[method] = (...args) => { calls.push([method, ...args]); return query; };
  query.insert = value => { calls.push(['insert', value]); return query; };
  query.maybeSingle = async () => terminal;
  query.single = async () => terminal;
  return query;
}

test('Coupang queue reuses an active request', async () => {
  const calls = [];
  const request = { id: 'active', request_type: 'FULL', status: 'PENDING' };
  const db = { from: () => chain({ data: request, error: null }, calls) };
  const result = await queue.queueRequest(db, 'FULL');
  assert.deepEqual(result, { queued: true, existing: true, request });
  assert.equal(calls.some(([method]) => method === 'insert'), false);
});

test('Coupang queue inserts when no active request exists', async () => {
  const calls = [];
  const inserted = { id: 'new', request_type: 'FULL', status: 'PENDING' };
  let tableCalls = 0;
  const db = { from: () => ++tableCalls === 1
    ? chain({ data: null, error: null }, calls)
    : chain({ data: inserted, error: null }, calls) };
  const result = await queue.queueRequest(db, 'FULL');
  assert.deepEqual(result, { queued: true, existing: false, deduplicated: false, request: inserted });
  assert.deepEqual(calls.find(([method]) => method === 'insert')[1], {
    request_type: 'FULL', status: 'PENDING', idempotency_key: null,
    scheduled_for: null, kst_execution_date: null
  });
});

test('Coupang queue reuses a completed request with the same KST execution key', async () => {
  const calls = [];
  const request = { id: 'done', request_type: 'FULL', status: 'SUCCESS' };
  const db = { from: () => chain({ data: request, error: null }, calls) };
  const result = await queue.queueRequest(db, 'FULL', { idempotencyKey: 'COUPANG_SYNC_REQUEST:KST:2026-08-13' });
  assert.deepEqual(result, { queued: true, existing: true, deduplicated: true, request });
  assert.equal(calls.some(([method]) => method === 'insert'), false);
});

test('fixed-IP worker refuses an unexpected outbound address', async () => {
  const originalFetch = global.fetch;
  const originalExpected = process.env.COUPANG_ALLOWED_SOURCE_IP;
  process.env.COUPANG_ALLOWED_SOURCE_IP = '13.124.12.17';
  global.fetch = async () => new Response(JSON.stringify({ ip: '203.0.113.10' }), { status: 200 });
  try {
    await assert.rejects(() => worker.assertAllowedSourceIp(), /source IP mismatch/);
  } finally {
    global.fetch = originalFetch;
    if (originalExpected === undefined) delete process.env.COUPANG_ALLOWED_SOURCE_IP;
    else process.env.COUPANG_ALLOWED_SOURCE_IP = originalExpected;
  }
});

test('daily cron queues Coupang and production data source is no longer HOME_PC', () => {
  const root = path.resolve(__dirname, '..');
  const cron = fs.readFileSync(path.join(root, 'app/api/cron/daily-sync/route.js'), 'utf8');
  const page = fs.readFileSync(path.join(root, 'app/page.js'), 'utf8');
  const workerSource = fs.readFileSync(path.join(root, 'scripts/coupang-local-worker.js'), 'utf8');
  assert.match(cron, /queueRequest\(supabaseModule\.getSupabase\(\), 'FULL', runOptions\('COUPANG_SYNC_REQUEST'\)\)/);
  assert.match(page, /FIXED_IP_WORKER/);
  assert.doesNotMatch(`${page}\n${workerSource}`, /HOME_PC/);
});
