'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');

test('16-4 renders inventory from Coupang Rocket Growth only',()=>{
  const component=read('app/unified-inventory-operations-center.js');
  const dashboard=read('app/dashboard-client.js');
  assert.match(component,/coupang\.rgInventory/);
  assert.match(component,/data-inventory-scope="coupang-rocket-growth"/);
  assert.doesNotMatch(component,/center\.items/);
  assert.doesNotMatch(component,/inventoryOpsChannels/);
  assert.match(dashboard,/UnifiedInventoryOperationsCenter coupang=\{initialData\.coupang\}/);
  assert.match(dashboard,/buildNavigationOperationSnapshot\(initialData\)/);
  const snapshot=read('lib/navigation/operation-snapshot.js');
  assert.match(snapshot,/inventory:countOrNull\(data\.unifiedInventory\?\.summary\?\.action_required\)/);
});

test('16-4 provides active inventory, risk, replenishment, and collection workflows',()=>{
  const component=read('app/unified-inventory-operations-center.js');
  for(const label of ['지금 판매 중인 재고','판매 상품 전체','저재고','입고 미리보기','SKU별 최근 재고 기준 시각'])assert.match(component,new RegExp(label));
  assert.match(component,/\/api\/coupang\/rg-inventory\/sync/);
  assert.match(component,/sales_last_30_days\)>0&&number\(item\.total_orderable_quantity\)>0/);
  assert.doesNotMatch(component,/rgZeroStockGroup/);
  assert.match(component,/실제 쿠팡 재고나 입고 요청은 변경하지 않습니다/);
});

test('16-4 gives the Rocket Growth workbench an amber pastel responsive surface',()=>{
  const css=read('app/_operations/harin-operations-v8.css');
  assert.match(css,/Phase 16-4: inventory is a Coupang Rocket Growth-only workbench/);
  assert.match(css,/\.inventoryRocketGrowthOnly \.inventoryOpsHero/);
  assert.match(css,/\.rgInventoryMetrics/);
  assert.match(css,/\.inventoryRgSyncButton/);
  assert.match(css,/@media\(max-width:600px\)[\s\S]*\.rgInventoryMetrics/);
});

test('16-4 scopes the inventory AI evidence to Rocket Growth data',()=>{
  const panels=read('lib/ai/page-panels.js');
  const page=read('app/page.js');
  assert.match(page,/rocketGrowthInventory:coupangInventory/);
  assert.match(panels,/로켓그로스 재고 위험 자동분석/);
  assert.match(panels,/로켓그로스 판매가능 수량/);
  assert.match(panels,/ready:healthy\('COUPANG'\)/);
});
