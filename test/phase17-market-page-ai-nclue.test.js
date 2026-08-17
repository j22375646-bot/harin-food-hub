'use strict';

const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const test=require('node:test');
const pageAi=require('../lib/market-intelligence/page-ai.js');

const root=path.join(__dirname,'..');
const read=relative=>fs.readFileSync(path.join(root,relative),'utf8');

test('17-9 has four distinct product workspace AI contracts',()=>{
  assert.deepEqual(Object.keys(pageAi.WORKSPACES),['data','market','competition','conversion']);
  assert.equal(new Set(Object.values(pageAi.WORKSPACES).map(item=>item.analysis_type)).size,4);
  assert.equal(pageAi.WORKSPACES.conversion.analysis_type,'MARKET_CONVERSION_AI');
});

test('NCLUE pilot stays blocked until history, consent, legal and connector evidence are ready',()=>{
  const pilot=pageAi.ncluePilot({growth:{retention:{period:{days:120},summary:{interval_samples:4,identified_customers:80,repeat_customers:12,dormant_customers:15}}},evidence:[]});
  assert.equal(pilot.status,'PARTIAL');
  assert.equal(pilot.ready_gates,2);
  assert.equal(pilot.total_gates,5);
  assert.equal(pilot.eligible_cohort_count,80);
  assert.match(pilot.safety,/개별 고객 식별값/);
});

test('NCLUE pilot only becomes ready with verified readiness evidence labels',()=>{
  const evidence=[
    {label:'마케팅 수신 동의 상태 검증'},
    {label:'NCLUE 개인정보 및 법적 적합성 승인'},
    {label:'NCLUE 계약 및 연동 사용 승인'}
  ];
  const pilot=pageAi.ncluePilot({growth:{retention:{period:{days:180},summary:{interval_samples:8}}},evidence});
  assert.equal(pilot.status,'READY');
  assert.equal(pilot.ready_gates,5);
});

test('market page AI preview is explicit server-only advice',()=>{
  const snapshot={workspace:'data',data_status:'BLOCKED',metrics:{verified_evidence_count:0,review_required_count:2,source_count:2,verified_source_count:0}};
  const result=pageAi.resultFor(snapshot);
  assert.equal(result.decision_status,'BLOCKED');
  assert.match(result.caution,/비용 없는 미리보기/);
  assert.match(result.caution,/플랫폼 변경은 수행하지 않습니다/);
});

test('17-9 UI lazily loads per-project page AI and shows NCLUE as a readiness pilot',()=>{
  const component=read('app/market-intelligence/[projectId]/market-page-ai-client.js');
  const workspace=read('app/market-intelligence/[projectId]/workspace-page.js');
  assert.match(component,/onToggle=\{toggle\}/);
  assert.match(component,/NCLUE READINESS PILOT/);
  assert.match(component,/실제 연동이 아니라 기술·비용·동의·법적 조건/);
  assert.match(component,/페이지별 AI는 합치지 않습니다/);
  assert.match(component,/OpenAI 호출 0회 · 0원/);
  assert.match(workspace,/<MarketPageAi projectId=\{project\.id\} workspace=\{workspace\}/);
});

test('17-9 storage enforces product, workspace, RLS and service-role-only access',()=>{
  const migration=read('supabase/migrations/20260817130908_add_market_page_ai_snapshots.sql');
  assert.match(migration,/market_page_ai_snapshots/);
  assert.match(migration,/p\.id = new\.project_id and p\.master_product_id = new\.master_product_id/);
  assert.match(migration,/workspace and analysis type do not match/);
  assert.match(migration,/enable row level security/);
  assert.match(migration,/revoke all on table public\.market_page_ai_snapshots from public, anon, authenticated/);
  assert.match(migration,/grant select, insert, update, delete on table public\.market_page_ai_snapshots to service_role/);
});

test('17-9 API never offers an external AI write operation',()=>{
  const route=read('app/api/market-intelligence/projects/[projectId]/page-ai/route.js');
  assert.match(route,/openai_called:false,cost_krw:0/);
  assert.doesNotMatch(route,/openaiClient|createStructuredExplanation/);
});
