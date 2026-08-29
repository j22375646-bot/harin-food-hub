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

test('V106 shell preserves readable responsive and balanced-selection rules',()=>{
  const css=[read('app/_phase28/phase28-shell.module.css'),read('app/_phase28/phase28-tokens.module.css')].join('\n');
  assert.match(css,/--p28-gutter:clamp\(34px,3vw,72px\)/);
  assert.match(css,/@media \(max-width:980px\)/);
  assert.match(css,/@media \(max-width:620px\)/);
  assert.match(css,/min-height:44px/);
  assert.doesNotMatch(css,/border-left\s*:/);
});
