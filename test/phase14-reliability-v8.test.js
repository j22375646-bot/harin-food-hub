const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {buildAiPagePanels}=require('../lib/ai/page-panels.js');

const root=path.join(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');

test('14-8 keeps collection and notifications on separate real routes and workbenches',()=>{
  const routes=read('lib/navigation/hub-routes.js');
  const dashboard=read('app/dashboard-client.js');
  assert.match(routes,/href:'\/data-collection'/);
  assert.match(routes,/href:'\/notifications'/);
  assert.match(dashboard,/HarinReliabilityWorkbench mode="collection"/);
  assert.match(dashboard,/HarinReliabilityWorkbench mode="notifications"/);
});

test('14-8 exposes channel readiness heartbeat exception inbox and safe retry',()=>{
  const source=read('app/_reliability/harin-reliability-workbench.js');
  assert.match(source,/채널 준비 상태/);
  assert.match(source,/WORKER HEARTBEAT/);
  assert.match(source,/GLOBAL EXCEPTION INBOX/);
  assert.match(source,/다시 처리/);
  assert.match(source,/개인정보/);
  assert.match(source,/function workerHeartbeatReady/);
  assert.match(source,/EPOST:'우체국'/);
  assert.match(source,/function friendlyMessage/);
});

test('14-8 adds a compact global live status dock without merging pages',()=>{
  const source=read('app/_reliability/harin-reliability-workbench.js');
  const dashboard=read('app/dashboard-client.js');
  const page=read('app/page.js');
  assert.match(source,/export function HarinLiveStatusDock/);
  assert.match(source,/운영 신호 바로보기/);
  assert.match(source,/href="\/data-collection"/);
  assert.match(source,/href="\/notifications"/);
  assert.match(dashboard,/HarinLiveStatusDock center=\{initialData\.collectionCenter\}/);
  assert.match(page,/SHELL_TABLES = \['sync_logs','alerts','worker_heartbeats','coupang_operation_requests','coupang_sync_requests'\]/);
});

test('14-9 promotes notification snooze to cross-device server state and keeps explicit resolution',()=>{
  const dashboard=read('app/dashboard-client.js');
  const route=read('app/api/alerts/[id]/route.js');
  const migration=read('supabase/migrations/20260816150000_add_owner_workspace.sql');
  assert.doesNotMatch(dashboard,/notifications:snoozed|setSnoozed/);
  assert.match(dashboard,/item\.snoozed_until/);
  assert.match(route,/action==='SNOOZE'/);
  assert.match(migration,/snoozed_until timestamptz/);
  assert.match(dashboard,/1시간 숨김/);
  assert.match(dashboard,/updateAlert\(detailAlert\.id,'RESOLVE'\)/);
});

test('14-8 keeps isolated zero-cost AI panels for collection and notifications',()=>{
  const dashboard=read('app/dashboard-client.js');
  const panels=buildAiPagePanels({collectionCenter:{summary:{ready_channels:2,attention_channels:1,dead_letters:1}},alerts:[{status:'OPEN'}],aiConfiguration:{execution_enabled:false}});
  assert.match(dashboard,/aiPagePanels\?\.collection/);
  assert.match(dashboard,/aiPagePanels\?\.notifications/);
  assert.equal(panels.collection.execution_enabled,false);
  assert.equal(panels.notifications.execution_enabled,false);
  assert.equal(panels.collection.metrics.primary_value,2);
});

test('14-8 imports readable responsive pastel reliability styles',()=>{
  const css=read('app/_reliability/harin-reliability-v8.css');
  assert.match(css,/\.reliabilityHero/);
  assert.match(css,/\.liveStatusDock/);
  assert.match(css,/@media\(max-width:700px\)/);
  assert.match(read('app/layout.js'),/harin-reliability-v8\.css/);
});
