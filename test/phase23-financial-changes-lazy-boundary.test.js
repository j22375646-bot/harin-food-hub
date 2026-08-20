'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.join(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');

test('23 hardening loads the financial change center only for the change route',()=>{
  const dashboard=read('app/dashboard-client.js');
  const changes=read('app/_execution/harin-financial-change-center.js');
  assert.match(dashboard,/const HarinFinancialChangeCenter=dynamic\(\(\)=>import\('\.\/_execution\/harin-financial-change-center\.js'\)/);
  assert.match(dashboard,/<HarinFinancialChangeCenter bidWorkbench=\{initialData\.naverBidWorkbench\}/);
  assert.doesNotMatch(dashboard,/function FinancialChangeCenter|OWNER CHANGE HISTORY|naverBidCandidateList|naverAutomationPanel/);
  assert.match(changes,/export default function HarinFinancialChangeCenter/);
  assert.match(changes,/OWNER CHANGE HISTORY/);
});

test('23 hardening preserves owner confirmation, Naver writes, verification, and history',()=>{
  const changes=read('app/_execution/harin-financial-change-center.js');
  assert.match(changes,/window\.confirm/);
  assert.match(changes,/\/api\/naver\/bid-proposals/);
  assert.match(changes,/\/api\/naver\/bid-evaluations/);
  assert.match(changes,/\/api\/financial-changes/);
  assert.match(changes,/ROLLBACK/);
  assert.match(changes,/실제 저장값 재확인/);
});

test('23 hardening keeps the shared dashboard client below its lazy-boundary budget',()=>{
  const dashboardPath=path.join(root,'app/dashboard-client.js');
  assert.ok(fs.statSync(dashboardPath).size<250000,`dashboard-client.js is ${fs.statSync(dashboardPath).size} bytes`);
});
