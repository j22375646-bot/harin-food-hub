'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');

test('V106 진단은 전용 경량 로더와 공통 셸로 canonical route를 소유한다',()=>{
  const route=read('app/diagnoses/page.js');
  const layout=read('app/diagnoses/layout.js');
  assert.match(route,/loadPhase28DiagnosisSnapshot/);
  assert.match(route,/buildPhase28DiagnosesModel/);
  assert.match(route,/Phase28DiagnosesPage/);
  assert.match(layout,/Phase28Shell/);
  assert.match(layout,/routeId="diagnoses"/);
});

test('V106 진단은 결정 순환·필터·보고서 보존 기능을 연결한다',()=>{
  const page=read('app/_phase28/pages/diagnoses-page.js');
  for(const label of ['진단 근거','변경 기록','7·14일 결과','다음 실험'])assert.match(page,new RegExp(label));
  for(const label of ['전체','분석 가능','판단 보류'])assert.match(page,new RegExp(label));
  assert.match(page,/Phase28RightRailLayout/);
  assert.match(page,/\/api\/reports\/generate/);
  assert.match(page,/\/api\/reports\/daily/);
  assert.match(page,/\/api\/reports\/\$\{encodeURIComponent\(report\.id\)\}\/action/);
  assert.match(page,/\/api\/notifications\/send/);
  assert.match(page,/\/print/);
  assert.match(page,/\/download/);
  assert.match(page,/window\.confirm/);
  assert.match(page,/dataUnavailable\?'확인 필요'/);
});

test('진단 CSS는 고정 읽기 크기·균형 선택·모바일·절제된 동작을 지킨다',()=>{
  const css=read('app/_phase28/pages/diagnoses-page.css');
  assert.match(css,/max-width:\s*2300px/);
  assert.match(css,/min-height:\s*(?:44|46|48)px/);
  assert.match(css,/@media\s*\(max-width:\s*760px\)/);
  assert.match(css,/@media\s*\(prefers-reduced-motion:\s*reduce\)/);
  assert.match(css,/border:\s*1px solid transparent/);
  assert.doesNotMatch(css,/border-left\s*:/);
  assert.doesNotMatch(css,/linear-gradient|radial-gradient|backdrop-filter|filter:\s*blur/i);
  assert.doesNotMatch(css,/font-size:\s*(?:[0-9]|1[01])px/i);
});
