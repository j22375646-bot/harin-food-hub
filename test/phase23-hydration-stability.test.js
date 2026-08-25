'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');

test('shared page AI timestamp is deterministic across server and browser locales',()=>{
  const panel=read('app/harin-ai-page-panel.js');
  assert.match(panel,/new Intl\.DateTimeFormat\('en-CA'/);
  assert.match(panel,/timeZone:'Asia\/Seoul'/);
  assert.match(panel,/hourCycle:'h23'/);
  assert.doesNotMatch(panel,/new Intl\.DateTimeFormat\('ko-KR'/);
});

test('temporary production hydration probes are not shipped in the root layout',()=>{
  const layout=read('app/layout.js');
  assert.doesNotMatch(layout,/harin-hydration-probe|HARIN_TEXT_HISTORY|MutationObserver/);
  assert.doesNotMatch(layout,/next\/script/);
});

test('26-8 shared SVG charts keep tooltip text out of browser-rewritten title children',()=>{
  const ui=read('app/_design-system/harin-ui.js');
  assert.match(ui,/data-chart-tooltip=\{chartPointLabel/);
  assert.doesNotMatch(ui,/<(?:rect|circle)[^>]*><title>/);
});
