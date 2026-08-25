'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');

test('16-1 assigns stable work-category tones to desktop and mobile navigation',()=>{
  const shell=read('app/_shell/harin-app-shell.js');
  assert.match(shell,/const toneForGroup=groupId=>resolvePageTone\(groupId\)/);
  assert.match(shell,/const toneForView=view=>resolvePageTone\(view\)/);
  assert.match(shell,/data-tone=\{toneForGroup\(group\.id\)\}/);
  assert.match(shell,/data-tone=\{toneForView\(item\.id\)\}/);
  assert.match(shell,/data-tone=\{toneForView\(view\)\}/);
});

test('26-3 keeps the established navigation map with flat brand selection fills',()=>{
  const css=read('app/_shell/harin-shell-v8.css');
  for(const tone of ['today','orders','customer','inventory','settlement','analysis','development','system']){
    assert.match(css,new RegExp(`\\[data-tone="${tone}"\\]`));
  }
  assert.match(css,/\.sidebarItem\.active\{[^}]*background:var\(--nav-soft-strong\)/);
  assert.match(css,/\.mobileBottomNav>button\.active\{[^}]*var\(--nav-soft-strong\)/);
  assert.match(css,/\.focusedWorkspaceNav\[data-tone\]>a\.active\{[^}]*var\(--nav-soft-strong\)/);
  assert.doesNotMatch(css,/\.sidebarItem\.active\{[^}]*linear-gradient/);
  assert.doesNotMatch(css,/\.sidebarItem\.active[^}]*background:\s*#(?:1e4e3d|2c6952)/i);
});

test('16-1 keeps green semantics for real success state only',()=>{
  const design=read('app/_design-system/harin-v8.css');
  const shell=read('app/_shell/harin-shell-v8.css');
  assert.match(design,/\.status\.success[^}]*var\(--v8-mint-soft\)/);
  assert.match(shell,/\.harinV8 \.live\.check\{background:var\(--v8-amber-soft\)/);
  assert.doesNotMatch(shell,/--nav-(?:soft|soft-strong|line|ink):#(?:1e4e3d|2c6952|1e654c)/i);
});
