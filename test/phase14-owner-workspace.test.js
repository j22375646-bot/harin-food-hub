'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const workspace=require('../lib/owner-workspace.js');

const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');

test('14-9 validates owner work items and strips unsupported saved-view query state',()=>{
  const item=workspace.itemInput({itemType:'task',title:' 송장 확인 ',body:'주문번호만 기록',priority:'high',pageKey:'orders',contextLabel:'주문',contextHref:'/orders?focus=scan&unsafe=1'});
  assert.equal(item.item_type,'TASK');
  assert.equal(item.title,'송장 확인');
  assert.equal(item.priority,'HIGH');
  assert.equal(item.context_href,'/orders?focus=scan');
  assert.throws(()=>workspace.safeHubHref('https://evil.example/orders'),/허브 안의/);
  assert.throws(()=>workspace.itemInput({title:'',pageKey:'main'}),/제목/);
});

test('14-9 stores quick work and saved views in server-only RLS tables',()=>{
  const migration=read('supabase/migrations/20260816150000_add_owner_workspace.sql');
  const route=read('app/api/owner-workspace/route.js');
  assert.match(migration,/create table if not exists public\.hub_work_items/);
  assert.match(migration,/create table if not exists public\.hub_saved_views/);
  assert.match(migration,/enable row level security/);
  assert.match(migration,/revoke all on table public\.hub_work_items from anon, authenticated/);
  assert.match(migration,/grant select, insert, update, delete on table public\.hub_saved_views to service_role/);
  assert.match(route,/apiSafety\.isAuthorized\(request,authModule\)/);
  assert.match(route,/apiSafety\.readJson\(request,\{maxBytes:16\*1024\}\)/);
});

test('14-9 installs a global command palette quick capture saved views and autosave',()=>{
  const dashboard=read('app/dashboard-client.js');
  const component=read('app/_workspace/harin-owner-workspace.js');
  const layout=read('app/layout.js');
  assert.match(dashboard,/HarinOwnerWorkspace pageKey=\{view\} pageLabel=\{navContext\.item\.label\}/);
  assert.match(component,/ctrlKey\|\|event\.metaKey/);
  assert.match(component,/harin:open-command/);
  assert.match(component,/CREATE_ITEM/);
  assert.match(component,/SAVE_VIEW/);
  assert.match(component,/자동저장됨/);
  assert.match(component,/contextHref:href/);
  assert.doesNotMatch(component,/setHref\(currentLocation\(\)\);load\(\)/);
  assert.match(component,/harin-owner-workspace\.css/);
  assert.doesNotMatch(layout,/harin-owner-workspace\.css/);
});

test('14-9 keeps order scan usable without a camera and opens it from global commands',()=>{
  const orders=read('app/unified-orders-center.js');
  const component=read('app/_workspace/harin-owner-workspace.js');
  assert.match(component,/href:'\/orders\?focus=scan'/);
  assert.match(orders,/focus==='scan'/);
  assert.match(orders,/scanInputRef\.current\?\.focus/);
  assert.match(orders,/USB·블루투스 바코드 리더/);
  assert.match(orders,/inputMode="search"/);
});
