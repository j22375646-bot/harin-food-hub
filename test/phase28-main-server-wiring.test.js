'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');

test('Main route creates Phase 28 runtime state on the server',()=>{
  const page=read('app/page.js');
  assert.match(page,/featureFlagsModule\.phase28RuntimeForState\(process\.env,initialState\)/);
  assert.match(page,/phase28Runtime/);
  assert.doesNotMatch(read('app/dashboard-client.js'),/process\.env\.HARIN_PHASE28/);
});

test('Main route builds the new ViewModel only for an active home request',()=>{
  const page=read('app/page.js');
  const loader=read('lib/dashboard/phase28-main-loader.js');
  assert.match(page,/phase28MainAdapter\.buildPhase28MainModel\(dashboardData\)/);
  assert.match(page,/phase28Runtime\.activePages\.includes\('home'\)/);
  assert.match(page,/initialState\.view!==\s*'main'/);
  assert.match(page,/adapter_status:'READY'/);
  assert.match(loader,/calendarEntries/);
  assert.match(loader,/hub_work_items/);
});
