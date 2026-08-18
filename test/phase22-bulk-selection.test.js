'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const selection=require('../lib/ui/bulk-selection.js');

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
  assert.match(keyword,/HarinBulkSelectionBar/);
  assert.match(keyword,/onToggleFiltered=\{checked=>selection\.toggleScope\(filteredIds,checked\)\}/);
  assert.match(css,/\.v8BulkSelectionBar\.active/);
  assert.match(css,/@media\(max-width:700px\)/);
});

test('22-3 applies the shared bulk bar to orders and product mapping',()=>{
  const orders=fs.readFileSync('app/unified-orders-center.js','utf8');
  const products=fs.readFileSync('app/dashboard-client.js','utf8');
  assert.match(orders,/useHarinBulkSelection/);
  assert.match(orders,/현재 화면 또는 검색 결과의 출고 가능 주문만 선택합니다/);
  assert.match(orders,/로켓그로스·취소 완료·선택 불가 주문은 일괄 작업에서 자동 제외됩니다/);
  assert.match(products,/BULK_AUTO_LINK/);
  assert.match(products,/BULK_REJECT/);
  assert.match(products,/BULK_UNLINK/);
});

test('22-3 keeps Naver and Coupang mapping and keyword workspaces separated',()=>{
  const products=fs.readFileSync('app/dashboard-client.js','utf8');
  const keywords=fs.readFileSync('app/_analysis/keyword-operations-table.js','utf8');
  assert.match(products,/\['NAVER','naver','네이버 스마트스토어'\],\['COUPANG','coupang','쿠팡'\]/);
  assert.match(products,/다른 채널 상품에는 적용되지 않습니다/);
  assert.match(products,/네이버 광고그룹은 계속 제외됩니다/);
  assert.match(keywords,/platform==='NAVER'/);
  assert.match(keywords,/platform==='COUPANG'/);
});
