'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {buildAiPagePanels}=require('../lib/ai/page-panels.js');
const pageResults=require('../lib/ai/page-results.js');
const pageAnalysis=require('../lib/ai/page-analysis.js');

const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');

function panels(executionEnabled=false){
  return buildAiPagePanels({
    dataHealth:{channels:[
      {platform:'CAFE24',calculationStatus:'READY'},
      {platform:'NAVER',calculationStatus:'READY'},
      {platform:'COUPANG',calculationStatus:'READY'}
    ]},
    priorityCenter:{items:[{}]},productOperations:{summary:{sellable:2}},
    unifiedOrders:{summary:{actionRequired:1}},customerService:{summary:{active:1}},
    unifiedInventory:{summary:{action_required:1}},unifiedSettlement:{summary:{check_required_channels:0}},
    searchTermCenter:{items:[{}]},collectionCenter:{summary:{ready_channels:3}},
    aiConfiguration:{execution_enabled:executionEnabled},generatedAt:'2026-08-16T01:00:00.000Z'
  });
}

test('14-10 keeps fourteen page AI studios independent and explains every input boundary',()=>{
  const result=panels(false);
  assert.deepEqual(Object.keys(result),Object.keys(pageResults.ANALYSIS_TYPES));
  assert.equal(new Set(Object.values(result).map(panel=>panel.analysis_manifest)).size,14);
  for(const [page,panel] of Object.entries(result)){
    assert.equal(panel.id,page);
    assert.ok(panel.analysis_manifest.inputs.length>=3);
    assert.ok(panel.analysis_manifest.excluded.length>=4);
    assert.ok(panel.analysis_manifest.freshness.max_age_hours>0);
    assert.match(panel.analysis_manifest.confidence.state,/LOW|MEDIUM|HIGH/);
    assert.equal(panel.analysis_manifest.cost.estimated_krw,0);
    assert.equal(panel.analysis_manifest.safety.platform_writes_allowed,false);
    assert.equal(panel.analysis_manifest.safety.owner_approval_required,true);
    assert.equal(panel.analysis_manifest.safety.pii_allowed,false);
    assert.equal(panel.persistence_enabled,true);
  }
});

test('14-10 OpenAI gate changes readiness metadata but never enables platform writes',()=>{
  const result=panels(true);
  for(const panel of Object.values(result)){
    assert.equal(panel.execution_enabled,true);
    assert.equal(panel.analysis_manifest.cost.estimated_krw,null);
    assert.equal(panel.analysis_manifest.safety.openai_enabled,true);
    assert.equal(panel.analysis_manifest.safety.platform_writes_allowed,false);
  }
});

test('14-10 blocked page result stays deterministic and approval safe',()=>{
  const preview=pageResults.buildPagePreview({
    page:'orders',period:'2026-08-16',generatedAt:'2026-08-16T01:00:00.000Z',dataStatus:'STALE',
    metrics:{primary_value:2},panel:{metric_label:'처리 주문',metric_value:'2건',readiness_label:'수집 확인 필요',sources:['주문 상태']}
  });
  const blocked=pageAnalysis.blockedResult(preview.snapshot);
  assert.equal(blocked.decision_status,'BLOCKED');
  assert.equal(blocked.confidence,'LOW');
  assert.match(blocked.caution,/변경하지 않습니다/);
});

test('14-10 paid page route stops before reading a snapshot while the cost gate is off',()=>{
  const route=read('app/api/ai/page-analysis/route.js');
  assert.ok(route.indexOf('if(!config.execution_enabled)')<route.indexOf('apiSafety.readJson'));
  assert.match(route,/AI_EXECUTION_DISABLED/);
  assert.match(route,/openai_called:false,cost_krw:0/);
  assert.match(route,/roleAtLeast\(session,'OWNER'\)/);
  assert.match(route,/verifyAiSnapshot/);
});

test('14-10 page analysis is fingerprint scoped, deduplicated, PII guarded, and explanation only',()=>{
  const service=read('lib/ai/page-analysis.js');
  const client=read('lib/ai/openai-client.js');
  assert.match(service,/\.eq\('analysis_type',analysisType\)\.eq\('page_key',page\)/);
  assert.match(service,/openai:page-analysis:\$\{page\}:\$\{inputFingerprint\}/);
  assert.match(service,/privacy\.assertNoPii\(snapshot\)/);
  assert.match(service,/if\(!checked\.can_run\)/);
  assert.match(client,/입찰가, 광고예산, 상품, 주문을 직접 변경하거나 변경했다고 말하지 마세요/);
});

test('14-10 knowledge scopes cover every independent page studio',()=>{
  const sql=read('supabase/migrations/20260816170000_complete_ai_knowledge_page_scopes.sql');
  const center=read('lib/ai/knowledge-center.js');
  for(const page of Object.keys(pageResults.ANALYSIS_TYPES)){
    assert.match(sql,new RegExp(`'${page}'`));
    assert.match(center,new RegExp(`${page}:`));
  }
  assert.match(sql,/scope_pages <@ array/);
});

test('14-10 UI exposes inputs exclusions freshness confidence cost and owner approval on mobile',()=>{
  const panel=read('app/harin-ai-page-panel.js');
  const css=read('app/_ai/harin-ai-page-v8.css');
  const layout=read('app/layout.js');
  for(const phrase of ['분석에 넣는 자료','자료 최신성','현재 신뢰도','예상 비용','실행 안전장치','분석에서 항상 빼는 자료'])assert.match(panel,new RegExp(phrase));
  assert.match(panel,/\/api\/ai\/page-analysis/);
  assert.match(panel,/다른 화면 자료와 섞지 않고/);
  assert.match(panel,/추천만 · 자동 변경 없음/);
  assert.match(panel,/harin-ai-page-v8\.css/);
  assert.doesNotMatch(layout,/harin-ai-page-v8\.css/);
  assert.match(css,/@media\(max-width:700px\)/);
  assert.match(css,/@media\(prefers-reduced-motion:reduce\)/);
}
);
