const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.join(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');

test('14-6 keeps Insights Keywords and Products on separate real routes',()=>{
  const routes=read('lib/navigation/hub-routes.js');
  assert.match(routes,/href:'\/insights\/overview'/);
  assert.match(routes,/href:'\/keywords\/search-terms'/);
  assert.match(routes,/href:'\/products\/catalog'/);
  assert.match(read('app/dashboard-client.js'),/HarinAnalysisWorkbench view="insight"/);
  assert.match(read('app/dashboard-client.js'),/HarinAnalysisWorkbench view="keyword"/);
  assert.match(read('app/dashboard-client.js'),/HarinAnalysisWorkbench view="product"/);
});

test('14-6 adds saved comparison anomaly selection and keyword stop-loss preview',()=>{
  const source=read('app/_analysis/harin-analysis-workbench.js');
  assert.match(source,/SAVED COMPARISON/);
  assert.match(source,/ANOMALY PICKER/);
  assert.match(source,/STOP-LOSS PREVIEW/);
  assert.match(source,/실제 검색어 결정/);
  assert.match(source,/자동 중지 안 함/);
});

test('14-6 product workbench keeps sellable catalog channel differences costs and offers reachable',()=>{
  const source=read('app/_analysis/harin-analysis-workbench.js');
  assert.match(source,/SELLABLE PRODUCT CONTROL/);
  assert.match(source,/catalog_status==='SELLING'/);
  assert.match(source,/\/products\/mappings/);
  assert.match(source,/\/products\/costs/);
  assert.match(source,/\/products\/offers/);
  assert.match(source,/\/products\/ad-targets/);
});

test('14-6 page AI stays separated and zero-cost guard remains in the page panel',()=>{
  const dashboard=read('app/dashboard-client.js');
  const panel=read('app/harin-ai-page-panel.js');
  assert.match(dashboard,/aiPagePanels\?\.insight/);
  assert.match(dashboard,/aiPagePanels\?\.keyword/);
  assert.match(dashboard,/aiPagePanels\?\.product/);
  assert.match(panel,/사용 시작 전 · 비용 0원/);
});

test('14-6 has responsive pastel workbench styles and readable mobile layouts',()=>{
  const css=read('app/_analysis/harin-analysis-v8.css');
  assert.match(css,/\.analysisHero/);
  assert.match(css,/var\(--v8-lavender-soft\)/);
  assert.match(css,/var\(--v8-blue-soft\)/);
  assert.match(css,/var\(--v8-mint-soft\)/);
  assert.match(css,/@media\(max-width:600px\)/);
  assert.match(read('app/_analysis/harin-analysis-workbench.js'),/harin-analysis-v8\.css/);
  assert.doesNotMatch(read('app/layout.js'),/harin-analysis-v8\.css/);
});
