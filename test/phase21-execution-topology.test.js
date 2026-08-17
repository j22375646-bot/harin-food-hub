const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const topology=require('../lib/infrastructure/execution-topology.js');
const credentials=require('../lib/infrastructure/deferred-credential-checklist.js');
const routeGuard=require('../lib/infrastructure/execution-route-guard.js');
const routes=require('../lib/navigation/hub-routes.js');

const root=path.resolve(__dirname,'..');
const now=new Date('2026-08-18T00:10:00Z');

test('phase 21-7 and 21-8 preserve the guarded routes and add final readiness evidence',()=>{
  const center=topology.buildExecutionTopology({env:{},now,heartbeats:[{service_name:'harin-coupang-worker',status:'ONLINE',source_ip:'13.124.12.17',last_seen_at:'2026-08-18T00:05:00Z'}],syncRequests:[{request_type:'ORDERS_REALTIME',status:'SUCCESS',idempotency_key:'orders-hourly:2026-08-18T00',finished_at:'2026-08-18T00:01:00Z'}]});
  assert.equal(center.phase,'21-7 · 21-8');assert.equal(center.mode,'FINAL_READINESS');assert.equal(center.summary.lanes,6);assert.equal(center.worker.ready,true);
  assert.equal(center.summary.protectedLanes,6);assert.equal(center.summary.manualLocks,0);assert.equal(center.summary.switchReady,true);
  assert.equal(center.dryRun.status,'PASS');assert.equal(center.dryRun.guardedLanes,6);assert.equal(center.dryRun.changesApplied,false);
  assert.equal(center.recovery.status,'READY');assert.equal(center.recovery.previousSuccessPreserved,true);
  assert.equal(center.handover.status,'READY');assert.equal(center.handover.ownershipChanges,0);assert.equal(center.handover.changesApplied,false);assert.match(center.handover.snapshotHash,/^[a-f0-9]{12}$/);
  assert.equal(center.credentialChecklist.status,'SETUP_REQUIRED');assert.equal(center.credentialChecklist.secretValuesExposed,false);assert.equal(center.credentialChecklist.writesUnlocked,false);
  assert.ok(center.lanes.every(lane=>lane.guardMode&&lane.guardLabel));
  assert.ok(center.lanes.every(lane=>lane.mode==='OBSERVE'&&!lane.migration_authorized));
  assert.equal(center.lanes.find(lane=>lane.lane_key==='HOURLY_ORDERS').current_trigger,'AWS_SYSTEMD');
  assert.equal(center.lanes.find(lane=>lane.lane_key==='COUPANG_FIXED_IP_QUEUE').current_executor,'AWS_FIXED_IP_WORKER');
});

test('deferred credential checklist returns readiness booleans and never secret values',()=>{
  const apiKey='must-never-leave-the-server';
  const checklist=credentials.buildDeferredCredentialChecklist({KMA_API_HUB_KEY:apiKey,HUB_OWNED_SITE_URL:'https://example.com'});
  const serialized=JSON.stringify(checklist);
  assert.equal(checklist.groups.length,6);assert.ok(checklist.ready>=2);assert.ok(checklist.missing>0);
  assert.doesNotMatch(serialized,new RegExp(apiKey));assert.match(serialized,/KMA_API_HUB_KEY/);assert.match(serialized,/valueExposed/);
  assert.ok(checklist.groups.every(group=>group.destination==='Vercel 운영 환경 변수'));
});

test('active duplicate idempotency keys block the topology instead of looking successful',()=>{
  const rows=[{status:'PENDING',idempotency_key:'same-hour',requested_at:'2026-08-18T00:00:00Z'},{status:'RUNNING',idempotency_key:'same-hour',requested_at:'2026-08-18T00:01:00Z'}];
  const center=topology.buildExecutionTopology({now,syncRequests:rows});
  assert.equal(center.summary.collisionKeys,1);assert.equal(center.summary.switchReady,false);assert.equal(center.dryRun.status,'BLOCKED');assert.equal(center.collisions[0].count,2);assert.ok(center.lanes.every(lane=>lane.state==='COLLISION_RISK'));
});

test('stale worker signal and native queue state stay explicit',()=>{
  const center=topology.buildExecutionTopology({now,heartbeats:[{status:'ONLINE',last_seen_at:'2026-08-17T23:00:00Z'}],nativeQueueEnabled:false});
  assert.equal(center.worker.ready,false);assert.equal(center.summary.nativeQueueEnabled,false);assert.equal(center.lanes.find(lane=>lane.lane_key==='CHANNEL_OPERATION_QUEUE').state,'CHECK');
});

test('recent failures stay visible and recovered leases are counted',()=>{
  const automationRuns=[
    {job_name:'EXECUTION_LANE_HOURLY_ORDERS',status:'SUCCESS',finished_at:'2026-08-18T00:05:00Z',recovery_count:1,idempotency_key:'hour-1'},
    {job_name:'EXECUTION_LANE_HOURLY_ORDERS',status:'FAILED',finished_at:'2026-08-18T00:09:00Z',recovery_count:0,idempotency_key:'hour-2'}
  ];
  const center=topology.buildExecutionTopology({now,automationRuns});
  assert.equal(center.recovery.status,'CHECK');assert.equal(center.summary.failedRuns,1);assert.equal(center.summary.recoveredRuns,1);
  assert.equal(center.lanes.find(lane=>lane.lane_key==='HOURLY_ORDERS').recoveryState,'CHECK');
});

