'use strict';

const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const test=require('node:test');
const moduleUnderTest=require('../lib/market-intelligence/execution-bridge.js');

const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const uuid=index=>`00000000-0000-4000-8000-${String(index).padStart(12,'0')}`;

test('17-8 실행계획은 상품 근거, 기간, 표본을 정규화한다',()=>{
  const plan=moduleUnderTest.validatePlan({source_type:'barrier',source_id:uuid(1),title:'배송 장벽 개선',platform:'naver',hypothesis:'도착일 안내를 분명히 하면 주문 전환율이 오른다.',metric:'cvr',start_date:'2026-08-18',end_date:'2026-08-31',control_label:'기존 안내',variant_label:'새 안내',minimum_sample_size:'45',risk_note:'과장 안내 위험',rollback_plan:'기존 안내로 복구',evidence_ids:[uuid(2)]});
  assert.equal(plan.source_type,'BARRIER');assert.equal(plan.platform,'NAVER');assert.equal(plan.metric,'CVR');assert.equal(plan.minimum_sample_size,45);assert.deepEqual(plan.evidence_ids,[uuid(2)]);
});

test('17-8 실행계획은 종료일 역전과 다른 근거 종류를 거부한다',()=>{
  assert.throws(()=>moduleUnderTest.validatePlan({source_type:'OTHER',source_id:uuid(1),title:'x',start_date:'2026-08-20',end_date:'2026-08-19'}),/근거 종류/);
  assert.throws(()=>moduleUnderTest.validatePlan({source_type:'BARRIER',source_id:uuid(1),title:'x',start_date:'2026-08-20',end_date:'2026-08-19'}),/종료일/);
});

test('17-8 실행 후보는 채널을 섞지 않고 출처를 보존한다',()=>{
  const rows=moduleUnderTest.sourceRows({levers:[{id:uuid(1),lever_type:'NDELIVERY',platform:'NAVER',hypothesis:'네이버 가설',status:'VERIFIED',evidence_ids:[uuid(9)]}],barriers:[{id:uuid(2),title:'쿠팡 장벽',recommendation:'개선',status:'REVIEW_REQUIRED',evidence_ids:[]}],feedback:[{id:uuid(3),title:'Cafe24 수정',recommended_change:'변경',status:'VERIFIED',evidence_ids:[uuid(8)]}]});
  assert.deepEqual(rows.map(item=>item.source_type).sort(),['BARRIER','FEEDBACK','GROWTH_LEVER']);
  assert.equal(rows.find(item=>item.source_type==='GROWTH_LEVER').platform,'NAVER');
});

test('상품 보고서 HTML은 사용자 문자를 이스케이프하고 고객 정보를 요구하지 않는다',()=>{
  const html=moduleUnderTest.reportHtml({product:{name:'<작수차>'},plan:{title:'<script>alert(1)</script>',approval_status:'APPROVED',start_date:'2026-08-18',end_date:'2026-08-31',metric:'CVR',hypothesis:'<b>가설</b>',risk_note:'위험',rollback_plan:'복구'},experiment:null});
  assert.ok(html.includes('&lt;작수차&gt;'));assert.ok(!html.includes('<script>'));assert.ok(!/customer_id|phone|address/i.test(html));
});

test('마이그레이션은 상품 격리, 승인, RLS와 브라우저 권한 차단을 강제한다',()=>{
  const sql=read('supabase/migrations/20260817020000_add_market_execution_plans.sql');
  for(const token of ['market_execution_plans','project_id uuid not null','master_product_id uuid not null','approval_status','owner_confirmed','ab_test_id','report_snapshot','enable row level security','revoke all on table public.market_execution_plans from public, anon, authenticated','market_verified_evidence_match'])assert.ok(sql.includes(token),token);
  assert.match(sql,/source must belong to the same project/);assert.match(sql,/approved execution requires owner confirmation/);
  const indexes=read('supabase/migrations/20260817020100_add_market_execution_indexes.sql');assert.ok(indexes.includes('market_execution_plans_product_idx'));assert.ok(indexes.includes('market_execution_plans_ab_test_idx'));
});

test('API는 인증과 명시적 승인 상태 전환을 요구한다',()=>{
  const route=read('app/api/market-intelligence/projects/[projectId]/execution/route.js');
  assert.ok(route.includes('isAuthorized'));assert.ok(route.includes("action==='SAVE_PLAN'"));assert.ok(route.includes("['REQUEST_APPROVAL','APPROVE_PLAN','REJECT_PLAN']"));assert.ok(route.includes("action==='CREATE_DRAFT_EXPERIMENT'"));assert.ok(route.includes("action==='GENERATE_REPORT'"));
  const service=read('lib/market-intelligence/execution-bridge.js');assert.match(service,/approval_status!=='APPROVED'/);assert.match(service,/source_type:'MANUAL'/);assert.match(service,/status:'DRAFT'/);assert.match(service,/platform_writes:false/);
});

test('전환 워크스페이스는 17-8을 연결하고 기존 페이지별 AI를 유지한다',()=>{
  const workspace=read('app/market-intelligence/[projectId]/workspace-page.js');
  const stage=read('app/market-intelligence/[projectId]/conversion/conversion-stage-client.js');
  assert.ok(workspace.includes('ConversionStage'));assert.ok(stage.includes('ExecutionBridgeWorkbench'));assert.ok(stage.includes('GrowthLoopWorkbench'));assert.ok(stage.includes('ConversionWorkbench'));assert.ok(workspace.includes('이 페이지의 AI'));
  assert.match(stage,/opened\.execution\?<ExecutionBridgeWorkbench/);
  const client=read('app/market-intelligence/[projectId]/conversion/execution-bridge-client.js');
  for(const label of ['실행계획','사장님 승인','실험실 초안','상품 보고서','플랫폼 자동 변경 없음'])assert.ok(client.includes(label),label);
});

test('17-8 UI는 V8 파스텔과 모바일 48px 조작 규격을 제공한다',()=>{
  const css=read('app/_analysis/harin-market-intelligence.css');
  assert.ok(css.includes('Phase 17-8'));assert.ok(css.includes('.marketExecutionWorkbench'));assert.match(css,/marketExecutionWorkbench input[^}]+min-height:48px/);assert.ok(css.includes('@media(max-width:700px)'));
});
