'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');

test('server owns the keywords adapter only on the real keyword route',()=>{
  const page=read('app/page.js');
  assert.match(page,/phase28Runtime\.activePages\.includes\('keywords'\)&&initialState\.view==='keyword'/);
  assert.match(page,/buildPhase28KeywordsModel\(dashboardData,\{platform:initialState\.platform,workspace:initialState\.workspace\}\)/);
  assert.match(page,/keywords:null,adapter_status:'ERROR'/);
});

test('Phase 28 app renders the V106 keyword flow, workbench, and decision desk',()=>{
  const app=read('app/_phase28/phase28-app.js');
  const page=read('app/_phase28/pages/keywords-page.js');
  assert.match(app,/import Phase28KeywordsPage from '\.\/pages\/keywords-page\.js'/);
  assert.match(app,/routeId==='keywords'/);
  assert.match(page,/data-phase28-page="keywords"/);
  assert.match(page,/광고비가 주문으로 이어지는 흐름/);
  assert.match(page,/주문 없이 쓴 광고비/);
  assert.match(page,/키워드 운영표/);
  assert.match(page,/수정 입찰가/);
  assert.match(page,/KEYWORD DECISION DESK/);
  assert.match(page,/Phase28RightRailLayout/);
});

test('keyword bid changes preserve the existing owner-confirmed proposal and verification route',()=>{
  const page=read('app/_phase28/pages/keywords-page.js');
  assert.match(page,/fetch\('\/api\/naver\/bid-proposals'/);
  assert.match(page,/CONFIRM_EXECUTE/);
  assert.match(page,/snapshot_token/);
  assert.match(page,/owner_desired_bid/);
  assert.match(page,/idempotency-key/);
  assert.match(page,/external_execution_locked|실제 반영/);
  assert.doesNotMatch(page,/NEXT_PUBLIC_.*KEY/);
});

test('V106 keyword CSS keeps readable fixed UI and neutral balanced selection',()=>{
  const css=read('app/_phase28/pages/keywords-page.css');
  assert.match(css,/max-width:2300px/);
  assert.match(css,/min-height:104px/);
  assert.match(css,/min-height:44px/);
  assert.match(css,/font-size:17px/);
  assert.match(css,/@media \(max-width:760px\)/);
  assert.match(css,/@media \(prefers-reduced-motion:reduce\)/);
  assert.doesNotMatch(css,/border-left\s*:/);
  assert.doesNotMatch(css,/linear-gradient|radial-gradient|backdrop-filter/);
  assert.doesNotMatch(css,/font-size:(?:[0-9]|1[01])px/);
});
