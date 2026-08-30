'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');

test('V106 A/B 테스트는 전용 경량 로더와 공통 셸로 canonical route를 소유한다',()=>{
  const route=read('app/ab-tests/page.js');
  const layout=read('app/ab-tests/layout.js');
  assert.match(route,/loadPhase28ExperimentsSnapshot/);
  assert.match(route,/buildPhase28ExperimentsModel/);
  assert.match(route,/Phase28ExperimentsPage/);
  assert.match(layout,/Phase28RouteShell/);
  assert.match(layout,/routeId="experiments"/);
});

test('V106 A/B 테스트는 결정 순환·상품 격리·변형 비교·표본 판정·실제 작업을 구현한다',()=>{
  const page=read('app/_phase28/pages/experiments-page.js');
  for(const label of ['진단 근거','변경 기록','7·14일 결과','다음 실험'])assert.match(page,new RegExp(label));
  for(const label of ['판매상품','A · 대조군','B · 실험군','최소 표본','필요 신뢰도','새 A/B 테스트','실적 입력','지금 평가'])assert.match(page,new RegExp(label));
  assert.match(page,/Phase28PageHeading/);
  assert.match(page,/Phase28RightRailLayout/);
  assert.match(page,/data-phase28-root="true"/);
  assert.match(page,/\/api\/experiments/);
  assert.match(page,/\/execution-validation/);
});

test('A/B 테스트 CSS는 고정 읽기 크기·균형 선택·모바일·절제된 동작을 지킨다',()=>{
  const css=read('app/_phase28/pages/experiments-page.css');
  assert.match(css,/max-width:\s*2300px/);
  assert.match(css,/min-height:\s*(?:44|46|48)px/);
  assert.match(css,/@media\s*\(max-width:\s*760px\)/);
  assert.match(css,/@media\s*\(prefers-reduced-motion:\s*reduce\)/);
  assert.doesNotMatch(css,/border-left\s*:/);
  assert.doesNotMatch(css,/linear-gradient|radial-gradient|backdrop-filter|filter:\s*blur/i);
  assert.doesNotMatch(css,/font-size:\s*(?:[0-9]|1[01])px/i);
});
