'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {buildWorkerHealth} = require('../lib/operations/reliability-center.js');
const readiness = require('../lib/operations-health/readiness.js');
const now = new Date('2026-09-08T10:00:00Z');

test('missing, invalid and future heartbeat time never establishes worker readiness', () => {
  for (const last_seen_at of [undefined, null, '', 'invalid', '2026-09-08T10:01:00Z']) {
    const health = buildWorkerHealth([{status:'ONLINE', last_seen_at}], now);
    assert.equal(health.workers[0].ready, false, String(last_seen_at));
    assert.equal(health.status, 'CHECK');
  }
});

test('operations health does not label fresh failed or stopping workers as ready', () => {
  for (const [status, expected] of [['ERROR','FAILED'],['STOPPING','FAILED'],['ONLINE','READY'],['BUSY','READY']]) {
    const model = readiness.buildOperationsHealth({heartbeats:[{service_name:'harin-coupang-worker',status,last_seen_at:now.toISOString()}],now,env:{}});
    const worker = model.services.find(item=>item.key==='worker');
    assert.equal(worker.status, expected, status);
    assert.equal(worker.capabilities[0].readStatus, expected);
    if (expected === 'FAILED') assert.doesNotMatch(worker.summary, /정상/);
  }
});
