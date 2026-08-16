'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const client=fs.readFileSync(path.join(__dirname,'..','app','dashboard-client.js'),'utf8');
const shell=fs.readFileSync(path.join(__dirname,'..','app','_shell','harin-app-shell.js'),'utf8');
const styles=fs.readFileSync(path.join(__dirname,'..','app','globals.css'),'utf8');
const shellStyles=fs.readFileSync(path.join(__dirname,'..','app','_shell','harin-shell-v8.css'),'utf8');
const validation=fs.readFileSync(path.join(__dirname,'..','app','customer-retention-validation-center.js'),'utf8');
const page=fs.readFileSync(path.join(__dirname,'..','app','page.js'),'utf8');
const loading=fs.readFileSync(path.join(__dirname,'..','app','loading.js'),'utf8');
const preferences=fs.readFileSync(path.join(__dirname,'..','app','use-hub-preference.js'),'utf8');
const collectionCenter=fs.readFileSync(path.join(__dirname,'..','app','unified-collection-operations-center.js'),'utf8');

test('desktop navigation includes grouped expansion, menu search, badges, and breadcrumbs', () => {
  assert.match(shell,/function HarinSidebar/);
  assert.match(shell,/placeholder="메뉴·업무 찾기"/);
  assert.match(shell,/aria-expanded=\{expanded\}/);
  assert.match(shell,/function HarinBreadcrumbBar/);
  assert.match(shell,/최근 갱신/);
  assert.match(shellStyles,/\.harinV8 \.sidebarGroup\.expanded/);
  assert.match(shellStyles,/\.harinV8 \.hubBreadcrumb/);
});

test('Next route navigation restores the active sidebar group and prefetches destinations', () => {
  assert.match(client,/window\.addEventListener\('popstate',syncFromAddress\)/);
  assert.match(client,/setOpenNavGroup\(hubRoutesModule\.groupForView\(next\.view\)\)/);
  assert.match(client,/router\[replace\|\|current===href\?'replace':'push'\]\(href,\{scroll:false\}\)/);
  assert.match(client,/router\.prefetch\(hubRoutesModule\.buildHubHref/);
});

test('mobile all-functions menu keeps the same groups and closes after selection', () => {
  assert.match(shell,/function HarinMobileNavigation/);
  assert.match(shell,/\['main','orders','inventory','notifications'\]/);
  assert.match(shell,/>더보기<\/span>/);
  assert.match(shell,/className="mobileNavGroup"/);
  assert.match(shell,/className="mobileMenuBackdrop"/);
  assert.match(shell,/className="mobileMenuPanelHead"/);
  assert.match(shell,/group\.description/);
  assert.match(shell,/event\.key==='Escape'/);
  assert.match(shell,/document\.body\.style\.overflow='hidden'/);
  assert.doesNotMatch(shell,/removeAttribute\('open'\)/);
  assert.match(shellStyles,/grid-template-columns:repeat\(5,minmax\(0,1fr\)\)/);
  assert.match(shellStyles,/\.harinV8 \.mobileNavGroup>div/);
  assert.match(shellStyles,/\.mobileMenuGroups\{display:flex/);
});

test('phase 10-6 scopes database tables per page and shows useful loading feedback', () => {
  assert.match(page,/const VIEW_TABLES =/);
  assert.match(page,/function databaseForView\(db, view, workspace\)/);
  assert.match(page,/loadedView:view/);
  assert.match(client,/viewIsLoading/);
  assert.match(client,/financialContextViews\.has\(view\)&&<FinancialTrustBanner/);
  assert.match(client,/dynamic\(\(\)=>import\('\.\/product-growth-center\.js'\),\{loading:LazyWorkbenchFallback\}\)/);
  assert.match(loading,/Loading/);
});

test('12-3 uses stable date keys across the executive board and legacy Naver snapshot', () => {
  assert.match(page,/const weekStart=latestNaverDate\?shiftDate\(latestNaverDate,-6\):null/);
  assert.doesNotMatch(page,/weekStart\.toISOString\(\)/);
});

test('main renders only the all-channel command center and links channel details to work pages', () => {
  assert.match(client,/\{channelScopedViews\.has\(view\)&&\(view!==\'product\'\|\|workspace===\'catalog\'\)&&<section className="platformSwitch"/);
  assert.doesNotMatch(client,/view==='main' && platform!=='all'/);
  assert.doesNotMatch(client,/view==='main' && !channelUnavailable && <MainView/);
  assert.match(client,/view:item\.view\|\|'main'/);
  assert.match(client,/view==='insight' && workspace==='channels'/);
  assert.match(client,/\['naver','cafe24'\]\.includes\(platform\)\?<details className="channelLegacyDetails"/);
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

test('phase 15-1 keeps prior operations while removing repeated development chrome', () => {
  assert.doesNotMatch(shell,/14-11 · 최종 품질·운영 안정화/);
  assert.match(client,/function DataStatusPanel/);
  assert.match(client,/pageDataStatus/);
  assert.match(client,/embeddedHelpViews/);
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
  assert.match(client,/view==='validation' && <HarinExecutionWorkbench view="validation".*<CustomerRetentionValidationCenter/);
  assert.match(client,/view==='experiments' && <HarinExecutionWorkbench view="experiments".*<ExperimentLab/);
  assert.doesNotMatch(client,/phase7LegacyLab/);
  assert.match(validation,/실행검증 운영센터/);
  assert.match(validation,/useState\('execution'\)/);
  assert.match(validation,/실행검증 화면 선택/);
  assert.doesNotMatch(validation,/진행 실험 자동평가/);
  assert.match(styles,/Phase 10-5 — analysis and execution pages use only relevant channel controls/);
});

test('phase 10-7 remembers reading scale, help state, and primary list filters', () => {
  assert.match(preferences,/window\.localStorage/);
  assert.match(shell,/aria-label="허브 글자 크기"/);
  assert.match(client,/useStoredState\(`help:/);
  assert.match(client,/filter:orders-status/);
  assert.match(client,/filter:inventory/);
  assert.match(client,/filter:notifications/);
  assert.match(styles,/data-font-scale="xlarge"/);
  assert.match(client,/fontScale=\{fontScale\} onFontScale=\{setFontScale\}/);
});
