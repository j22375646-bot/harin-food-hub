'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');

test('V106 상품개발은 기존 전용 라우트에서 공통 셸과 프로젝트 런웨이를 사용한다',()=>{
  const page=read('app/market-intelligence/page.js');
  const layout=read('app/market-intelligence/layout.js');
  const view=read('app/_phase28/pages/development-page.js');

  assert.match(page,/buildPhase28DevelopmentModel/);
  assert.match(page,/Phase28DevelopmentPage/);
  assert.match(page,/phase28RuntimeConfig\(process\.env/);
  assert.match(layout,/Phase28RouteShell/);
  assert.match(layout,/routeId="development"/);
  assert.match(view,/data-phase28-page="development"/);
  assert.match(view,/상품 선택/);
  assert.match(view,/프로젝트 확인/);
  assert.match(view,/개발공간 열기/);
  assert.match(view,/window\.confirm/);
  assert.match(view,/\/api\/market-intelligence\/projects/);
  assert.match(view,/Phase28RightRailLayout/);
  assert.match(view,/Phase28ChannelLogo/);
});

test('V106 상품개발은 다섯 단계와 기존 기능 경로를 보존하고 상세를 지연 요청한다',()=>{
  const view=read('app/_phase28/pages/development-page.js');
  for(const label of ['자료 준비','시장 분석','경쟁·전환 설계','A/B 실험','결과 학습'])assert.match(view,new RegExp(label));
  for(const label of ['OCR','시장 분석','구매 장벽','승인·실행 검증','7일·14일'])assert.match(view,new RegExp(label));
  for(const route of ['/data','/market','/competition','/conversion','/ab-tests','/execution-validation'])assert.match(view,new RegExp(route.replaceAll('/','\\/')));
  assert.match(view,/detailCache/);
  assert.match(view,/fetchProjectDetail/);
  assert.doesNotMatch(view,/작수차|작두콩차/);
});

test('V106 상품개발 스타일은 고정 UI와 균형 선택 규칙을 지킨다',()=>{
  const view=read('app/_phase28/pages/development-page.js');
  const css=read('app/_phase28/pages/development-page.css');
  assert.match(view,/return <section className="p28Development"/);
  assert.doesNotMatch(view,/return <main className="p28Development"/);
  for(const token of ['--ops-line-strong:var(--p28-line-strong)','--ops-blue-soft:var(--p28-blue-soft)','--ops-mint-soft:var(--p28-mint-soft)','--ops-apricot-soft:var(--p28-apricot-soft)'])assert.ok(css.includes(token));
  assert.match(css,/\.pdIntro>header\{[^}]*min-width:0;[^}]*flex:1/);
  assert.doesNotMatch(css,/\.pdIntro>header\{[^}]*padding:/);
  assert.match(css,/\.pdIntroStatus\{[^}]*width:360px;[^}]*height:112px/);
  assert.match(css,/\.pdDecisionDesk\{[^}]*padding:20px/);
  assert.match(css,/\.pdLedger>div>button\[data-selected="true"\]\{[^}]*background:var\(--ops-soft\)/);
  assert.match(css,/@media\s*\(max-width:\s*1160px\)\{\.pdIntroStatus\{[^}]*flex-basis:auto/);
  assert.doesNotMatch(css,/gradient\(|backdrop-filter|filter:\s*blur/i);
  assert.doesNotMatch(css,/border-left|inset\s+\d/i);
  assert.doesNotMatch(css,/font-size:\s*(?:[0-9]|1[01])px/i);
  assert.match(css,/@media\s*\(max-width:\s*760px\)/);
  assert.match(css,/prefers-reduced-motion:\s*reduce/);
  assert.match(css,/min-height:\s*(?:44|46|48)px/);
});
