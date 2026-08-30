'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');

test('저장된 다크 테마를 React 화면보다 먼저 html에 적용한다',()=>{
  const layout=read('app/layout.js');
  assert.match(layout,/harin-hub-theme/);
  assert.match(layout,/document\.documentElement\.dataset\.harinTheme/);
  assert.match(layout,/<head>/);
  assert.match(layout,/dangerouslySetInnerHTML/);
  assert.match(layout,/suppressHydrationWarning/);
});

test('Phase 28 셸은 초기화와 전환 때 html 테마를 함께 동기화한다',()=>{
  const shell=read('app/_phase28/phase28-shell.js');
  assert.match(shell,/useLayoutEffect/);
  assert.match(shell,/dataset\.harinTheme/);
  assert.match(shell,/harin-hub-theme/);
  const css=read('app/_phase28/phase28-tokens.module.css');
  assert.match(css,/:global\(html\[data-harin-theme="dark"\]\)\s+\.root/);
});
