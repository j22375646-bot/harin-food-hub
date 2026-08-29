'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');

test('Phase 28 Main belongs to the exclusive V106 application root',()=>{
  const entry=read('app/dashboard-client.js');
  const legacy=read('app/legacy-dashboard-client.js');
  const app=read('app/_phase28/phase28-app.js');
  const main=read('app/_phase28/main-dashboard.js');
  const css=read('app/_phase28/phase28-main.css');
  assert.match(entry,/dynamic\(\(\)=>import\('\.\/_phase28\/phase28-app\.js'\)/);
  assert.doesNotMatch(entry,/main-dashboard|Phase14MainCommandCenter|UnifiedOrdersCenter/);
  assert.doesNotMatch(app,/legacy-dashboard|Phase14MainCommandCenter|UnifiedOrdersCenter/);
  assert.match(legacy,/dynamic\(\(\)=>import\('\.\/_phase28\/main-dashboard\.js'\),\{loading:LazyWorkbenchFallback\}\)/);
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
