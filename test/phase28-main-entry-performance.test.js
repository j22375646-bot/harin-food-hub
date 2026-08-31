'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');

test('first authenticated entry uses a dedicated lightweight Main server module',()=>{
  const entry=read('app/page.js');
  assert.match(entry,/loadPhase28MainDashboard/);
  assert.match(entry,/buildPhase28MainModel/);
  assert.match(entry,/phase28-home-app\.js/);
  assert.doesNotMatch(entry,/dashboard-client/);
  assert.doesNotMatch(entry,/profitabilityModule|naverBidWorkbenchModule|buildPhase28OrdersModel|renderDashboardState/);
  assert.ok(entry.length<8000,'root page must stay small enough to avoid loading every route loader on login');
});

test('Main client entry imports only the home page instead of the all-route client registry',()=>{
  const client=read('app/_phase28/phase28-home-app.js');
  assert.match(client,/from '\.\/pages\/home-page\.js'/);
  assert.match(client,/Phase28Shell/);
  assert.doesNotMatch(client,/next\/dynamic|keywords-page|orders-page|insights-page/);
});

test('legacy and non-main routes keep the broad dashboard module out of the login landing route',()=>{
  const entry=read('app/page.js');
  const orders=read('app/orders/page.js');
  const legacyMain=read('app/dashboard/page.js');
  assert.doesNotMatch(entry,/dashboard-route\.js/);
  assert.match(entry,/redirect\(hubRoutesModule\.buildHubHref\(initialState\)\)/);
  assert.match(legacyMain,/from '\.\.\/dashboard-route\.js'/);
  assert.match(orders,/from '\.\.\/dashboard-route\.js'/);
  assert.ok(fs.existsSync(path.join(root,'app/dashboard-route.js')));
});

test('Main data loader starts independent data sources together and exposes a query budget',()=>{
  const loader=read('lib/dashboard/phase28-main-loader.js');
  assert.match(loader,/Promise\.all\(\[\s*Promise\.allSettled\(/);
  assert.match(loader,/MAIN_REMOTE_QUERY_BUDGET/);
  assert.match(loader,/monthlyRevenueModule\.fetchMonthlyRevenue/);
  assert.match(loader,/const MAIN_REMOTE_QUERY_BUDGET=24/);
  assert.match(loader,/naver_stats_daily/);
  assert.match(loader,/coupang_ad_daily_summary/);
  assert.match(loader,/product_costs/);
  assert.doesNotMatch(loader,/naver_keyword_stats|coupang_ad_keyword_daily|financial_change_requests/);
});
