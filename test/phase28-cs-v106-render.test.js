'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.join(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');

test('Phase 28 app renders the V106 customer service page for the cs route',()=>{
  const app=read('app/_phase28/phase28-app.js');
  const page=read('app/_phase28/pages/cs-page.js');
  assert.match(app,/const Phase28CsPage=dynamic\(\(\)=>import\('\.\/pages\/cs-page\.js'\)/);
  assert.match(app,/routeId==='cs'[^\n]*<Phase28CsPage model=\{initialData\.phase28\?\.cs\|\|\{\}\}/);
  assert.match(page,/data-phase28-page="cs"/);
  assert.match(page,/오늘 답할 문의는/);
  assert.match(page,/고객 대화함/);
  assert.match(page,/30분 응대 레인/);
  assert.match(page,/문의 내용/);
  assert.match(page,/답변 작성/);
  assert.match(page,/주문 정보/);
});

test('V106 customer service page keeps real collection and owner-confirmed write seams',()=>{
  const page=read('app/_phase28/pages/cs-page.js');
  assert.match(page,/fetch\('\/api\/customer-service\/sync'/);
  assert.match(page,/fetch\('\/api\/coupang\/cs\/action'/);
  assert.match(page,/fetch\('\/api\/coupang\/cases\/action'/);
  assert.match(page,/window\.confirm/);
  assert.match(page,/직접 전송은 잠겨 있어요/);
  assert.match(page,/router\.refresh\(\)/);
});

test('V106 customer service rail uses the shared snapshot time and keeps missing waits explicit',()=>{
  const page=read('app/_phase28/pages/cs-page.js');
  assert.match(page,/function CsRail\(\{row,asOf,/);
  assert.match(page,/const minutes=row\?waitMinutes\(row,asOf\):null/);
  assert.match(page,/minutes==null\?'대기시간 확인 필요':`\$\{waitLabel\(minutes\)\} 전`/);
  assert.match(page,/<CsRail row=\{selectedRow\} asOf=\{hero\.asOf\}/);
});

test('V106 customer service CSS preserves the fixed readable layout and balanced states',()=>{
  const css=read('app/_phase28/pages/cs-page.css');
  assert.match(css,/max-width:2300px/);
  assert.match(css,/font-size:clamp\(34px,3vw,50px\)/);
  assert.match(css,/min-height:44px/);
  assert.match(css,/440ms cubic-bezier\(\.22,1,\.36,1\)/);
  assert.match(css,/@media \(max-width:760px\)/);
  assert.match(css,/@media \(prefers-reduced-motion:reduce\)/);
  assert.match(css,/\.p28CsPage \.csThread\.selected\{[^}]*box-shadow:inset 0 0 0 1px/);
  assert.match(css,/\.railPanels\{display:grid;grid-template-columns:minmax\(0,1fr\);grid-template-rows:minmax\(0,1fr\)/);
  assert.doesNotMatch(css,/border-left\s*:/);
  assert.doesNotMatch(css,/linear-gradient|radial-gradient|backdrop-filter/);
  assert.doesNotMatch(css,/font-size:(?:[0-9]|1[01])px/);
});
