'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');

test('14-1 activates the isolated V8 design layer from the root layout',()=>{
  const layout=read('app/layout.js');
  assert.match(layout,/import '.\/_design-system\/harin-v8\.css'/);
  assert.match(layout,/data-harin-ui="v8"/);
  assert.match(layout,/className="harinV8"/);
});

test('14-1 defines readable pastel tokens and preserves the approved production scale',()=>{
  const css=read('app/_design-system/harin-v8.css');
  assert.match(css,/--v8-canvas:#f6f5fb/);
  assert.match(css,/--v8-lavender:#746bb2/);
  assert.match(css,/--v8-mint-soft:#e6f2ec/);
  assert.match(css,/--v8-pink-soft:#f5e5e9/);
  assert.match(css,/--v8-amber-soft:#f7efd9/);
  assert.match(css,/--v8-ink:#2c2d3e/);
  assert.match(css,/--v8-font-body:16px/);
  assert.match(css,/--v8-font-list:15px/);
  assert.match(css,/--v8-font-support:13px/);
  assert.match(css,/--v8-control-height:46px/);
  assert.doesNotMatch(css,/font-size:(?:[1-9]|1[0-1])px/);
});

test('14-1 provides reusable primitives, status tones, focus and reduced-motion protection',()=>{
  const css=read('app/_design-system/harin-v8.css');
  const ui=read('app/_design-system/harin-ui.js');
  assert.match(ui,/export function HarinPictogram/);
  assert.match(ui,/export function HarinCard/);
  assert.match(ui,/export function HarinButton/);
  assert.match(ui,/export function HarinBadge/);
  assert.match(ui,/export function HarinEmptyState/);
  assert.match(css,/\.v8Badge-success/);
  assert.match(css,/\.v8Badge-warning/);
  assert.match(css,/\.v8Badge-danger/);
  assert.match(css,/:focus-visible/);
  assert.match(css,/@media\(prefers-reduced-motion:reduce\)/);
});

test('14-1 replaces letter-only navigation marks with accessible inline pictograms',()=>{
  const icon=read('app/_design-system/harin-icon.js');
  const client=read('app/dashboard-client.js');
  assert.match(icon,/viewBox="0 0 24 24"/);
  assert.match(icon,/stroke="currentColor"/);
  assert.match(icon,/aria-hidden=\{title\?undefined:true\}/);
  assert.match(client,/import \{ HarinIcon \} from '.\/_design-system\/harin-ui\.js'/);
  assert.match(client,/<HarinIcon name=\{group\.id\}/);
  assert.match(client,/<HarinIcon name=\{item\.id\}/);
  assert.match(client,/<HarinIcon name="menu"\/>/);
});
