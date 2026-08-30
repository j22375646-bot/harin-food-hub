'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');

test('27-8 실행검증과 A/B 테스트는 거대한 공통 로더를 건너뛴다',()=>{
  const source=read('app/dashboard-route.js');
  assert.match(source,/const focusedExecutionView=\['validation','experiments'\]\.includes\(view\)/);
  assert.match(source,/async function buildExecutionDashboardData\(/);
  assert.match(source,/if\(focusedExecutionView\)\{/);
  assert.ok(
    source.indexOf("if(focusedExecutionView){")<source.indexOf('const productTargetSettled='),
    '실행 화면 전용 반환은 공통 상품·광고 로더보다 먼저 끝나야 합니다.'
  );
});

test('27-8 실행 화면은 판단과 실험 미리보기에 필요한 근거만 보존한다',()=>{
  const source=read('app/dashboard-route.js');
  for(const field of ['hypothesis','start_date','end_date','winner_variant_id','is_control','impressions','clicks','conversions','orders','revenue']){
    assert.match(source,new RegExp(field));
  }
  assert.match(source,/finalizeAiPagePanels\(\{\[view\]:builtPanels\[view\]\}/);
  assert.match(source,/loadedView:view/);
  assert.match(source,/retentionValidation,experiments,automationRuns,aiPagePanels/);
});

test('27-8 A/B 첫 화면은 실험과 해당 AI만 읽고 미수집 실행 단계는 확인 필요로 둔다',()=>{
  const page=read('app/dashboard-route.js');
  const profiles=read('lib/dashboard/page-loader-profiles.js');
  assert.match(profiles,/experiments:\['ab_tests','ai_analysis_results'\]/);
  assert.match(profiles,/validation:\['actions','action_evaluations','financial_change_requests','financial_change_audit_logs','ai_analysis_results'\]/);
  assert.match(page,/\['reports','changes','validation','experiments'\]\.includes\(view\)\?MINIMAL_SHELL_TABLES/);
  assert.match(page,/const executionDataLoaded=view==='validation'/);
  assert.match(page,/reportLearningHistory:null/);
  assert.match(page,/experiments:view==='experiments'\?experiments:null/);
  assert.match(page,/const retentionValidation=executionDataLoaded\?\{execution\}:\{execution:null\}/);
});

test('27-8 A/B 모바일 글자는 14px 이상이고 입력 동작은 44px 이상이다',()=>{
  const css=read('app/globals.css');

  assert.match(css,/\.harinV8 \.hubMain\[data-view="experiments"\] \.experimentCreate label>span[\s\S]*?font-size:14px/);
  assert.match(css,/\.harinV8 \.hubMain\[data-view="experiments"\] \.experimentCreate input[\s\S]*?min-height:44px/);
  assert.match(css,/\.harinV8 \.hubMain\[data-view="experiments"\] \.experimentProductScope\{[\s\S]*?background:#f7f8fc/);
});
