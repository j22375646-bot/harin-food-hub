const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const topology=require('../lib/infrastructure/execution-topology.js');
const routes=require('../lib/navigation/hub-routes.js');

const root=path.resolve(__dirname,'..');
const now=new Date('2026-08-18T00:10:00Z');

test('phase 21-1 maps the current execution owners without authorizing a cutover',()=>{
  const center=topology.buildExecutionTopology({now,heartbeats:[{service_name:'harin-coupang-worker',status:'ONLINE',source_ip:'13.124.12.17',last_seen_at:'2026-08-18T00:05:00Z'}],syncRequests:[{request_type:'ORDERS_REALTIME',status:'SUCCESS',idempotency_key:'orders-hourly:2026-08-18T00',finished_at:'2026-08-18T00:01:00Z'}]});
  assert.equal(center.phase,'21-1');assert.equal(center.mode,'OBSERVE');assert.equal(center.summary.lanes,6);assert.equal(center.worker.ready,true);
  assert.ok(center.lanes.every(lane=>lane.mode==='OBSERVE'&&!lane.migration_authorized));
  assert.equal(center.lanes.find(lane=>lane.lane_key==='HOURLY_ORDERS').current_trigger,'AWS_SYSTEMD');
  assert.equal(center.lanes.find(lane=>lane.lane_key==='COUPANG_FIXED_IP_QUEUE').current_executor,'AWS_FIXED_IP_WORKER');
});

test('active duplicate idempotency keys block the topology instead of looking successful',()=>{
  const rows=[{status:'PENDING',idempotency_key:'same-hour',requested_at:'2026-08-18T00:00:00Z'},{status:'RUNNING',idempotency_key:'same-hour',requested_at:'2026-08-18T00:01:00Z'}];
  const center=topology.buildExecutionTopology({now,syncRequests:rows});
  assert.equal(center.summary.collisionKeys,1);assert.equal(center.collisions[0].count,2);assert.ok(center.lanes.every(lane=>lane.state==='COLLISION_RISK'));
});

test('stale worker signal and native queue state stay explicit',()=>{
  const center=topology.buildExecutionTopology({now,heartbeats:[{status:'ONLINE',last_seen_at:'2026-08-17T23:00:00Z'}],nativeQueueEnabled:false});
  assert.equal(center.worker.ready,false);assert.equal(center.summary.nativeQueueEnabled,false);assert.equal(center.lanes.find(lane=>lane.lane_key==='CHANNEL_OPERATION_QUEUE').state,'CHECK');
});

test('execution path route, mobile UI and service-role-only registry exist',()=>{
  assert.equal(routes.buildHubHref({view:'collection',workspace:'execution-paths'}),'/data-collection/execution-paths');
  assert.equal(fs.existsSync(path.join(root,'app/data-collection/execution-paths/page.js')),true);
  const ui=fs.readFileSync(path.join(root,'app/execution-path-center.js'),'utf8');
  const css=fs.readFileSync(path.join(root,'app/_reliability/harin-naver-api-center.css'),'utf8');
  const migration=fs.readFileSync(path.join(root,'supabase/migrations/20260817173843_add_execution_path_controls.sql'),'utf8');
  assert.match(ui,/작업 실행 경로·전환센터/);assert.match(ui,/관찰 모드/);assert.match(css,/@media\(max-width:760px\).*executionFlow/s);
  assert.match(migration,/migration_authorized or mode = 'OBSERVE'/);assert.match(migration,/revoke all.*public,anon,authenticated/s);assert.match(migration,/service_role/);
  assert.doesNotMatch(ui,/fetch\(|onClick|CUTOVER/);
});
