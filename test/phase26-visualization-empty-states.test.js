'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');

let visualization;
try { visualization=require('../lib/ui/visualization.js'); }
catch { visualization=null; }

test('26-6 chart models preserve missing evidence instead of converting it to zero',()=>{
  assert.equal(typeof visualization?.buildChartModel,'function');
  const model=visualization.buildChartModel({
    labels:['월','화','수'],
    series:[{label:'매출',values:[12000,null,0]}],
  });

  assert.equal(model.status,'READY');
  assert.equal(model.series[0].values[0],12000);
  assert.equal(model.series[0].values[1],null);
  assert.equal(model.series[0].values[2],0);
  assert.equal(model.hasMissingEvidence,true);

  const uncollected=visualization.buildChartModel({
    labels:['월','화'],
    series:[{label:'광고비',values:[null,undefined]}],
  });
  assert.equal(uncollected.status,'UNCOLLECTED');
  assert.equal(uncollected.max,null);
});

test('26-6 waterfall models keep unknown money separate from a confirmed zero',()=>{
  assert.equal(typeof visualization?.buildWaterfallModel,'function');
  const model=visualization.buildWaterfallModel([
    {label:'결제·매출',value:100000,tone:'plus'},
    {label:'취소·환불',value:0,tone:'minus'},
    {label:'수수료',value:null,tone:'minus'},
  ]);

  assert.equal(model.status,'READY');
  assert.equal(model.items[1].value,0);
  assert.equal(model.items[2].value,null);
  assert.equal(model.items[2].displayStatus,'CHECK_REQUIRED');
  assert.equal(model.hasMissingEvidence,true);
});

test('26-6 common UI distinguishes normal empty, uncollected, and error states',()=>{
  const ui=read('app/_design-system/harin-ui.js');
  const css=read('app/_design-system/harin-v8.css');

  assert.match(ui,/data-empty-state=\{resolvedState\}/);
  assert.match(ui,/v8EmptyState-\$\{resolvedState\}/);
  assert.match(ui,/export function HarinMetricChart/);
  assert.match(ui,/export function HarinWaterfallChart/);
  assert.match(css,/\.v8EmptyState-empty/);
  assert.match(css,/\.v8EmptyState-uncollected/);
  assert.match(css,/\.v8EmptyState-error/);
  assert.match(css,/@media\(prefers-reduced-motion:reduce\)/);
});

test('26-6 operations pages use evidence-aware shared visuals',()=>{
  const cs=read('app/unified-customer-service-center.js');
  const inventory=read('app/unified-inventory-operations-center.js');
  const settlement=read('app/unified-settlement-operations-center.js');
  const analysis=read('app/_analysis/harin-analysis-workbench.js');

  assert.match(cs,/HarinEmptyState/);
  assert.match(cs,/recentCsTrend/);
  assert.match(inventory,/HarinMetricChart/);
  assert.match(inventory,/state="uncollected"/);
  assert.match(settlement,/HarinWaterfallChart/);
  assert.match(settlement,/HarinEmptyState/);
  assert.doesNotMatch(settlement,/value==null\?0/);
  assert.match(analysis,/HarinMetricChart/);
  assert.match(analysis,/HarinWaterfallChart/);
  assert.doesNotMatch(analysis,/value==null\?8/);
});
