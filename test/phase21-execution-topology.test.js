const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const topology=require('../lib/infrastructure/execution-topology.js');
const routeGuard=require('../lib/infrastructure/execution-route-guard.js');
const routes=require('../lib/navigation/hub-routes.js');

const root=path.resolve(__dirname,'..');
const now=new Date('2026-08-18T00:10:00Z');

test('phase 21-3 and 21-4 map dry-run readiness and every lane guard',()=>{
  const center=topology.buildExecutionTopology({now,heartbeats:[{service_name:'harin-coupang-worker',status:'ONLINE',source_ip:'13.124.12.17',last_seen_at:'2026-08-18T00:05:00Z'}],syncRequests:[{request_type:'ORDERS_REALTIME',status:'SUCCESS',idempotency_key:'orders-hourly:2026-08-18T00',finished_at:'2026-08-18T00:01:00Z'}]});
  assert.equal(center.phase,'21-3 · 21-4');assert.equal(center.mode,'DRY_RUN_GUARDED');assert.equal(center.summary.lanes,6);assert.equal(center.worker.ready,true);
  assert.equal(center.summary.protectedLanes,6);assert.equal(center.summary.manualLocks,0);assert.equal(center.summary.switchReady,true);
  assert.equal(center.dryRun.status,'PASS');assert.equal(center.dryRun.guardedLanes,6);assert.equal(center.dryRun.changesApplied,false);
  assert.ok(center.lanes.every(lane=>lane.guardMode&&lane.guardLabel));
  assert.ok(center.lanes.every(lane=>lane.mode==='OBSERVE'&&!lane.migration_authorized));
  assert.equal(center.lanes.find(lane=>lane.lane_key==='HOURLY_ORDERS').current_trigger,'AWS_SYSTEMD');
  assert.equal(center.lanes.find(lane=>lane.lane_key==='COUPANG_FIXED_IP_QUEUE').current_executor,'AWS_FIXED_IP_WORKER');
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

test('execution path route, combined dry-run check and service-role-only registry exist',()=>{
  assert.equal(routes.buildHubHref({view:'collection',workspace:'execution-paths'}),'/data-collection/execution-paths');
  assert.equal(fs.existsSync(path.join(root,'app/data-collection/execution-paths/page.js')),true);
  const ui=fs.readFileSync(path.join(root,'app/execution-path-center.js'),'utf8');
  const css=fs.readFileSync(path.join(root,'app/_reliability/harin-naver-api-center.css'),'utf8');
  const migration=fs.readFileSync(path.join(root,'supabase/migrations/20260817173843_add_execution_path_controls.sql'),'utf8');
  const checkRoute=fs.readFileSync(path.join(root,'app/api/infrastructure/execution-paths/check/route.js'),'utf8');
  assert.match(ui,/작업 실행 경로·전환센터/);assert.match(ui,/자동 임대 보호/);assert.match(ui,/중복·드라이런 확인/);assert.match(ui,/21-3 전환 드라이런/);assert.match(css,/@media\(max-width:760px\).*executionFlow/s);
  assert.match(migration,/migration_authorized or mode = 'OBSERVE'/);assert.match(migration,/revoke all.*public,anon,authenticated/s);assert.match(migration,/service_role/);
  assert.match(checkRoute,/isAuthorized/);assert.match(checkRoute,/loadExecutionTopology/);assert.doesNotMatch(checkRoute,/\.insert\(|\.update\(|\.delete\(/);
  assert.doesNotMatch(ui,/비밀번호|잠금 해제|CUTOVER/);
});

test('route guard executes once and returns a stored response for duplicates',async()=>{
  let calls=0,captured;
  const first=await routeGuard.runGuardedRoute({db:{},laneKey:'HOURLY_ORDERS',ownerKey:'AWS_SYSTEMD:VERCEL_FUNCTION',runKey:'HOURLY_ORDERS:2026-08-18T00',runner:async options=>{captured=options;const value=await options.work({});return {runId:'run-1',...value};}},async()=>{calls+=1;return {status:207,body:{ok:false,jobs:[{ok:false}]}};});
  assert.equal(calls,1);assert.equal(captured.maxAttempts,1);assert.equal(captured.jobName,'EXECUTION_LANE_HOURLY_ORDERS');
  assert.equal(first.status,207);assert.equal(first.body.execution_guard.mode,'AUTOMATION_RUN_LEASE');
  const duplicate=await routeGuard.runGuardedRoute({db:{},laneKey:'HOURLY_ORDERS',ownerKey:'AWS_SYSTEMD:VERCEL_FUNCTION',runKey:'HOURLY_ORDERS:2026-08-18T00',runner:async()=>({runId:'run-1',deduplicated:true,alreadyRunning:true})},async()=>{calls+=1;return {status:200,body:{ok:true}};});
  assert.equal(calls,1);assert.equal(duplicate.status,202);assert.equal(duplicate.body.reason,'ALREADY_RUNNING');
});

test('critical collection routes use the shared execution lease',()=>{
  const hourly=fs.readFileSync(path.join(root,'app/api/cron/hourly-orders/route.js'),'utf8');
  const daily=fs.readFileSync(path.join(root,'app/api/cron/daily-sync/route.js'),'utf8');
  assert.match(hourly,/runGuardedRoute/);assert.match(hourly,/HOURLY_ORDERS/);assert.match(hourly,/AWS_SYSTEMD:VERCEL_FUNCTION/);
  assert.match(daily,/runGuardedRoute/);assert.match(daily,/DAILY_COLLECTION/);assert.match(daily,/VERCEL_CRON:VERCEL_FUNCTION/);
});
