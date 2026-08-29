'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');

test('server owns inventory and products adapters for their actual routes',()=>{
  const page=read('app/page.js');
  assert.match(page,/phase28Runtime\.activePages\.includes\('inventory'\)&&initialState\.view==='inventory'/);
  assert.match(page,/buildPhase28InventoryModel\(dashboardData\)/);
  assert.match(page,/phase28Runtime\.activePages\.includes\('products'\)&&initialState\.view==='product'/);
  assert.match(page,/buildPhase28ProductsModel\(dashboardData\)/);
});

test('Phase 28 app renders the V106 inventory-products workbench for both routes',()=>{
  const app=read('app/_phase28/phase28-app.js');
  const page=read('app/_phase28/pages/inventory-products-page.js');
  assert.match(app,/import Phase28InventoryProductsPage from '\.\/pages\/inventory-products-page\.js'/);
  assert.match(app,/routeId==='inventory'\|\|routeId==='products'/);
  assert.match(page,/data-phase28-page=\{mode\}/);
  assert.match(page,/<i>01<\/i><span><strong>재고 운영/);
  assert.match(page,/<i>02<\/i><span><strong>상품 운영/);
  assert.match(page,/재고 보유일 레일/);
  assert.match(page,/판매 판단까지 네 개의 문/);
  assert.match(page,/Phase28RightRailLayout/);
});

test('V106 inventory keeps real collection and owner-confirmed LOT seams',()=>{
  const page=read('app/_phase28/pages/inventory-products-page.js');
  assert.match(page,/fetch\('\/api\/coupang\/rg-inventory\/sync'/);
  assert.match(page,/fetch\('\/api\/inventory\/lots'/);
  assert.match(page,/window\.confirm/);
  assert.match(page,/router\.refresh\(\)/);
  assert.doesNotMatch(page,/fetch\([^\n]*inventory[^\n]*method:'DELETE'/);
});

test('V106 inventory-products CSS preserves readable balanced fixed UI',()=>{
  const css=read('app/_phase28/pages/inventory-products-page.css');
  assert.match(css,/max-width:2300px/);
  assert.match(css,/min-height:104px/);
  assert.match(css,/font-size:17px/);
  assert.match(css,/min-height:44px/);
  assert.match(css,/box-shadow:inset 0 0 0 1px/);
  assert.match(css,/@media \(max-width:760px\)/);
  assert.match(css,/@media \(prefers-reduced-motion:reduce\)/);
  assert.doesNotMatch(css,/border-left\s*:/);
  assert.doesNotMatch(css,/linear-gradient|radial-gradient|backdrop-filter/);
  assert.doesNotMatch(css,/font-size:(?:[0-9]|1[01])px/);
});

test('the local V106 verification host can load Next development assets',()=>{
  const config=read('next.config.js');
  assert.match(config,/allowedDevOrigins:\['127\.0\.0\.1'\]/);
});
