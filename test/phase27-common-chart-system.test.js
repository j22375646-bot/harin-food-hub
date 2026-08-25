'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const visualization=require('../lib/ui/visualization.js');

test('27-2 metric chart model aligns evidence and keeps unknown points separate from zero',()=>{
  const model=visualization.buildChartModel({
    labels:['월','화','수'],
    series:[
      {label:'매출',tone:'blue',values:[12000,0]},
      {label:'광고비',tone:'amber',values:[3000,null,2500,9999]},
    ],
  });

  assert.deepEqual(model.series[0].values,[12000,0,null,null]);
  assert.deepEqual(model.series[1].values,[3000,null,2500,9999]);
  assert.deepEqual(model.labels,['월','화','수','항목 4']);
  assert.equal(model.series[0].tone,'primary');
  assert.equal(model.series[1].tone,'warning');
  assert.equal(model.confirmedPointCount,5);
  assert.equal(model.missingPointCount,3);
  assert.equal(model.hasMissingEvidence,true);
});

test('27-2 metric chart model exposes a real zero baseline for positive and negative values',()=>{
  const model=visualization.buildChartModel({
    labels:['전주','이번 주'],
    series:[{label:'증감',values:[-20,35]}],
  });

  assert.deepEqual(model.domain,{min:-20,max:35,span:55});
  assert.equal(model.hasNegative,true);
  assert.equal(model.status,'READY');

  const confirmedZero=visualization.buildChartModel({labels:['오늘'],series:[{label:'주문',values:[0]}]});
  assert.deepEqual(confirmedZero.domain,{min:0,max:1,span:1});
});

test('27-2 donut model reports partial evidence instead of silently dropping it',()=>{
  assert.equal(typeof visualization.buildDonutModel,'function');
  const model=visualization.buildDonutModel([
    {label:'네이버',value:120000,tone:'blue'},
    {label:'쿠팡',value:null,tone:'amber'},
    {label:'Cafe24',value:0,tone:'mint'},
  ]);

  assert.equal(model.status,'READY');
  assert.equal(model.total,120000);
  assert.equal(model.items[1].displayStatus,'CHECK_REQUIRED');
  assert.equal(model.items[2].value,0);
  assert.equal(model.hasMissingEvidence,true);
});

test('27-2 common chart components expose status, evidence summary, and screen-reader data',()=>{
  const ui=read('app/_design-system/harin-ui.js');
  const css=read('app/_design-system/harin-v8.css');
  const tokens=read('app/_design-system/harin-brand-tokens.css');
  const shell=read('app/_shell/harin-shell-v8.css');

  assert.match(ui,/data-chart-status=\{model\.status\}/);
  assert.match(ui,/data-chart-evidence=/);
  assert.match(ui,/className="v8ChartDataTable"/);
  assert.match(ui,/v8ChartMissingPoint/);
  assert.match(css,/\.v8ChartGrid/);
  assert.match(css,/\.v8ChartMissingPoint/);
  assert.match(css,/\.v8ChartDataTable/);
  assert.match(tokens,/--harin-chart-primary:/);
  assert.match(tokens,/--harin-chart-missing:/);
  assert.match(shell,/\.hubMain\[data-tone\]\{--harin-chart-primary:var\(--nav-ink\);--harin-chart-primary-soft:var\(--nav-soft\)\}/);
  assert.doesNotMatch(css.slice(css.indexOf('.v8MetricChart'),css.indexOf('.v8StateCard')),/(?:linear|radial|conic)-gradient/);
});
