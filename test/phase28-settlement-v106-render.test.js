'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');

test('server owns three settlement periods and the settlement adapter on its real route',()=>{
  const page=read('app/dashboard-route.js');
  const profiles=read('lib/dashboard/page-loader-profiles.js');
  assert.match(page,/const settlementPeriods=Object\.fromEntries\(\[7,30,90\]/);
  assert.match(page,/periodDays/);
  assert.match(page,/phase28Runtime\.activePages\.includes\('settlement'\)&&initialState\.view==='settlement'/);
  assert.match(page,/buildPhase28SettlementModel\(dashboardData\)/);
  assert.match(page,/settlement:null,adapter_status:'ERROR'/);
  assert.match(page,/coupang_ad_settlement_daily/);
  assert.match(page,/settlement:\[[^\n]*'automation_runs'/);
  assert.match(profiles,/settlement:\[[^\n]*'automation_runs'/);
  assert.match(page,/coupangAdSettlements:coupangAdSettlementResult\.data \|\| \[\]/);
  assert.match(page,/coupangRgOrders:coupangRgOrdersResult\.data \|\| \[\]/);
  assert.match(page,/coupangRgOrderItems:coupangRgOrderItemsResult\.data \|\| \[\]/);
  assert.match(page,/cafe24FinanceSync:/);
  assert.match(page,/\.eq\('platform','CAFE24'\)\.eq\('job_type','FETCH_ALL'\)/);
  assert.match(page,/syncs:\[\.\.\.cafe24FinanceSyncRows,\.\.\.\(syncResult\.data \|\| \[\]\)\]/);
});

test('Phase 28 app renders the V106 settlement decision spine',()=>{
  const app=read('app/_phase28/phase28-app.js');
  const page=read('app/_phase28/pages/settlement-page.js');
  assert.match(app,/const Phase28SettlementPage=dynamic\(\(\)=>import\('\.\/pages\/settlement-page\.js'\)/);
  assert.match(app,/routeId==='settlement'/);
  assert.match(page,/data-phase28-page="settlement"/);
  assert.match(page,/판매금이 실제 지급액이 되기까지/);
  assert.match(page,/총매출에서 실제 지급까지/);
  assert.match(page,/로켓그로스 매출 반영/);
  assert.match(page,/총매출에 한 번만 포함/);
  assert.match(page,/spRocketGrowthFlow/);
  assert.match(page,/spRocketGrossBar/);
  assert.match(page,/spRocketNetBar/);
  assert.match(page,/0원선에서 벗어난 금액/);
  assert.match(page,/가까운 입금과 막힌 근거/);
  assert.match(page,/정산 대조 작업공간/);
  assert.match(page,/네이버 광고비/);
  assert.match(page,/비즈머니 충전/);
  assert.match(page,/실제 사용 광고비/);
  assert.match(page,/Phase28RightRailLayout/);
  assert.match(page,/COUPANG_RG/);
  assert.match(page,/router\.refresh\(\)/);
  assert.match(page,/자동 대조/);
  assert.match(page,/data-chain-connected/);
  assert.match(page,/data-partial/);
});

test('settlement page keeps money read-only while allowing authenticated source collection',()=>{
  const page=read('app/_phase28/pages/settlement-page.js');
  assert.match(page,/fetch\('\/api\/sync\/all'/);
  assert.match(page,/method:'POST'/);
  assert.match(page,/credentials:'same-origin'/);
  assert.match(page,/정산 전체 동기화/);
  assert.doesNotMatch(page,/지급\s*(?:실행|요청)|정산\s*수정/);
  assert.match(page,/channel\.recovery/);
  assert.match(page,/recovery\.kind==='workspace'/);
  assert.match(page,/recovery\.kind==='external'/);
  assert.match(page,/target="_blank" rel="noreferrer"/);
  assert.match(page,/pushPhase28Route\(router,actionTarget\)/);
  assert.match(page,/확인 필요/);
});

test('V106 settlement CSS keeps the fixed readable responsive UI',()=>{
  const css=read('app/_phase28/pages/settlement-page.css');
  assert.match(css,/max-width:2300px/);
  assert.match(css,/min-height:104px/);
  assert.match(css,/min-height:44px/);
  assert.match(css,/font-size:17px/);
  assert.match(css,/border-color:var\(--sp-blue\)/);
  assert.match(css,/@media \(max-width:760px\)/);
  assert.match(css,/@media \(prefers-reduced-motion:reduce\)/);
  assert.match(css,/\.spRocketGrowthFlow/);
  assert.match(css,/\.spRocketGrossBar/);
  assert.match(css,/\.spRocketNetBar/);
  assert.match(css,/data-tone="review"/);
  assert.doesNotMatch(css,/border-left\s*:/);
  assert.doesNotMatch(css,/linear-gradient|radial-gradient|backdrop-filter/);
  assert.doesNotMatch(css,/font-size:(?:[0-9]|1[01])px/);
});
