const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const conversion=require('../lib/market-intelligence/conversion.js');

const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');

test('phase 17-6 keeps ten reusable purchase barrier types',()=>{
  assert.equal(conversion.BARRIER_TYPES.length,10);
  assert.equal(new Set(conversion.BARRIER_TYPES.map(item=>item.id)).size,10);
  assert.deepEqual(new Set(conversion.BARRIER_TYPES.map(item=>item.stage)),new Set(['AD','PRODUCT','CART','ORDER']));
});

test('funnel calculates rates only when both stages are available',()=>{
  const ready=conversion.createFunnel({platform:'NAVER',label:'네이버',periodStart:'2026-08-01',periodEnd:'2026-08-07',impressions:1000,visits:50,orders:5,spend:10000,revenue:50000});
  assert.equal(ready.status,'READY');
  assert.equal(ready.rates.click_through,5);
  assert.equal(ready.rates.visit_to_order,10);
  assert.equal(ready.rates.overall,0.5);
  const partial=conversion.createFunnel({platform:'CAFE24',label:'Cafe24',periodStart:'2026-08-01',periodEnd:'2026-08-30',orders:3});
  assert.equal(partial.status,'PARTIAL');
  assert.equal(partial.rates.visit_to_order,null);
  assert.equal(partial.stages[0].value,null);
});

test('missing channel connection stays blocked instead of becoming zero',()=>{
  const blocked=conversion.blockedFunnel('COUPANG','쿠팡','상품 연결 필요');
  assert.equal(blocked.status,'BLOCKED');
  assert.deepEqual(blocked.stages.map(item=>item.value),[null,null,null]);
  assert.equal(blocked.rates.overall,null);
});

test('barrier and detail feedback validation preserve owner confirmation gates',()=>{
  const barrier=conversion.validateBarrier({barrier_type:'TRUST_REVIEW',funnel_stage:'PRODUCT',severity:'HIGH',title:'신뢰 근거',observation:'리뷰 근거 확인 필요',recommendation:'제조 근거를 첫 화면에 표시',evidence_ids:[],owner_confirmed:false});
  assert.equal(barrier.barrier_type,'TRUST_REVIEW');
  assert.equal(barrier.owner_confirmed,false);
  const feedback=conversion.validateFeedback({area:'TRUST',title:'제조 인증 배치',current_issue:'근거가 아래에 있음',recommended_change:'첫 화면으로 이동',success_metric:'방문→주문 전환율',source_barrier_ids:[],evidence_ids:[]});
  assert.equal(feedback.area,'TRUST');
  assert.throws(()=>conversion.validateBarrier({barrier_type:'UNKNOWN',title:'x'}),/유형/);
});

test('summary requires a complete channel and verified barrier',()=>{
  const funnels=[conversion.createFunnel({platform:'NAVER',label:'네이버',periodStart:'2026-08-01',periodEnd:'2026-08-07',impressions:10,visits:2,orders:1}),conversion.blockedFunnel('CAFE24','Cafe24','자료 없음')];
  const blocked=conversion.responseSummary({funnels,barriers:[],feedback:[],evidence:[]});
  assert.equal(blocked.readiness,'BLOCKED');
  const ready=conversion.responseSummary({funnels,barriers:[{status:'VERIFIED'}],feedback:[],evidence:[{id:'e1'}]});
  assert.equal(ready.readiness,'READY');
});

test('phase 17-6 route, database isolation and responsive workbench are wired',()=>{
  const workspace=read('app/market-intelligence/[projectId]/workspace-page.js');
  const client=read('app/market-intelligence/[projectId]/conversion/conversion-client.js');
  const route=read('app/api/market-intelligence/projects/[projectId]/conversion/route.js');
  const migration=read('supabase/migrations/20260816202253_add_market_conversion_barriers.sql');
  const hardening=read('supabase/migrations/20260817002000_harden_market_feedback_verified_barriers.sql');
  const indexes=read('supabase/migrations/20260817002500_add_market_conversion_product_indexes.sql');
  const css=read('app/_analysis/harin-market-intelligence.css');
  assert.match(workspace,/ConversionWorkbench/);
  assert.match(client,/10 PURCHASE BARRIERS/);
  assert.match(client,/네이버·Cafe24·쿠팡을 섞지 않고/);
  assert.match(client,/판단 보류/);
  assert.match(route,/SAVE_BARRIER/);
  assert.match(route,/SAVE_FEEDBACK/);
  assert.match(migration,/unique \(project_id, barrier_type\)/);
  assert.match(migration,/enable row level security/);
  assert.match(migration,/revoke all on table public\.market_barriers/);
  assert.match(migration,/security invoker/);
  assert.match(hardening,/b\.status = 'VERIFIED'/);
  assert.match(hardening,/verified_barriers <> cardinality/);
  assert.match(indexes,/market_barriers_master_product_idx/);
  assert.match(indexes,/market_feedback_cards_master_product_idx/);
  assert.match(client,/data\.barriers\.filter\(item=>item\.status==='VERIFIED'\)/);
  assert.match(css,/marketConversionWorkbench/);
  assert.match(css,/@media\(max-width:700px\)/);
});
