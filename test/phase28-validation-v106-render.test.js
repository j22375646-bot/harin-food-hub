'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');

test('V106 실행검증은 전용 경량 로더와 공통 셸로 canonical route를 소유한다',()=>{
  const route=read('app/execution-validation/page.js');
  const layout=read('app/execution-validation/layout.js');
  assert.match(route,/loadPhase28ValidationSnapshot/);
  assert.match(route,/buildPhase28ValidationModel/);
  assert.match(route,/Phase28ValidationPage/);
  assert.match(layout,/Phase28Shell/);
  assert.match(layout,/routeId="validation"/);
});

test('V106 실행검증은 결정 순환·4단계 타임라인·고객 재구매·실험 연결을 구현한다',()=>{
  const page=read('app/_phase28/pages/validation-page.js');
  for(const label of ['진단 근거','변경 기록','7·14일 결과','다음 실험'])assert.match(page,new RegExp(label));
  for(const label of ['실행 전 예상','DAY 0','DAY 7','DAY 14','실행 결과','고객·재구매'])assert.match(page,new RegExp(label));
  assert.match(page,/Phase28RightRailLayout/);
  assert.match(page,/aria-pressed/);
  assert.match(page,/\/ab-tests/);
  assert.match(page,/고객 식별자 없음/);
  assert.match(page,/판단 보류/);
});

test('실행검증 CSS는 고정 읽기 크기·균형 선택·모바일·절제된 동작을 지킨다',()=>{
  const css=read('app/_phase28/pages/validation-page.css');
  assert.match(css,/max-width:\s*2300px/);
  assert.match(css,/min-height:\s*(?:44|46|48)px/);
  assert.match(css,/@media\s*\(max-width:\s*760px\)/);
  assert.match(css,/@media\s*\(prefers-reduced-motion:\s*reduce\)/);
  assert.match(css,/\.validationAction\{[^}]*border:\s*1px solid var\(--p28-line\)/);
  assert.doesNotMatch(css,/border-left\s*:/);
  assert.doesNotMatch(css,/linear-gradient|radial-gradient|backdrop-filter|filter:\s*blur/i);
  assert.doesNotMatch(css,/font-size:\s*(?:[0-9]|1[01])px/i);
});
