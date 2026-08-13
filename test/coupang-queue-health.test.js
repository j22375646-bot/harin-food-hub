'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { buildCoupangQueueHealth } = require('../lib/dashboard/coupang-queue-health.js');

test('classifies pending, retry waiting, running, and long failures', () => {
  const health = buildCoupangQueueHealth({
    now:'2026-08-13T02:00:00.000Z',
    requests:[
      { id:'new', request_type:'FULL', status:'PENDING', attempt_count:0, requested_at:'2026-08-13T01:55:00.000Z' },
      { id:'retry', request_type:'FULL', status:'PENDING', attempt_count:2, requested_at:'2026-08-13T01:50:00.000Z', next_attempt_at:'2026-08-13T02:05:00.000Z' },
      { id:'running', request_type:'FULL', status:'RUNNING', attempt_count:1, requested_at:'2026-08-13T01:50:00.000Z' },
      { id:'stuck', request_type:'FULL', status:'RUNNING', attempt_count:3, requested_at:'2026-08-13T01:30:00.000Z' },
      { id:'failed', request_type:'FULL', status:'FAILED', attempt_count:8, requested_at:'2026-08-13T01:00:00.000Z', error_message:'timeout' },
      { id:'done', request_type:'FULL', status:'SUCCESS', attempt_count:1, requested_at:'2026-08-13T01:40:00.000Z' }
    ]
  });

  assert.equal(health.pending,1);
  assert.equal(health.retryWaiting,1);
  assert.equal(health.running,2);
  assert.equal(health.failed,1);
  assert.deepEqual(health.longFailures.map(item=>item.id),['stuck','failed']);
  assert.equal(health.recent.find(item=>item.id==='retry').status,'RETRY_WAIT');
});
