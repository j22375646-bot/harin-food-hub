'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');

test('V106 Main uses the shared heading, channel marks, and right rail',()=>{
  const page=read('app/_phase28/pages/home-page.js');
  assert.match(page,/Phase28PageHeading/);
  assert.match(page,/Phase28ChannelLogo/);
  assert.match(page,/Phase28RightRailLayout/);
  assert.match(page,/이번 달, 목표까지 얼마나 남았을까요\?/);
  assert.match(page,/오늘의 운영선/);
  assert.match(page,/오늘 사장님이 결정할 일/);
  assert.doesNotMatch(page,/Phase14MainCommandCenter|HarinAppShell/);
});

test('V106 Main CSS keeps the approved executive board and readable reflow',()=>{
  const css=read('app/_phase28/pages/home-page.module.css');
  assert.match(css,/\.executiveBoard/);
  assert.match(css,/min-height:44px/);
  assert.match(css,/font-size:17px/);
  assert.match(css,/@media \(max-width:430px\)/);
  assert.doesNotMatch(css,/border-left\s*:/);
  assert.doesNotMatch(css,/font-size:(?:[0-9]|1[01])px/);
});

test('Main interactions resolve only through the stable route registry',()=>{
  const app=read('app/_phase28/phase28-app.js');
  assert.match(app,/useRouter/);
  assert.match(app,/phase28RouteForLegacyState/);
  assert.match(app,/phase28Route\(/);
  assert.match(app,/pushPhase28Route\(router,route\.href\)/);
  assert.match(app,/routeId==='home'/);
  assert.match(app,/Phase28HomePage/);
  assert.doesNotMatch(app,/main-dashboard|legacy-dashboard|Phase14MainCommandCenter/);
});
