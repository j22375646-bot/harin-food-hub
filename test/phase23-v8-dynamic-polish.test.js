const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.join(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');

test('23-7 interaction layer is isolated and loaded after readability rules',()=>{
  const layout=read('app/layout.js');
  const readability=layout.indexOf("./_design-system/harin-readability-v8.css");
  const interactions=layout.indexOf("./_design-system/harin-interactions-v8.css");
  assert.ok(readability>=0);
  assert.ok(interactions>readability);
  assert.match(read('app/_design-system/harin-interactions-v8.css'),/Phase 23-7/);
});

test('shared button exposes visible busy feedback and blocks duplicate clicks',()=>{
  const ui=read('app/_design-system/harin-ui.js');
  assert.match(ui,/busyLabel='처리 중…'/);
  assert.match(ui,/aria-busy/);
  assert.match(ui,/v8ButtonSpinner/);
  assert.match(ui,/disabled\|\|busy/);
});

test('quick actions use semantic pictograms and a current-page state',()=>{
  const ui=read('app/_design-system/harin-ui.js');
  const analysis=read('app/_analysis/harin-analysis-workbench.js');
  assert.match(ui,/export function HarinQuickAction/);
  assert.match(ui,/HarinPictogram icon=\{icon\}/);
  assert.match(ui,/aria-current=\{active\?'page':undefined\}/);
  assert.match(ui,/const elementProps=href\?\{href\}:\{\}/);
  assert.match(analysis,/HarinQuickAction as=\{Link\}/);
  assert.doesNotMatch(analysis,/function QuickActionIcon/);
});

test('feedback, readable text, mobile touch and reduced-motion safeguards share one layer',()=>{
  const css=read('app/_design-system/harin-interactions-v8.css');
  assert.match(css,/\.v8InlineStatus-success/);
  assert.match(css,/\.v8InlineStatus-danger/);
  assert.match(css,/var\(--v8-readable-support,14px\)/);
  assert.match(css,/@media\(max-width:700px\)/);
  assert.match(css,/@media\(prefers-reduced-motion:reduce\)/);
  assert.match(css,/animation:none!important/);
});
