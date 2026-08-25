'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');

test('27-3 main shows evidence-aware monthly revenue pacing',()=>{
  const source=read('app/_main/harin-main-command-center.js');

  assert.match(source,/HarinMetricChart/);
  assert.match(source,/data-core-visualization="main-pacing"/);
  assert.match(source,/labels=\{\['현재 매출','월말 예상','이번 달 목표'\]\}/);
  assert.match(source,/metrics\.current==null\?null:metrics\.current/);
  assert.match(source,/metrics\.forecast==null\?null:metrics\.forecast/);
  assert.match(source,/metrics\.target==null\?null:metrics\.target/);
});

test('27-3 orders shows workspace workload without merging marketplace data',()=>{
  const source=read('app/unified-orders-center.js');

  assert.match(source,/HarinMetricChart/);
  assert.match(source,/data-core-visualization="orders-flow"/);
  assert.match(source,/labels=\{\['송장 발급 전','배송대기','배송중','재시도'\]\}/);
  assert.match(source,/workspaceCounts\.ACTIVE/);
  assert.match(source,/workspaceCounts\.REGISTER/);
  assert.match(source,/workspaceCounts\.IN_TRANSIT/);
  assert.match(source,/workspaceCounts\.RETRY/);
  assert.doesNotMatch(source,/NAVER.*COUPANG.*reduce/);
});

test('27-3 customer service shows the confirmed recent seven day intake pulse',()=>{
  const source=read('app/unified-customer-service-center.js');

  assert.match(source,/HarinMetricChart/);
  assert.match(source,/data-core-visualization="cs-trend"/);
  assert.match(source,/labels=\{recentCsTrend\.map\(item=>item\.label\)\}/);
  assert.match(source,/values:recentCsTrend\.map\(item=>item\.value\)/);
});

test('27-3 inventory stock and sales visual uses the page semantic palette',()=>{
  const source=read('app/unified-inventory-operations-center.js');
  const css=read('app/_operations/harin-operations-v8.css');
  const mainCss=read('app/_main/harin-main-v8.css');

  assert.match(source,/data-core-visualization="inventory-stock-sales"/);
  assert.match(source,/label:'판매가능 재고',tone:'primary'/);
  assert.match(source,/label:'최근 30일 판매',tone:'secondary'/);
  assert.match(css,/\.orderCoreVisual/);
  assert.match(css,/\.csCoreVisual/);
  assert.match(css,/@media\(max-width:600px\).*\.orderCoreVisual/s);
  assert.match(mainCss,/\.mainPacingVisual/);
});
