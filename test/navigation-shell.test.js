'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const client=fs.readFileSync(path.join(__dirname,'..','app','dashboard-client.js'),'utf8');
const styles=fs.readFileSync(path.join(__dirname,'..','app','globals.css'),'utf8');
const validation=fs.readFileSync(path.join(__dirname,'..','app','customer-retention-validation-center.js'),'utf8');
const page=fs.readFileSync(path.join(__dirname,'..','app','page.js'),'utf8');
const loading=fs.readFileSync(path.join(__dirname,'..','app','loading.js'),'utf8');
const preferences=fs.readFileSync(path.join(__dirname,'..','app','use-hub-preference.js'),'utf8');
const collectionCenter=fs.readFileSync(path.join(__dirname,'..','app','unified-collection-operations-center.js'),'utf8');

test('desktop navigation includes grouped expansion, menu search, badges, and breadcrumbs', () => {
  assert.match(client,/function SidebarMenu/);
  assert.match(client,/placeholder="메뉴 이름 찾기"/);
  assert.match(client,/aria-expanded=\{expanded\}/);
  assert.match(client,/function BreadcrumbBar/);
  assert.match(client,/최근 갱신/);
  assert.match(styles,/\.sidebarGroup\.expanded/);
  assert.match(styles,/\.hubBreadcrumb/);
});

test('Next route navigation restores the active sidebar group and prefetches destinations', () => {
  assert.match(client,/window\.addEventListener\('popstate',syncFromAddress\)/);
  assert.match(client,/setOpenNavGroup\(hubRoutesModule\.groupForView\(next\.view\)\)/);
  assert.match(client,/router\[replace\|\|current===href\?'replace':'push'\]\(href,\{scroll:false\}\)/);
  assert.match(client,/router\.prefetch\(hubRoutesModule\.buildHubHref/);
});

test('mobile all-functions menu keeps the same groups and closes after selection', () => {
  assert.match(client,/function MobileMoreMenu/);
  assert.match(client,/\['main','orders','inventory','notifications'\]/);
  assert.match(client,/>더보기<\/span>/);
  assert.match(client,/closest\('details'\)\?\.removeAttribute\('open'\)/);
  assert.match(styles,/grid-template-columns:repeat\(5,1fr\)/);
  assert.match(styles,/\.mobileGroupedMenu>section>div/);
});

test('phase 10-6 scopes database tables per page and shows useful loading feedback', () => {
  assert.match(page,/const VIEW_TABLES =/);
  assert.match(page,/function databaseForView\(db, view\)/);
  assert.match(page,/loadedView:view/);
  assert.match(client,/viewIsLoading/);
  assert.match(client,/financialContextViews\.has\(view\)&&<FinancialTrustBanner/);
  assert.match(client,/dynamic\(\(\)=>import\('\.\/product-growth-center\.js'\)\)/);
  assert.match(loading,/Loading/);
});

test('12-3 uses stable date keys across the executive board and legacy Naver snapshot', () => {
  assert.match(page,/const weekStart=latestNaverDate\?shiftDate\(latestNaverDate,-6\):null/);
  assert.doesNotMatch(page,/weekStart\.toISOString\(\)/);
});

test('main renders only the all-channel command center and links channel details to work pages', () => {
  assert.match(client,/\{channelScopedViews\.has\(view\)&&<section className="platformSwitch"/);
  assert.doesNotMatch(client,/view==='main' && platform!=='all'/);
  assert.doesNotMatch(client,/view==='main' && !channelUnavailable && <MainView/);
  assert.match(client,/onOpen\(\{view:'insight',platform:item\.platform\}\)/);
  assert.match(client,/view==='insight' && !channelUnavailable && \['naver','cafe24'\]\.includes\(platform\) && <details className="channelLegacyDetails"/);
  assert.match(styles,/Phase 10-3 — the main page is one all-channel command center/);
});

test('phase 10-4 separates Coupang work into four sidebar pages', () => {
  assert.match(client,/function CoupangOrdersView/);
  assert.match(client,/function CoupangCsView/);
  assert.match(client,/function CoupangInventoryView/);
  assert.match(client,/function CoupangSettlementView/);
  assert.match(client,/function CoupangSalesCenter/);
  assert.doesNotMatch(client,/function CoupangCommandCenter/);
  assert.match(client,/view==='orders' && \(<UnifiedOrdersCenter/);
  assert.match(client,/<CoupangOrdersView coupang=\{initialData\.coupang\}\/>/);
  assert.match(client,/view==='cs' && \(<UnifiedCustomerServiceCenter/);
  assert.match(client,/view==='inventory' && \(<UnifiedInventoryOperationsCenter/);
  assert.match(client,/<CoupangInventoryView coupang=\{initialData\.coupang\}\/\><\/UnifiedInventoryOperationsCenter>/);
  assert.match(client,/view==='settlement' && \(<UnifiedSettlementOperationsCenter/);
  assert.match(styles,/Phase 10-4 — orders, CS, inventory and settlement are independent work pages/);
});

test('phase 11-8 keeps prior operations and adds unified data collection operations', () => {
  assert.match(client,/13-2 · 공통 디자인 시스템/);
  assert.match(client,/UnifiedProductOperationsCenter/);
  assert.match(client,/UnifiedInventoryOperationsCenter/);
  assert.match(client,/UnifiedSettlementOperationsCenter/);
  assert.match(client,/UnifiedCollectionOperationsCenter/);
  assert.match(client,/initialData\.unifiedInventory/);
  assert.match(client,/initialData\.unifiedSettlement/);
  assert.match(client,/initialData\.collectionCenter/);
  assert.ok(page.indexOf('const generatedAt = new Date().toISOString()') < page.indexOf('const unifiedInventory ='));
  assert.ok(page.indexOf('const generatedAt = new Date().toISOString()') < page.indexOf('const unifiedSettlement ='));
  assert.match(page,/settlement:\['cafe24_orders'/);
  assert.match(client,/<CoupangSettlementView coupang=\{initialData\.coupang\}\/><\/UnifiedSettlementOperationsCenter>/);
  assert.match(styles,/Phase 11-7 · unified settlement and cost operations/);
  assert.match(styles,/Phase 11-8 · unified data collection operations/);
  assert.match(client,/center=\{collectionCenter\}/);
  assert.match(collectionCenter,/전체 수집 \+ 검증/);
  assert.match(client,/view==='validation' && \(<CustomerRetentionValidationCenter/);
  assert.match(client,/view==='experiments' && <ExperimentLab/);
  assert.doesNotMatch(client,/phase7LegacyLab/);
  assert.match(validation,/실행검증 운영센터/);
  assert.match(validation,/useState\('execution'\)/);
  assert.match(validation,/실행검증 화면 선택/);
  assert.doesNotMatch(validation,/진행 실험 자동평가/);
  assert.match(styles,/Phase 10-5 — analysis and execution pages use only relevant channel controls/);
});

test('phase 10-7 remembers reading scale, help state, and primary list filters', () => {
  assert.match(preferences,/window\.localStorage/);
  assert.match(client,/aria-label="허브 글자 크기"/);
  assert.match(client,/useStoredState\(`help:/);
  assert.match(client,/filter:orders-status/);
  assert.match(client,/filter:inventory/);
  assert.match(client,/filter:notifications/);
  assert.match(styles,/data-font-scale="xlarge"/);
});
