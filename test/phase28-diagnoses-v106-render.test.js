'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');

test('기존 진단 주소는 인사이트 누적 진단으로 이동한다',()=>{
  const route=read('app/diagnoses/page.js');
  assert.match(route,/redirect\('\/insights\/diagnostics'\)/);
});

test('인사이트 누적 진단은 플랫폼 분리·상세 지연 조회를 연결한다',()=>{
  const page=read('app/_phase28/pages/insights-page.js');
  for(const label of ['네이버','쿠팡','Cafe24','전체 채널'])assert.match(page,new RegExp(label));
  for(const label of ['누적 진단','상세보기','자동화 실행 상태'])assert.match(page,new RegExp(label));
  assert.match(page,/Phase28RightRailLayout/);
  assert.match(page,/\/api\/insights\/diagnostics/);
  assert.match(page,/\/api\/insights\/reports\/\$\{encodeURIComponent\(reportId\)\}/);
});

test('통합 인사이트 진단 CSS는 고정 읽기 크기·균형 선택·모바일·절제된 동작을 지킨다',()=>{
  const css=read('app/_phase28/pages/insights-page.css');
  assert.match(css,/max-width:\s*2300px/);
  assert.match(css,/min-height:\s*(?:44|46|48)px/);
  assert.match(css,/@media\s*\(max-width:\s*760px\)/);
  assert.match(css,/@media\s*\(prefers-reduced-motion:\s*reduce\)/);
  assert.match(css,/border:\s*1px solid transparent/);
  assert.doesNotMatch(css,/border-left\s*:/);
  assert.doesNotMatch(css,/linear-gradient|radial-gradient|backdrop-filter|filter:\s*blur/i);
  assert.doesNotMatch(css,/font-size:\s*(?:[0-9]|1[01])px/i);
});
