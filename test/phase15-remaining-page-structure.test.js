const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');

test('15-7 provides one reusable collapsed detail drawer with mobile rules',()=>{
  const ui=read('app/_design-system/harin-ui.js');
  const css=read('app/_design-system/harin-page-frame.css');
  assert.match(ui,/export function HarinProgressiveDetails/);
  assert.match(ui,/className="v8ProgressiveDetailsBody"/);
  assert.match(css,/\.v8ProgressiveDetails>summary/);
  assert.match(css,/@media\(max-width:700px\)[^{]*\{[^}]*\.harinV8 \.v8PageFrame/);
  assert.match(css,/\.v8ProgressiveDetailsAction/);
});

test('15-7 keeps current execution decisions visible and folds full tools and records',()=>{
  const source=read('app/_execution/harin-execution-workbench.js');
  const deskIndex=source.indexOf("view==='reports'?<DiagnosisDesk");
  const detailIndex=source.indexOf('<HarinProgressiveDetails id="execution-full-workbench"');
  const aiIndex=source.lastIndexOf('<HarinPageAiRegion');
  assert.ok(deskIndex>=0&&detailIndex>deskIndex&&aiIndex>detailIndex);
  for(const label of ['진단 목록·보고서 전체 보기','변경·복구 기록 전체 보기','실행 결과·기록 전체 보기','A/B 테스트 등록·전체 기록'])assert.match(source,new RegExp(label));
});

test('15-7 separates current notifications from delivery settings and completed history',()=>{
  const source=read('app/_reliability/harin-notification-center.js');
  const currentIndex=source.indexOf('className="notificationCurrentWork"');
  const settingsIndex=source.indexOf('className="notificationSettingsDisclosure"');
  const historyIndex=source.indexOf('className="notificationHistoryDisclosure"');
  assert.ok(currentIndex>=0&&settingsIndex>currentIndex&&historyIndex>settingsIndex);
  assert.match(source,/title="자동 전달·수신 이메일 설정"/);
  assert.match(source,/title="이메일 발송 이력"/);
});

test('15-7 keeps detailed channel and source views collapsed while 16-4 removes the duplicate inventory drawer',()=>{
  const dashboard=read('app/legacy-dashboard-client.js');
  assert.match(read('app/_products/harin-product-workbench.js'),/className="productSourceCatalogDisclosure"/);
  assert.match(read('app/unified-orders-center.js'),/<details className="legacyCoupangOrders">/);
  assert.doesNotMatch(read('app/unified-inventory-operations-center.js'),/inventoryOpsCoupangDetail/);
  assert.match(dashboard,/UnifiedInventoryOperationsCenter coupang=\{initialData\.coupang\}/);
  assert.match(read('app/unified-settlement-operations-center.js'),/<details className="settlementOpsCoupangDetail">/);
  assert.match(read('app/unified-collection-operations-center.js'),/<details className="collectionOpsDetail">/);
});

test('15-7 preserves separate AI slots for each remaining workbench',()=>{
  const dashboard=read('app/legacy-dashboard-client.js');
  for(const page of ['orders','cs','inventory','settlement','reports','changes','validation','experiments','notifications','collection']){
    assert.match(dashboard,new RegExp(`aiPagePanels\\?\\.${page}`));
  }
  assert.doesNotMatch(dashboard,/aiPagePanels\?\.(?:orders|cs)\s*\|\|\s*aiPagePanels\?\./);
});
