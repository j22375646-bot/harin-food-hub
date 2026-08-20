'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const lotCenter=require('../lib/inventory/lot-center.js');

const root=path.join(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');

test('23 hardening classifies expiry using a Seoul date key without timezone drift',()=>{
  const now=new Date('2026-08-20T03:00:00.000Z');
  assert.equal(lotCenter.daysUntil('2026-08-20',now),0);
  assert.equal(lotCenter.expiryMeta('2026-09-19',now).code,'URGENT');
  assert.equal(lotCenter.expiryMeta('2026-09-20',now).code,'WARNING');
  assert.equal(lotCenter.expiryMeta('2026-11-19',now).code,'HEALTHY');
  assert.equal(lotCenter.expiryMeta('2026-08-19',now).code,'EXPIRED');
});

test('23 hardening validates owner-entered lot rows and never invents API expiry data',()=>{
  const normalized=lotCenter.normalizeLotInput({vendor_item_id:'123',lot_code:'A-1',received_on:'2026-08-20',manufactured_on:'2026-08-01',expires_on:'2027-08-01',quantity:50,notes:' first shelf '});
  assert.deepEqual(normalized,{platform:'COUPANG',vendor_item_id:'123',lot_code:'A-1',received_on:'2026-08-20',manufactured_on:'2026-08-01',expires_on:'2027-08-01',quantity:50,status:'ACTIVE',notes:'first shelf'});
  assert.throws(()=>lotCenter.normalizeLotInput({...normalized,expires_on:'2026-07-01'}),/제조일/);
  const summary=lotCenter.summarizeLots([{...normalized,id:'lot-1'}],[{vendor_item_id:'123'},{vendor_item_id:'456'}],new Date('2026-08-20T03:00:00.000Z'));
  assert.equal(summary.active.length,1);
  assert.deepEqual(summary.unregistered.map(item=>item.vendor_item_id),['456']);
});

test('23 hardening ships a service-role-only lot table and focused loader',()=>{
  const migration=read('supabase/migrations/20260820083237_add_inventory_lots.sql');
  const profiles=read('lib/dashboard/page-loader-profiles.js');
  const page=read('app/page.js');
  assert.match(migration,/create table if not exists public\.inventory_lots/);
  assert.match(migration,/enable row level security/);
  assert.match(migration,/revoke all on table public\.inventory_lots from public, anon, authenticated/);
  assert.match(migration,/grant select, insert, update, delete on table public\.inventory_lots to service_role/);
  assert.match(profiles,/inventory:[^\n]+inventory_lots/);
  assert.match(page,/inventoryLots:view==='inventory'/);
  assert.match(page,/inventoryLots:inventoryLotsSettled\.results\[0\]\.data\|\|\[\]/);
});

test('23 hardening adds one-confirm owner lot saving and immediate local refresh',()=>{
  const component=read('app/unified-inventory-operations-center.js');
  const route=read('app/api/inventory/lots/route.js');
  assert.match(component,/\['EXPIRY','유통기한','입고 LOT 기록'\]/);
  assert.match(component,/window\.confirm\(/);
  assert.match(component,/fetch\('\/api\/inventory\/lots'/);
  assert.match(component,/setLots\(current=>\[result\.lot/);
  assert.match(component,/status:'USED'/);
  assert.match(component,/소진 완료/);
  assert.match(component,/쿠팡 API가 제공하지 않는 유통기한/);
  assert.match(route,/roleAtLeast\(session,'OWNER'\)/);
  assert.match(route,/coupang_rg_inventory[\s\S]*?gt\('total_orderable_quantity',0\)[\s\S]*?gt\('sales_last_30_days',0\)/);
  assert.match(route,/upsert\(payload,\{onConflict:'platform,vendor_item_id,lot_code'\}\)/);
});
