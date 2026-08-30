'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');

test('V106 AI 기준자료는 전용 경량 로더와 공통 셸로 canonical route를 소유한다',()=>{
  const route=read('app/ai-knowledge/page.js');
  const layout=read('app/ai-knowledge/layout.js');
  assert.match(route,/loadPhase28KnowledgeSnapshot/);
  assert.match(route,/buildPhase28KnowledgeModel/);
  assert.match(route,/Phase28KnowledgePage/);
  assert.match(layout,/Phase28RouteShell/);
  assert.match(layout,/routeId="knowledge"/);
});

test('V106 AI 기준자료는 네 신뢰 게이트와 실제 등록·검수·승인·원본 작업을 구현한다',()=>{
  const page=read('app/_phase28/pages/knowledge-page.js');
  for(const label of ['01 · 원본','02 · 개인정보','03 · 적용 범위','04 · 검색 준비'])assert.match(page,new RegExp(label));
  for(const label of ['기준자료 등록','원본 비공개 보관','개인정보 제외 검수','적용 대상으로 승인','보관','다시 사용 준비'])assert.match(page,new RegExp(label));
  assert.match(page,/Phase28PageHeading/);
  assert.match(page,/Phase28RightRailLayout/);
  assert.match(page,/data-phase28-root="true"/);
  assert.match(page,/\/api\/ai\/knowledge/);
  assert.match(page,/crypto\.subtle\.digest/);
  assert.match(page,/OpenAI 전송 없음/);
});

test('AI 기준자료 CSS는 고정 읽기 크기·균형 선택·모바일·절제된 동작을 지킨다',()=>{
  const css=read('app/_phase28/pages/knowledge-page.css');
  assert.match(css,/max-width:\s*2300px/);
  assert.match(css,/min-height:\s*(?:44|46|48)px/);
  assert.match(css,/@media\s*\(max-width:\s*760px\)/);
  assert.match(css,/@media\s*\(prefers-reduced-motion:\s*reduce\)/);
  assert.doesNotMatch(css,/border-left\s*:/);
  assert.doesNotMatch(css,/linear-gradient|radial-gradient|backdrop-filter|filter:\s*blur/i);
  assert.doesNotMatch(css,/font-size:\s*(?:[0-9]|1[01])px/i);
});
