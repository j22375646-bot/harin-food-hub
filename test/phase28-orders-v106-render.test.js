'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');

test('the Phase 28 application renders the V106 orders page without a legacy work center',()=>{
  const app=read('app/_phase28/phase28-app.js');
  assert.match(app,/const Phase28OrdersPage=dynamic\(\(\)=>import\('\.\/pages\/orders-page\.js'\)/);
  assert.match(app,/routeId==='orders'/);
  assert.match(app,/<Phase28OrdersPage model=\{initialData\.phase28\?\.orders\|\|\{\}\}/);
  assert.doesNotMatch(app,/UnifiedOrdersCenter|Phase28OrdersDashboard/);
});

test('the V106 orders surface keeps the approved runway, stable rail, and real action seams',()=>{
  const page=read('app/_phase28/pages/orders-page.js');
  const css=read('app/_phase28/pages/orders-page.css');
  const primitives=read('app/_phase28/primitives/primitives.module.css');

  assert.match(page,/오늘의 출고 레일/);
  assert.match(page,/data-phase28-orders-stage/);
  assert.match(page,/role="tablist"/);
  assert.match(page,/aria-selected=/);
  assert.match(page,/Phase28RightRailLayout/);
  assert.match(page,/\/api\/orders\/live-refresh/);
  assert.match(page,/\/api\/epost\/issue/);
  assert.match(page,/\/api\/shipping\/actions/);
  assert.match(page,/window\.confirm/);
  assert.match(page,/\{selectedIds\.size\?<div className="mobileBatchAction"/);
  assert.match(page,/useState\(''\);[\s\S]*if\(!statusMessage\)return undefined;/);

  assert.match(css,/max-width:2300px/);
  assert.match(css,/grid-template-columns:repeat\(5,minmax\(0,1fr\)\)/);
  assert.match(css,/\.p28OrdersPage \.orderRow\{display:grid;/);
  assert.match(css,/\.p28OrdersPage \.orderProduct\{min-width:0;display:flex;flex-direction:row;align-items:center;/);
  assert.match(css,/@media \(max-width:1300px\)\{[\s\S]*?\.p28OrdersPage \.orderRow\{grid-template-columns:28px minmax\(0,1fr\)/);
  assert.match(css,/@media \(max-width:760px\)/);
  assert.match(css,/\.freshnessChannels>span>span:last-child\{display:none;\}/);
  assert.match(css,/@media \(prefers-reduced-motion:reduce\)/);
  assert.match(primitives,/\.heading p\{[^}]*font-size:18px!important;[^}]*line-height:1\.55!important/);
  assert.doesNotMatch(css,/border-left\s*:/);
});

test('orders rail panels share one grid cell so tab changes do not move the page',()=>{
  const css=read('app/_phase28/pages/orders-page.css');
  assert.match(css,/\.ordersRailPanels\{display:grid;grid-template-columns:minmax\(0,1fr\);grid-template-rows:minmax\(0,1fr\)/);
  assert.match(css,/grid-column:1;grid-row:1/);
  assert.match(css,/visibility:hidden/);
  assert.match(css,/pointer-events:none/);
});
