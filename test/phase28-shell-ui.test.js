'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');

test('V106 shell owns navigation without legacy shell imports',()=>{
  const shell=read('app/_phase28/phase28-shell.js');
  assert.match(shell,/next\/link/);
  assert.match(shell,/오늘 회사 활력/);
  assert.match(shell,/운영 확인 항목 기준/);
  assert.match(shell,/aria-label="허브 메뉴"/);
  assert.match(shell,/aria-label="모바일 주요 메뉴"/);
  assert.match(shell,/aria-current=\{active\?'page':undefined\}/);
  assert.doesNotMatch(shell,/HarinAppShell|HarinSidebar|HarinMobileNavigation/);
});

test('V106 shell retains command search and evidence access',()=>{
  const palette=read('app/_phase28/phase28-command-palette.js');
  const evidence=read('app/_phase28/phase28-evidence-drawer.js');
  assert.match(palette,/role="dialog"/);
  assert.match(palette,/aria-modal="true"/);
  assert.match(palette,/item\.description/);
  assert.match(evidence,/자료 근거/);
  assert.match(evidence,/generatedAt/);
  assert.match(evidence,/role="dialog"/);
});

test('V106 shell reuses the newest authoritative Main snapshot across routes',()=>{
  const shell=read('app/_phase28/phase28-shell.js');
  const app=read('app/_phase28/phase28-app.js');
  assert.match(shell,/operation-snapshot\.js/);
  assert.match(shell,/NAVIGATION_SNAPSHOT_KEY/);
  assert.match(shell,/parseNavigationOperationSnapshot\(window\.localStorage\.getItem\(NAVIGATION_SNAPSHOT_KEY\)\)/);
  assert.match(shell,/selectNavigationOperationSnapshot/);
  assert.match(app,/navigationSnapshot=\{navigationSnapshot\}/);
  assert.doesNotMatch(app,/navigationSnapshot\?\.badges\|\|\{\}/);
});

test('V106 shell carries per-route prefetch policy through every navigation surface',()=>{
  const shell=read('app/_phase28/phase28-shell.js');
  const palette=read('app/_phase28/phase28-command-palette.js');
  assert.ok((shell.match(/prefetch=\{item\.prefetch\}/g)||[]).length>=3);
  assert.match(palette,/prefetch=\{item\.prefetch\}/);
});

test('record workflow links do not warm sibling low-frequency pages',()=>{
  for(const file of ['diagnoses-page.js','changes-page.js','validation-page.js','experiments-page.js']){
    const source=read(`app/_phase28/pages/${file}`);
    assert.match(source,/prefetch=\{false\}/);
  }
});

test('V106 shell preserves readable responsive and balanced-selection rules',()=>{
  const css=[read('app/_phase28/phase28-shell.module.css'),read('app/_phase28/phase28-tokens.module.css')].join('\n');
  assert.match(css,/--p28-gutter:clamp\(34px,3vw,72px\)/);
  assert.match(css,/@media \(max-width:980px\)/);
  assert.match(css,/@media \(max-width:620px\)/);
  assert.match(css,/min-height:44px/);
  assert.doesNotMatch(css,/border-left\s*:/);
});

test('V106 desktop navigation keeps scrolling without exposing a draggable rail',()=>{
  const shell=read('app/_phase28/phase28-shell.js');
  const css=read('app/_phase28/phase28-shell.module.css');
  assert.match(shell,/className=\{styles\.sidebarScrollArea\}/);
  assert.match(shell,/data-can-scroll-down/);
  assert.match(css,/\.sidebarScrollArea\{[^}]*overflow-y:auto/);
  assert.match(css,/\.sidebarScrollArea\{[^}]*scrollbar-width:none/);
  assert.match(css,/\.sidebarScrollArea::-webkit-scrollbar\{display:none/);
  assert.match(css,/\.sidebar\{[^}]*overflow:hidden/);
});
