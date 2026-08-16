'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');

test('13-7 connects four separate workflow pages with real routes and mobile UI',()=>{
  const client=read('app/dashboard-client.js');
  const shell=read('app/_shell/harin-app-shell.js');
  const css=read('app/globals.css');
  for(const [id,href] of [['reports','/diagnoses'],['changes','/approvals'],['validation','/execution-validation'],['experiments','/ab-tests']]){
    assert.match(client,new RegExp(`id:'${id}',href:'${href.replaceAll('/','\\/')}'`));
  }
  assert.match(shell,/메뉴·업무 찾기/);
  assert.match(css,/Phase 13-7: diagnosis, approval, validation, and experiment workflow/);
  assert.match(css,/\.executionWorkflow>nav\{display:flex;overflow-x:auto/);
});

test('13-7 leaves collection history in collection and moves execution decisions to approvals',()=>{
  const client=read('app/dashboard-client.js');
  const reports=client.slice(client.indexOf('function ReportsView'),client.indexOf('function ManualAutomationButtons'));
  const approvals=client.slice(client.indexOf('function FinancialChangeCenter'),client.indexOf('const experimentMetricLabel'));
  assert.doesNotMatch(reports,/SyncTable|ActionPanel|COLLECTION HISTORY/);
  assert.match(approvals,/ActionPanel actions=\{actions\}/);
  assert.match(client,/수집이력은 데이터수집에서 확인/);
});

test('13-7 provides the same structured analysis panel on every workflow page',()=>{
  const client=read('app/dashboard-client.js');
  const panels=require('../lib/ai/page-panels.js').buildAiPagePanels({
    generatedAt:'2026-08-15T12:00:00.000Z',period:'2026-08-15',
    reportLearningHistory:{summary:{learned:2}},
    retentionValidation:{execution:{summary:{planned:1,day7_ready:1,day14_ready:1},changes:[]}},
    experiments:[{id:'one'}]
  });
  for(const page of ['reports','changes','validation','experiments']){
    assert.match(client,new RegExp(`aiPagePanels\\?\\.${page}`));
    assert.equal(panels[page].generated_at,'2026-08-15T12:00:00.000Z');
    assert.equal(panels[page].persistence_enabled,true);
    assert.ok(panels[page].sources.length>=3);
    assert.ok(panels[page].tasks.length>=3);
  }
  const panel=read('app/harin-ai-page-panel.js');
  assert.match(panel,/최신 기준시각/);
  assert.match(panel,/판단 근거와 주의사항 보기/);
  assert.match(panel,/신뢰도/);
});

test('13-7 migration allowlists workflow analysis types without opening client access',()=>{
  const sql=read('supabase/migrations/20260815000442_expand_ai_execution_workflow_pages.sql');
  for(const type of ['PAGE_REPORTS','PAGE_CHANGES','PAGE_VALIDATION','PAGE_EXPERIMENTS'])assert.match(sql,new RegExp(type));
  assert.doesNotMatch(sql,/grant .* anon|grant .* authenticated/i);
});
