'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');

test('16-9 replaces quick-action text symbols with the shared pictogram system',()=>{
  const source=read('app/_analysis/harin-analysis-workbench.js');
  assert.match(source,/import \{ HarinIcon \}/);
  assert.match(source,/HarinQuickAction/);
  assert.match(read('app/_design-system/harin-ui.js'),/export function HarinQuickAction/);
  for(const icon of ['growth','search','store','settlement','keyword','shield','product','link','ai'])assert.match(source,new RegExp(`['"]${icon}['"]`));
  assert.doesNotMatch(source,/INSIGHT_ROUTES\.map\(\(\[id,label,description\],index\)/);
  assert.doesNotMatch(source,/<i>(?:▦|⌕|₩|↗|□|≠|AI)<\/i>/);
});

test('16-9 gives every quick-action pictogram a readable pastel tone and mobile snap card',()=>{
  const css=read('app/_design-system/harin-interactions-v8.css');
  const analysisCss=read('app/_analysis/harin-analysis-v8.css');
  for(const tone of ['blue','mint','amber','lavender'])assert.match(css,new RegExp(`\\.harinV8 \\.v8QuickAction-${tone}`));
  assert.match(css,/\.v8QuickAction>span/);
  assert.match(analysisCss,/\.analysisFocusRail>\.v8QuickAction\{flex:0 0 238px;min-height:88px;scroll-snap-align:start\}/);
});
