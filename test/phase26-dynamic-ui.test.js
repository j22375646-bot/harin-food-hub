const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.join(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');

test('26-7 uses one semantic motion and keyboard-focus contract',()=>{
  const tokens=read('app/_design-system/harin-brand-tokens.css');
  const interactions=read('app/_design-system/harin-interactions-v8.css');
  assert.match(tokens,/--harin-motion-press:/);
  assert.match(tokens,/--harin-motion-disclosure:/);
  assert.match(tokens,/--harin-focus-ring:/);
  assert.match(interactions,/:where\(button,a,summary,\[role="button"\]\):focus-visible/);
  assert.match(interactions,/:where\(\.v8Button,\.v8QuickAction,details>summary\):focus-visible/);
  assert.match(interactions,/box-shadow:var\(--harin-focus-ring\)/);
  assert.match(interactions,/details>summary:focus-visible\{[^}]*outline-offset:-4px/);
});

test('26-7 shared controls acknowledge press without delaying the real action',()=>{
  const interactions=read('app/_design-system/harin-interactions-v8.css');
  assert.match(interactions,/:where\(\.v8Button,\.v8QuickAction\):active/);
  assert.match(interactions,/translateY\(1px\)/);
  assert.doesNotMatch(interactions,/transition:all/);
});

test('26-7 progressive details expose honest open state and changing action copy',()=>{
  const ui=read('app/_design-system/harin-ui.js');
  assert.match(ui,/closeAction='접기'/);
  assert.match(ui,/data-state=\{open\?'open':'closed'\}/);
  assert.match(ui,/\{open\?closeAction:action\}/);
  assert.match(ui,/aria-atomic="true"/);
});

test('26-7 disclosure content enters once and reduced-motion users get no animation',()=>{
  const page=read('app/_design-system/harin-page-frame.css');
  const interactions=read('app/_design-system/harin-interactions-v8.css');
  assert.match(page,/\.v8ProgressiveDetails\[open\] \.v8ProgressiveDetailsBody\{animation:v8DisclosureEnter/);
  assert.match(interactions,/@keyframes v8DisclosureEnter/);
  assert.match(interactions,/@media\(prefers-reduced-motion:reduce\)/);
  assert.match(interactions,/\.v8ProgressiveDetailsBody/);
});

test('26-7 keeps motion inside the existing flat brand palette',()=>{
  const interactions=read('app/_design-system/harin-interactions-v8.css');
  assert.doesNotMatch(interactions,/radial-gradient|backdrop-filter|background-clip\s*:\s*text/i);
  assert.doesNotMatch(interactions,/#[0-9a-f]{3,8}/i);
});
