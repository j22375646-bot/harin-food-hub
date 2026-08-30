'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');

test('V106 변경 기록은 전용 경량 로더와 공통 셸로 canonical route를 소유한다',()=>{
  const route=read('app/approvals/page.js');
  const layout=read('app/approvals/layout.js');
  assert.match(route,/loadPhase28ChangesSnapshot/);
  assert.match(route,/buildPhase28ChangesModel/);
  assert.match(route,/Phase28ChangesPage/);
  assert.match(layout,/Phase28RouteShell/);
  assert.match(layout,/routeId="changes"/);
});

test('V106 변경 기록은 결정 순환·필터·확인·실행·재조회·복구를 연결한다',()=>{
  const page=read('app/_phase28/pages/changes-page.js');
  for(const label of ['진단 근거','변경 기록','7·14일 결과','다음 실험'])assert.match(page,new RegExp(label));
  for(const label of ['전체','확인 대기','검증 완료','복구'])assert.match(page,new RegExp(label));
  assert.match(page,/Phase28RightRailLayout/);
  assert.match(page,/\/api\/financial-changes\/\$\{encodeURIComponent\(item\.id\)\}/);
  assert.match(page,/CONFIRM_EXECUTE/);
  assert.match(page,/VERIFY/);
  assert.match(page,/ROLLBACK/);
  assert.match(page,/REJECT/);
  assert.match(page,/window\.confirm/);
  assert.match(page,/dataUnavailable\?'확인 필요'/);
  assert.match(page,/감사 기록/);
});

test('변경 CSS는 고정 읽기 크기·균형 선택·모바일·절제된 동작을 지킨다',()=>{
  const page=read('app/_phase28/pages/changes-page.js');
  const css=read('app/_phase28/pages/changes-page.css');
  for(const className of ['changeListHeader','changeRecordIdentity','changeRecordDelta','changeRecordAudit','changeRecordState'])assert.match(page,new RegExp(className));
  assert.match(css,/\.changeCard\{[^}]*grid-template-columns:\s*minmax\(220px,1\.2fr\)\s+minmax\(240px,1fr\)\s+minmax\(150px,\.7fr\)\s+minmax\(132px,\.55fr\)\s+24px/);
  assert.match(css,/\.changeCard\{[^}]*min-height:\s*96px/);
  assert.match(css,/max-width:\s*2300px/);
  assert.match(css,/min-height:\s*(?:44|46|48)px/);
  assert.match(css,/@media\s*\(max-width:\s*760px\)/);
  assert.match(css,/@media\s*\(prefers-reduced-motion:\s*reduce\)/);
  assert.match(css,/\.changeCard\{[^}]*border:\s*1px solid var\(--p28-line\)/);
  assert.doesNotMatch(css,/border-left\s*:/);
  assert.doesNotMatch(css,/linear-gradient|radial-gradient|backdrop-filter|filter:\s*blur/i);
  assert.doesNotMatch(css,/font-size:\s*(?:[0-9]|1[01])px/i);
});
