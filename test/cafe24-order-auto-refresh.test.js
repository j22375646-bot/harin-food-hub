'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const policy=require('../lib/cafe24/order-refresh-policy.js');

test('Cafe24 fast order refresh skips a fresh or running collection',()=>{
  const now=Date.parse('2026-09-02T06:00:00Z');
  assert.equal(policy.refreshDecision({latest:{status:'SUCCESS',finished_at:'2026-09-02T05:59:10Z'},now}).refresh,false);
  assert.equal(policy.refreshDecision({latest:{status:'RUNNING',started_at:'2026-09-02T05:58:00Z'},now}).refresh,false);
  assert.equal(policy.refreshDecision({latest:{status:'SUCCESS',finished_at:'2026-09-02T05:55:00Z'},now}).refresh,true);
});

test('orders page runs a Cafe24-only lightweight refresh without using the all-channel worker gate',()=>{
  const route=fs.readFileSync(path.join(__dirname,'..','app','api','cafe24','orders','refresh','route.js'),'utf8');
  const page=fs.readFileSync(path.join(__dirname,'..','app','_phase28','pages','orders-page.js'),'utf8');
  assert.match(route,/syncOrdersRealtime\(cafe24Config\.getConfig\(\),policy\.FAST_SYNC_OPTIONS\)/);
  assert.doesNotMatch(route,/FIXED_IP_WORKER|coupang|naver/i);
  assert.match(page,/fetch\('\/api\/cafe24\/orders\/refresh'/);
  assert.match(page,/CAFE24_ORDER_REFRESH_INTERVAL_MS/);
  assert.match(page,/document\.addEventListener\('visibilitychange'/);
});
