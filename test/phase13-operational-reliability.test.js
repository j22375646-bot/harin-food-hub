'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const reliability=require('../lib/operations/reliability-center.js');

const read=file=>fs.readFileSync(path.resolve(__dirname,'..',file),'utf8');

test('13-8 marks a fixed-IP worker silent after fifteen minutes',()=>{
  const now=Date.parse('2026-08-15T01:00:00Z');
  const health=reliability.buildWorkerHealth([{worker_id:'FIXED_IP_WORKER',service_name:'harin-coupang-worker',collector:'FIXED_IP_WORKER',status:'ONLINE',last_seen_at:'2026-08-15T00:44:59Z'}],now);
  assert.equal(health.status,'CHECK');
  assert.equal(health.workers[0].status,'SILENT');
  assert.equal(health.workers[0].stale,true);
});

test('23 polish accepts an ISO generated-at value when checking worker silence',()=>{
  const health=reliability.buildWorkerHealth([
    {worker_id:'FIXED_IP_WORKER',service_name:'harin-coupang-worker',collector:'FIXED_IP_WORKER',status:'ONLINE',last_seen_at:'2026-08-20T00:00:00Z'}
  ],'2026-08-20T13:00:00Z');
  assert.equal(health.status,'CHECK');
  assert.equal(health.workers[0].silence_minutes,780);
  assert.equal(health.workers[0].stale,true);
});

test('13-8 dead-letter workbench contains only terminal failures and no payload',()=>{
  const center=reliability.buildReliabilityCenter({operationRequests:[{id:'op-1',status:'FAILED',operation_type:'INVOICE_UPLOAD',target_type:'ORDER',target_id:'100',error_message:'failed',attempt_count:2},{id:'op-2',status:'SUCCESS',operation_type:'ORDER_DETAIL'}],syncRequests:[{id:'sync-1',status:'FAILED',request_type:'FULL',error_message:'timeout'}]});
  assert.equal(center.dead_letter_count,2);
  assert.equal(Object.hasOwn(center.dead_letters[0],'payload'),false);
});

test('우체국 접수 전 조회결과 없음은 재처리할 실패 작업에서 제외한다',()=>{
  const center=reliability.buildReliabilityCenter({operationRequests:[
    {id:'tracking-wait',status:'FAILED',operation_type:'EPOST_TRACKING',error_message:'조회결과가 없습니다.'},
    {id:'real-failure',status:'FAILED',operation_type:'UPLOAD_INVOICE',error_message:'권한 오류'}
  ]});
  assert.equal(center.dead_letter_count,1);
  assert.equal(center.dead_letters[0].id,'real-failure');
});

test('13-8 keeps cost calls guarded and production test sends disabled',()=>{
  const migration=read('supabase/migrations/20260815003504_phase13_operational_reliability.sql');
  const watchdogMigration=read('supabase/migrations/20260815003600_schedule_worker_watchdog.sql');
  assert.match(migration,/claim_external_call_guard/);
  assert.match(watchdogMigration,/harin-worker-heartbeat-watchdog/);
  assert.match(watchdogMigration,/interval '15 minutes'/);
  assert.doesNotMatch(read('vercel.json'),/operations-watchdog/);
  assert.match(read('lib/ai/foundation.js'),/AI_REQUEST_ALREADY_RUNNING/);
  assert.match(read('app/api/notifications/send/route.js'),/TEST_API_DISABLED/);
  assert.match(read('app/api/cron/operations-watchdog/route.js'),/CRON_SECRET/);
  assert.match(read('app/_shell/harin-app-shell.js'),/메뉴·업무 찾기/);
});

test('13-8 keeps old owner sessions valid during signing-key rotation',()=>{
  const auth=require('../lib/dashboard-auth.js');
  const current=process.env.DASHBOARD_SESSION_SECRET;const previous=process.env.DASHBOARD_SESSION_SECRET_PREVIOUS;
  try{
    process.env.DASHBOARD_SESSION_SECRET='old-secret-for-test';delete process.env.DASHBOARD_SESSION_SECRET_PREVIOUS;
    const token=auth.createSessionToken({sessionId:'s',userId:'u',username:'owner',role:'OWNER',expiresAt:new Date(Date.now()+60000).toISOString()});
    process.env.DASHBOARD_SESSION_SECRET_PREVIOUS='old-secret-for-test';process.env.DASHBOARD_SESSION_SECRET='new-secret-for-test';
    assert.equal(auth.parseSession(token)?.role,'OWNER');
  }finally{if(current===undefined)delete process.env.DASHBOARD_SESSION_SECRET;else process.env.DASHBOARD_SESSION_SECRET=current;if(previous===undefined)delete process.env.DASHBOARD_SESSION_SECRET_PREVIOUS;else process.env.DASHBOARD_SESSION_SECRET_PREVIOUS=previous;}
});
