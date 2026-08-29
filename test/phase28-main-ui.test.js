'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');

test('Phase 28 Main is lazy loaded behind the home runtime flag',()=>{
  const client=read('app/dashboard-client.js');
  const main=read('app/_phase28/main-dashboard.js');
  const css=read('app/_phase28/phase28-main.css');
  assert.match(client,/dynamic\(\(\)=>import\('\.\/_phase28\/main-dashboard\.js'\),\{loading:LazyWorkbenchFallback\}\)/);
  assert.match(client,/phase28ActivePages\.has\('home'\)/);
  assert.match(client,/phase28HomeActive\?<Phase28MainDashboard/);
  assert.match(client,/:<Phase14MainCommandCenter/);
  assert.match(main,/page-title-accent/);
  assert.match(css,/@media\(prefers-reduced-motion:reduce\)/);
});

test('Phase 28 Main keeps the fixed readable scale and balanced selection language',()=>{
  const css=read('app/_phase28/phase28-main.css');
  assert.match(css,/clamp\(34px,3vw,50px\)/);
  assert.match(css,/min-height:44px/);
  assert.match(css,/440ms cubic-bezier\(\.22,1,\.36,1\)/);
  assert.match(css,/@media\(max-width:430px\)/);
  assert.doesNotMatch(css,/border-left\s*:/);
});

test('Phase 28 decision rail exposes its collapse state accessibly',()=>{
  const main=read('app/_phase28/main-dashboard.js');
  assert.match(main,/aria-expanded=\{railOpen\}/);
  assert.match(main,/aria-hidden=\{!railOpen\}/);
  assert.match(main,/phase28MainRail/);
  assert.match(main,/오늘의 운영선/);
});
