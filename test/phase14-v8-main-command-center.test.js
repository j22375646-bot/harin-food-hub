'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');

test('14-3 loads a route-scoped Main command center and its isolated design layer',()=>{
  const layout=read('app/layout.js');
  const client=read('app/dashboard-client.js');
  const main=read('app/_main/harin-main-command-center.js');
  assert.match(layout,/import '.\/_main\/harin-main-v8\.css'/);
  assert.match(client,/dynamic\(\(\)=>import\('\.\/_main\/harin-main-command-center\.js'\),\{loading:LazyWorkbenchFallback\}\)/);
  assert.match(client,/<Phase14MainCommandCenter center=\{initialData\.salesCommandCenter\}/);
  assert.match(main,/14-3 · DAILY COMMAND CENTER/);
  assert.match(main,/function QuickCommandBar/);
  assert.match(main,/function SmartSchedule/);
  assert.match(main,/function ExceptionInbox/);
});

test('14-3 keeps Main AI page-scoped and disabled configuration outside the command center',()=>{
  const client=read('app/dashboard-client.js');
  const main=read('app/_main/harin-main-command-center.js');
  assert.match(client,/className="mainAiSlot"><HarinAiPagePanel panel=\{initialData\.aiPagePanels\?\.main\}/);
  assert.doesNotMatch(main,/HarinAiPagePanel|OPENAI_ANALYSIS_ENABLED/);
});

test('14-3 server owns deduplicated task counts and does not treat missing money as zero',()=>{
  const page=read('app/page.js');
  const builder=read('lib/dashboard/sales-command-center.js');
  const main=read('app/_main/harin-main-command-center.js');
  assert.match(page,/unifiedOrders,\s*customerService,\s*unifiedInventory,\s*reliabilityCenter/);
  assert.match(builder,/function buildDailyOperations/);
  assert.match(builder,/const tasks = new Map\(\)/);
  assert.match(builder,/current:hasPacing\?round\(current\):null/);
  assert.match(main,/value==null\?'판단 보류'/);
});

test('14-3 mobile layout keeps quick commands and task cards readable',()=>{
  const css=read('app/_main/harin-main-v8.css');
  assert.match(css,/grid-template-columns:repeat\(5,minmax\(0,1fr\)\)/);
  assert.match(css,/@media\(max-width:560px\)/);
  assert.match(css,/\.mainTaskGroups\{grid-template-columns:1fr\}/);
  assert.match(css,/@media\(prefers-reduced-motion:reduce\)/);
});
