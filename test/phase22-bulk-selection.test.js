'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const selection=require('../lib/ui/bulk-selection.js');
const remaining=require('../lib/operations/remaining-bulk-workflows.js');

test('22-2 selects the visible page without losing earlier selections',()=>{
  const selected=selection.toggleSelectionScope(['outside'],['page-1','page-2'],true);
  assert.deepEqual(selected,['outside','page-1','page-2']);
  assert.deepEqual(selection.selectionState(selected,['page-1','page-2']),{checked:true,mixed:false,selectedCount:2,totalCount:2});
});

test('22-2 selects and clears the complete filtered result',()=>{
  const selected=selection.toggleSelectionScope([],['a','b','c'],true);
  assert.deepEqual(selection.selectionState(selected,['a','b','c']),{checked:true,mixed:false,selectedCount:3,totalCount:3});
  assert.deepEqual(selection.toggleSelectionScope(selected,['a','b','c'],false),[]);
});

test('22-2 prunes selections that disappeared after live data refresh',()=>{
  assert.deepEqual(selection.reconcileSelection(['kept','deleted','kept'],['kept','new']),['kept']);
  assert.deepEqual(selection.selectionState(['kept'],['kept','new']),{checked:false,mixed:true,selectedCount:1,totalCount:2});
});

test('22-2 exposes one reusable accessible bulk bar and connects the keyword reference screen',()=>{
  const component=fs.readFileSync('app/_design-system/harin-bulk-selection.js','utf8');
  const keyword=fs.readFileSync('app/_analysis/keyword-operations-table.js','utf8');
  const css=fs.readFileSync('app/_design-system/harin-bulk-selection.css','utf8');
  assert.match(component,/export function useHarinBulkSelection/);
  assert.match(component,/aria-checked=\{mixed\?'mixed'/);
  assert.match(component,/검색 결과 \$\{filteredCount\}개 선택/);
  assert.match(component,/active&&children/);
  assert.match(component,/active&&preview/);
  assert.match(keyword,/HarinBulkSelectionBar/);
  assert.match(keyword,/onToggleFiltered=\{checked=>selection\.toggleScope\(filteredIds,checked\)\}/);
  assert.match(css,/\.v8BulkSelectionBar\.active/);
  assert.match(css,/\.v8BulkSelectionBar:not\(\.active\)/);
  assert.match(css,/@media\(max-width:700px\)\{\.v8BulkSelectionBar,\.v8BulkSelectionBar:not\(\.active\)\{grid-template-columns:1fr/);
  assert.match(css,/@media\(max-width:700px\)/);
});

test('22-3 applies the shared bulk bar to orders and product mapping',()=>{
  const orders=fs.readFileSync('app/unified-orders-center.js','utf8');
  const products=fs.readFileSync('app/_products/harin-product-workbench.js','utf8');
  assert.match(orders,/useHarinBulkSelection/);
  assert.match(orders,/현재 화면 또는 검색 결과의 출고 가능 주문만 선택합니다/);
  assert.match(orders,/로켓그로스·취소 완료·선택 불가 주문은 일괄 작업에서 자동 제외됩니다/);
  assert.match(products,/BULK_AUTO_LINK/);
  assert.match(products,/BULK_REJECT/);
  assert.match(products,/BULK_UNLINK/);
});

test('22-3 keeps Naver and Coupang mapping and keyword workspaces separated',()=>{
  const products=fs.readFileSync('app/_products/harin-product-workbench.js','utf8');
  const keywords=fs.readFileSync('app/_analysis/keyword-operations-table.js','utf8');
  assert.match(products,/\['NAVER','naver','네이버 스마트스토어'\],\['COUPANG','coupang','쿠팡'\]/);
  assert.match(products,/다른 채널 상품에는 적용되지 않습니다/);
  assert.match(products,/네이버 광고그룹은 계속 제외됩니다/);
  assert.match(keywords,/platform==='NAVER'/);
  assert.match(keywords,/platform==='COUPANG'/);
});

test('22-6 plans only alert actions that match the current alert state',()=>{
  const alerts=[{id:'open',status:'OPEN'},{id:'done',status:'RESOLVED'},{id:'seen',status:'ACKNOWLEDGED'}];
  const resolve=remaining.buildAlertBulkPlan(alerts,['open','done','seen'],'RESOLVE');
  assert.deepEqual(resolve.eligible.map(item=>item.id),['open','seen']);
  assert.deepEqual(resolve.skipped.map(item=>item.id),['done']);
  assert.equal(remaining.alertSupportsAction(alerts[1],'REOPEN'),true);
  assert.equal(remaining.alertSupportsAction(alerts[0],'REOPEN'),false);
});

test('22-6 builds a read-only Rocket Growth replenishment work list',()=>{
  const rows=remaining.replenishmentRows([{vendor_item_id:12,external_sku_id:'RG-12',total_orderable_quantity:5,sales_last_30_days:30,productItem:{item_name:'작두콩차'}}],14);
  assert.equal(rows[0].recommendedQuantity,9);
  assert.match(remaining.replenishmentRowsToCsv(rows),/상품명,SKU,쿠팡 상품번호/);
  assert.match(remaining.replenishmentRowsToText(rows),/14일 목표 9개 입고 검토/);
});

test('22-6 connects the shared bulk controls to notifications and Rocket Growth inventory',()=>{
  const notifications=fs.readFileSync('app/_reliability/harin-notification-center.js','utf8');
  const inventory=fs.readFileSync('app/unified-inventory-operations-center.js','utf8');
  assert.match(notifications,/notificationBulkSelectionBar/);
  assert.match(notifications,/실패 \$\{failed\.length\}건은 다시 선택해 두었습니다/);
  assert.match(notifications,/외부 이메일은 발송하지 않고 허브 안의 알림 상태만 바꿉니다/);
  assert.match(inventory,/inventoryBulkSelectionBar/);
  assert.match(inventory,/replenishmentRowsToCsv/);
  assert.match(inventory,/쿠팡 재고와 입고 요청은 변경하지 않습니다/);
});

test('22-6 mobile bulk bars are fixed to the viewport after the page entrance animation',()=>{
  const design=fs.readFileSync('app/_design-system/harin-v8.css','utf8');
  assert.match(design,/@keyframes v8SurfaceEnter\{from\{opacity:0;transform:translateY\(7px\)\}to\{opacity:1;transform:none\}\}/);
  assert.doesNotMatch(design,/v8SurfaceEnter 260ms[^\n}]*\bboth\b/);
});
