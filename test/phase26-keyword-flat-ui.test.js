'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');

test('26-4 scopes the flat brand treatment to keyword pages only',()=>{
  const dashboard=read('app/dashboard-client.js');
  assert.match(dashboard,/data-view=\{view\}/);
  assert.match(dashboard,/harin-keyword-flat-v8\.css/);
});

test('26-4 keyword canvas removes gradients and blur without merging marketplace behavior',()=>{
  const css=read('app/_analysis/harin-keyword-flat-v8.css');
  const shell=read('app/_analysis/keyword-owner-shell.module.css');
  assert.match(css,/\.hubMain\[data-view="keyword"\] \*/);
  assert.match(css,/background-image:none!important/);
  assert.match(css,/backdrop-filter:none!important/);
  assert.match(css,/--harin-color-action/);
  assert.doesNotMatch(css,/(?:linear|radial)-gradient\(/);
  assert.doesNotMatch(shell,/(?:linear|radial)-gradient\(/);
  assert.match(shell,/\.naverCard/);
  assert.match(shell,/\.coupangCard/);
});

test('26-4 quick command trigger follows the same flat system',()=>{
  const css=read('app/_workspace/harin-owner-workspace.css');
  const trigger=css.match(/\.ownerWorkspaceTrigger\{[^}]+\}/)?.[0]||'';
  assert.doesNotMatch(trigger,/(?:linear|radial)-gradient\(/);
  assert.match(trigger,/background:var\(--harin-color-action-soft\)/);
});
