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
  assert.match(entry,/verifiedRequestSession/);
  assert.match(entry,/headers\(\)/);
  assert.doesNotMatch(entry,/dashboard-client/);
  assert.doesNotMatch(entry,/profitabilityModule|naverBidWorkbenchModule|buildPhase28OrdersModel|renderDashboardState/);
  assert.ok(entry.length<8000,'root page must stay small enough to avoid loading every route loader on login');
});

test('login redirect keeps the persistent Phase 28 shell while Main data streams inside it',()=>{
  const entry=read('app/page.js');
  assert.equal(fs.existsSync(path.join(root,'app/loading.js')),false);
  assert.match(entry,/Suspense/);
  assert.match(entry,/Phase28Shell/);
  assert.match(entry,/routeId="home"/);
  assert.match(entry,/fallback=\{<Phase28Loading\/>\}/);
  const fallback=read('app/_phase28/phase28-loading.js');
  assert.match(fallback,/HarinRouteSkeleton/);
  assert.match(fallback,/오늘 운영 화면/);
});

test('Main client entry imports only the home page instead of the all-route client registry',()=>{
  const client=read('app/_phase28/phase28-home-app.js');
  assert.match(client,/from '\.\/pages\/home-page\.js'/);
  assert.doesNotMatch(client,/Phase28Shell/);
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
  assert.match(loader,/const MAIN_REMOTE_QUERY_BUDGET=35/);
  assert.match(loader,/historyMonthKeys/);
  assert.match(loader,/historyMonthlyRevenueResults/);
  assert.match(loader,/naver_stats_daily/);
  assert.match(loader,/coupang_ad_daily_summary/);
  assert.match(loader,/product_costs/);
  assert.match(loader,/naver_commerce_settlements/);
  assert.match(loader,/coupang_settlements/);
  assert.match(loader,/coupang_cost_transactions/);
  assert.match(loader,/cafe24_sales_daily/);
  assert.match(loader,/channel_cost_calibrations/);
  assert.match(loader,/buildUnifiedSettlementCenter/);
  assert.match(loader,/withEffectiveChannelSettings/);
  assert.doesNotMatch(loader,/naver_keyword_stats|coupang_ad_keyword_daily|financial_change_requests/);
});

test('Main refreshes fresh server evidence while the page remains open',()=>{
  const client=read('app/_phase28/phase28-home-app.js');
  assert.match(client,/useEffect/);
  assert.match(client,/visibilitychange/);
  assert.match(client,/setInterval/);
  assert.match(client,/router\.refresh\(\)/);
});
