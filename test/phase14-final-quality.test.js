'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const flags=require('../lib/ui/feature-flags.js');
const routes=require('../lib/navigation/hub-routes.js');
const {settleQueries,buildDataHealth}=require('../lib/dashboard/data-health.js');
const reliability=require('../lib/operations/reliability-center.js');
const {buildAiPagePanels}=require('../lib/ai/page-panels.js');

const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');

test('14-11 keeps V8 on by default and provides an explicit build rollback flag',()=>{
  assert.equal(flags.harinUiConfig({}).version,'v8');
  assert.equal(flags.harinUiConfig({HARIN_V8_ENABLED:'false'}).version,'classic');
  assert.equal(flags.harinUiConfig({HARIN_V8_ENABLED:'0'}).bodyClass,'harinClassic');
  assert.equal(flags.harinUiConfig({HARIN_V8_ENABLED:'unexpected'}).v8Enabled,true);
  const layout=read('app/layout.js');
  assert.match(layout,/data-harin-ui=\{ui\.version\}/);
  assert.match(layout,/data-harin-rollback=\{ui\.rollbackFlag\}/);
});

test('14-11 critical navigation remains real-route based and unique',()=>{
  const hrefs=routes.HUB_NAV.map(item=>item.href);
  assert.equal(new Set(hrefs).size,hrefs.length);
  assert.equal(hrefs.every(href=>href==='/'||href.startsWith('/')),true);
  assert.equal(hrefs.some(href=>href.includes('?view=')),false);
  for(const [view,items] of Object.entries(routes.HUB_WORKSPACES)){
    assert.equal(items.every(item=>routes.viewForPath(item.href)===view),true);
  }
});

test('14-11 lazy workbenches show a readable fallback instead of a blank page',()=>{
  const dashboard=read('app/dashboard-client.js');
  assert.match(dashboard,/function LazyWorkbenchFallback/);
  assert.match(dashboard,/role="status" aria-live="polite" aria-busy="true"/);
  assert.ok((dashboard.match(/,\{loading:LazyWorkbenchFallback\}\)/g)||[]).length>=20);
});

test('14-11 mobile dialog traps focus, closes with Escape, and restores the trigger',()=>{
  const shell=read('app/_shell/harin-app-shell.js');
  assert.match(shell,/aria-describedby="mobile-menu-description"/);
  assert.match(shell,/event\.key!==\'Tab\'/);
  assert.match(shell,/event\.key==='Escape'/);
  assert.match(shell,/triggerRef\.current\?\.focus\(\)/);
  assert.match(shell,/panelRef\.current\?\.querySelectorAll/);
});

test('14-11 reduced-motion protection covers all V8 descendants',()=>{
  const css=read('app/_design-system/harin-v8.css');
  assert.match(css,/@media\(prefers-reduced-motion:reduce\)/);
  assert.match(css,/animation-duration:\.01ms!important/);
  assert.match(css,/transition-duration:\.01ms!important/);
  assert.match(css,/scroll-behavior:auto!important/);
});

test('14-11 failure injection isolates one channel and preserves previous data',()=>{
  const settled=settleQueries([
    {status:'fulfilled',value:{data:[{id:'cafe'}],error:null}},
    {status:'rejected',reason:new Error('injected timeout')},
    {status:'fulfilled',value:{data:[{id:'coupang'}],error:null}}
  ],[
    {platform:'CAFE24',dataset:'orders'},
    {platform:'NAVER',dataset:'keywords'},
    {platform:'COUPANG',dataset:'orders'}
  ]);
  const health=buildDataHealth({
    now:'2026-08-16T02:00:00.000Z',issues:settled.issues,
    syncs:[
      {platform:'NAVER',status:'SUCCESS',finished_at:'2026-08-16T01:00:00.000Z'},
      {platform:'CAFE24',status:'SUCCESS',finished_at:'2026-08-16T01:00:00.000Z'},
      {platform:'COUPANG',status:'SUCCESS',finished_at:'2026-08-16T01:00:00.000Z'}
    ]
  });
  assert.deepEqual(settled.results[0].data,[{id:'cafe'}]);
  assert.deepEqual(settled.results[2].data,[{id:'coupang'}]);
  assert.equal(health.channels.find(item=>item.platform==='NAVER').status,'PARTIAL');
  assert.equal(health.channels.find(item=>item.platform==='CAFE24').status,'READY');
});

test('14-11 worker outage and AI gate remain recoverable and non-writing',()=>{
  const worker=reliability.buildWorkerHealth([{worker_id:'fixed',service_name:'harin-coupang-worker',status:'ONLINE',last_seen_at:'2026-08-16T01:30:00.000Z'}],Date.parse('2026-08-16T02:00:00.000Z'));
  const panels=buildAiPagePanels({aiConfiguration:{execution_enabled:false},dataHealth:{channels:[]}});
  assert.equal(worker.status,'CHECK');
  assert.equal(worker.workers[0].stale,true);
  assert.equal(panels.orders.execution_enabled,false);
  assert.equal(panels.orders.analysis_manifest.cost.estimated_krw,0);
  assert.equal(panels.orders.analysis_manifest.safety.platform_writes_allowed,false);
  assert.equal(panels.orders.analysis_manifest.safety.owner_approval_required,true);
});

test('14-11 decision routes keep bounded query windows for faster navigation',()=>{
  const page=read('app/page.js');
  assert.match(page,/insight:\{orders:1200,items:2500,costs:1500\}/);
  assert.match(page,/keyword:\{orders:800,items:1500,costs:800\}/);
  assert.match(page,/settlement:\{orders:3000,items:5000,costs:5000\}/);
  assert.match(page,/INSIGHT_OVERVIEW_TABLES = \['reports','platform_events','ai_analysis_results'\]/);
  assert.match(page,/view==='insight'&&workspace==='overview'/);
});

test('14-11 exposes one repeatable final verification command',()=>{
  const pkg=JSON.parse(read('package.json'));
  assert.equal(pkg.scripts['verify:phase14'],'pnpm test && pnpm build');
  assert.match(read('app/_shell/harin-app-shell.js'),/14-11 · 최종 품질·운영 안정화/);
});