test('execution path route, combined dry-run check and service-role-only registry exist',()=>{
  assert.equal(routes.buildHubHref({view:'collection',workspace:'execution-paths'}),'/data-collection/execution-paths');
  assert.equal(fs.existsSync(path.join(root,'app/data-collection/execution-paths/page.js')),true);
  const ui=fs.readFileSync(path.join(root,'app/execution-path-center.js'),'utf8');
  const css=fs.readFileSync(path.join(root,'app/_reliability/harin-naver-api-center.css'),'utf8');
  const migration=fs.readFileSync(path.join(root,'supabase/migrations/20260817173843_add_execution_path_controls.sql'),'utf8');
  const checkRoute=fs.readFileSync(path.join(root,'app/api/infrastructure/execution-paths/check/route.js'),'utf8');
  assert.match(ui,/작업 실행 경로·전환센터/);assert.match(ui,/검수·키 준비/);assert.match(ui,/최종 상태 다시 확인/);assert.match(ui,/21-3 전환 드라이런/);assert.match(ui,/21-6 자동 복구 상태/);assert.match(ui,/전환 결과 대조·소유권 인수 조건/);assert.match(ui,/나중에 한 번에 입력할 API 준비표/);assert.match(css,/@media\(max-width:760px\).*executionCredentials/s);
  assert.match(migration,/migration_authorized or mode = 'OBSERVE'/);assert.match(migration,/revoke all.*public,anon,authenticated/s);assert.match(migration,/service_role/);
  assert.match(checkRoute,/isAuthorized/);assert.match(checkRoute,/loadExecutionTopology/);assert.doesNotMatch(checkRoute,/\.insert\(|\.update\(|\.delete\(/);
  assert.doesNotMatch(ui,/비밀번호|잠금 해제|CUTOVER/);assert.match(ui,/소유권 변경 0건/);
});

test('route guard executes once and returns a stored response for duplicates',async()=>{
  let calls=0,captured;
  const first=await routeGuard.runGuardedRoute({db:{},laneKey:'HOURLY_ORDERS',ownerKey:'AWS_SYSTEMD:VERCEL_FUNCTION',runKey:'HOURLY_ORDERS:2026-08-18T00',runner:async options=>{captured=options;const value=await options.work({});return {runId:'run-1',...value};}},async()=>{calls+=1;return {status:207,body:{ok:false,jobs:[{ok:false}]}};});
  assert.equal(calls,1);assert.equal(captured.maxAttempts,1);assert.equal(captured.jobName,'EXECUTION_LANE_HOURLY_ORDERS');
  assert.equal(first.status,207);assert.equal(first.body.execution_guard.mode,'AUTOMATION_RUN_LEASE');
  const duplicate=await routeGuard.runGuardedRoute({db:{},laneKey:'HOURLY_ORDERS',ownerKey:'AWS_SYSTEMD:VERCEL_FUNCTION',runKey:'HOURLY_ORDERS:2026-08-18T00',runner:async()=>({runId:'run-1',deduplicated:true,alreadyRunning:true})},async()=>{calls+=1;return {status:200,body:{ok:true}};});
  assert.equal(calls,1);assert.equal(duplicate.status,202);assert.equal(duplicate.body.reason,'ALREADY_RUNNING');
});

test('route guard reports a current failure while preserving previous success metadata',async()=>{
  const result=await routeGuard.runGuardedRoute({db:{},laneKey:'REPORT_SCHEDULES',ownerKey:'VERCEL_CRON:VERCEL_FUNCTION',runKey:'reports:today',runner:async()=>{throw new Error('fresh report failed');},previousSuccessLoader:async()=>({id:'old-run',finished_at:'2026-08-17T23:00:00Z',recovery_count:2})},async()=>({status:200,body:{ok:true}}));
  assert.equal(result.status,503);assert.equal(result.body.ok,false);assert.equal(result.body.stale_result_available,true);assert.equal(result.body.previous_success.run_id,'old-run');assert.match(result.body.message,/이전 성공 자료/);
});

test('critical collection routes use the shared execution lease',()=>{
  const hourly=fs.readFileSync(path.join(root,'app/api/cron/hourly-orders/route.js'),'utf8');
  const daily=fs.readFileSync(path.join(root,'app/api/cron/daily-sync/route.js'),'utf8');
  assert.match(hourly,/runGuardedRoute/);assert.match(hourly,/HOURLY_ORDERS/);assert.match(hourly,/AWS_SYSTEMD:VERCEL_FUNCTION/);
  assert.match(daily,/runGuardedRoute/);assert.match(daily,/DAILY_COLLECTION/);assert.match(daily,/VERCEL_CRON:VERCEL_FUNCTION/);
});

test('report schedules use leases and the watchdog route keeps its bucket guard',()=>{
  for(const file of ['platform-reports','weekly-report','monthly-reports']){
    const source=fs.readFileSync(path.join(root,`app/api/cron/${file}/route.js`),'utf8');
    assert.match(source,/runGuardedRoute/);assert.match(source,/REPORT_SCHEDULES/);
  }
  const watchdog=fs.readFileSync(path.join(root,'app/api/cron/operations-watchdog/route.js'),'utf8');
  assert.match(watchdog,/runGuardedRoute/);assert.match(watchdog,/WORKER_WATCHDOG/);assert.match(watchdog,/SUPABASE_CRON:SUPABASE_DATABASE/);
});
