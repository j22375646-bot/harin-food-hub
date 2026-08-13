'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { buildDataHealth, nextDailyKst, settleQueries } = require('../lib/dashboard/data-health.js');

test('one rejected channel query is isolated and other query data remains available', () => {
  const settled = settleQueries([
    { status:'fulfilled', value:{ data:[{ id:1 }], error:null } },
    { status:'rejected', reason:Object.assign(new Error('connection failed'),{ code:'08006' }) },
    { status:'fulfilled', value:{ data:[{ id:3 }], error:null } }
  ], [
    { platform:'CAFE24', dataset:'orders' },
    { platform:'NAVER', dataset:'keywords' },
    { platform:'COUPANG', dataset:'orders' }
  ]);

  assert.deepEqual(settled.results[0].data,[{ id:1 }]);
  assert.equal(settled.results[1].unavailable,true);
  assert.equal(settled.results[1].data,null);
  assert.deepEqual(settled.results[2].data,[{ id:3 }]);
  assert.deepEqual(settled.issues[0],{
    platform:'NAVER', dataset:'keywords', code:'08006',
    message:'데이터를 불러오지 못했습니다.', retryable:true
  });
});

test('data health marks only the affected channel partial and never calls it zero', () => {
  const health = buildDataHealth({
    now:'2026-08-13T01:00:00.000Z',
    issues:[{ platform:'NAVER', dataset:'naver_keywords', message:'데이터를 불러오지 못했습니다.' }],
    syncs:[
      { platform:'NAVER', status:'SUCCESS', finished_at:'2026-08-13T00:00:00.000Z' },
      { platform:'CAFE24', status:'SUCCESS', finished_at:'2026-08-13T00:00:00.000Z' },
      { platform:'COUPANG', status:'SUCCESS', finished_at:'2026-08-13T00:00:00.000Z' }
    ],
    summaries:{ NAVER:'저장량 확인 불가', CAFE24:'12건 주문', COUPANG:'8건 주문' }
  });

  assert.equal(health.overallStatus,'PARTIAL');
  assert.equal(health.channels.find(item=>item.platform==='NAVER').status,'PARTIAL');
  assert.equal(health.channels.find(item=>item.platform==='NAVER').storedSummary,'저장량 확인 불가');
  assert.equal(health.channels.find(item=>item.platform==='CAFE24').status,'READY');
  assert.equal(health.channels.find(item=>item.platform==='COUPANG').status,'READY');
});

test('daily schedule is fixed to the next 05:30 KST', () => {
  assert.equal(nextDailyKst('2026-08-12T20:00:00.000Z'),'2026-08-12T20:30:00.000Z');
  assert.equal(nextDailyKst('2026-08-12T21:00:00.000Z'),'2026-08-13T20:30:00.000Z');
});

test('running channel takes precedence over an older failed log', () => {
  const health=buildDataHealth({
    now:'2026-08-13T01:00:00.000Z',
    syncs:[{platform:'COUPANG',status:'FAILED',finished_at:'2026-08-13T00:00:00.000Z'}],
    coupangRequests:[{status:'PENDING'}]
  });
  assert.equal(health.channels.find(item=>item.platform==='COUPANG').status,'RUNNING');
});
