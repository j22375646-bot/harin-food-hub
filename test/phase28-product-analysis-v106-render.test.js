'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');

test('product analysis owns a stable production route and server adapter',()=>{
  const route=read('app/product-analysis/page.js');
  const registry=read('lib/ui/phase28-route-registry.js');
  assert.equal(fs.existsSync(path.join(root,'app/product-analysis/layout.js')),true,'product analysis shared shell layout is missing');
  const layout=read('app/product-analysis/layout.js');
  assert.match(route,/loadPhase28ProductAnalysisSnapshot/);
  assert.match(route,/buildPhase28ProductAnalysisModel\(snapshot\)/);
  assert.match(route,/Phase28ProductAnalysisPage/);
  assert.doesNotMatch(route,/renderDashboardRoute/);
  assert.match(layout,/Phase28Shell/);
  assert.match(layout,/routeId="product-analysis"/);
  assert.match(registry,/id:'product-analysis'.*legacyView:'product-analysis'/);
});

test('V106 product analysis renders the runner, saved ledger, marketer report, and decision desk',()=>{
  const app=read('app/_phase28/phase28-app.js');
  const page=read('app/_phase28/pages/product-analysis-page.js');
  assert.match(app,/Phase28ProductAnalysisPage/);
  assert.match(app,/routeId==='product-analysis'/);
  assert.match(page,/data-phase28-page="product-analysis"/);
  assert.match(page,/상품과 기간을 정하면/);
  assert.match(page,/저장된 분석/);
  assert.match(page,/NAVER MARKETER REPORT/);
  assert.match(page,/PRODUCT DECISION DESK/);
  assert.match(page,/Phase28RightRailLayout/);
  assert.doesNotMatch(page,/재고|inventory/i);
});

test('manual analysis uses one authenticated server route and keeps unavailable evidence visible',()=>{
  const page=read('app/_phase28/pages/product-analysis-page.js');
  const api=read('app/api/product-analysis/route.js');
  const report=read('lib/analytics/product-analysis-report.js');
  assert.match(page,/fetch\('\/api\/product-analysis'/);
  assert.match(page,/product_id/);
  assert.match(page,/period_days/);
  assert.match(api,/validateSession|verifySession/);
  assert.match(api,/create_report_version/);
  assert.match(report,/SETUP_REQUIRED/);
  assert.doesNotMatch(api,/revenue:0,orders:0,units:0/);
  assert.doesNotMatch(page,/NEXT_PUBLIC_.*KEY/);
  assert.doesNotMatch(api,/st-[A-Za-z0-9_-]{20,}/);
});

test('product analysis CSS keeps the fixed readable scale and balanced selection',()=>{
  const css=read('app/_phase28/pages/product-analysis-page.css');
  assert.match(css,/max-width:2300px/);
  assert.match(css,/min-height:190px/);
  assert.match(css,/min-height:44px/);
  assert.match(css,/font-size:17px/);
  assert.match(css,/@media \(max-width:760px\)/);
  assert.match(css,/@media \(prefers-reduced-motion:reduce\)/);
  assert.doesNotMatch(css,/border-left\s*:/);
  assert.doesNotMatch(css,/linear-gradient|radial-gradient|backdrop-filter/);
  assert.doesNotMatch(css,/font-size:(?:[0-9]|1[01])px/);
});
