'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');

test('27-5 keyword workbench shows the scoped advertising performance flow',()=>{
  const table=read('app/_analysis/keyword-operations-table.js');
  const visual=read('app/_analysis/keyword-performance-flow.js');

  assert.match(table,/KeywordPerformanceFlow/);
  assert.match(table,/rows=\{tableSourceRows\}/);
  assert.match(visual,/data-core-visualization="keyword-performance-flow"/);
  assert.match(visual,/data-platform=\{platform\}/);
  for(const label of ['광고비','클릭','주문','매출'])assert.match(visual,new RegExp(label));
  assert.match(visual,/판단 보류/);
});

test('27-5 keeps Naver direct writes and Coupang WING actions visibly separate',()=>{
  const visual=read('app/_analysis/keyword-performance-flow.js');

  assert.match(visual,/네이버 API 직접 변경/);
  assert.match(visual,/쿠팡 WING 수동 적용/);
  assert.match(visual,/platform==='coupang'/);
  assert.doesNotMatch(visual,/NAVER.*COUPANG.*reduce/s);
});

test('27-5 keyword visual stays flat, responsive, and accessible',()=>{
  const visual=read('app/_analysis/keyword-performance-flow.js');
  const css=read('app/_analysis/keyword-performance-flow.module.css');

  assert.match(visual,/aria-label="선택 범위 키워드 성과 흐름"/);
  assert.match(visual,/role="img"/);
  assert.match(css,/@media\(max-width:700px\)/);
  assert.match(css,/@media\(prefers-reduced-motion:reduce\)/);
  assert.doesNotMatch(css,/(?:linear|radial)-gradient\(/);
  assert.doesNotMatch(css,/backdrop-filter/);
});
