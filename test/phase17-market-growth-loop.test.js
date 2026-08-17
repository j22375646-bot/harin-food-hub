const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const growth=require('../lib/market-intelligence/growth-loop.js');

const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const order=(id,customer,date)=>({order_id:id,customer_id:customer,order_date:`${date}T03:00:00Z`,paid_amount:12000,raw_data:{}});
const item=(orderId)=>({order_id:orderId,product_name:'선택 상품',quantity:1,paid_amount:12000});

test('phase 17-7 keeps four product-reusable growth levers with fixed data owners',()=>{
  assert.deepEqual(growth.LEVER_TYPES.map(item=>item.id),['NDELIVERY','MEMBERSHIP','BUNDLE','REPURCHASE']);
  assert.equal(growth.LEVER_MAP.get('NDELIVERY').platform,'NAVER');
  assert.equal(growth.LEVER_MAP.get('REPURCHASE').platform,'CAFE24');
  assert.equal(growth.LEVER_MAP.get('BUNDLE').platform,'ALL');
});

test('channel options are compared without changing their operational source',()=>{
  const offers=growth.compareOffers([
    {platform:'CAFE24',option_name:'1개',pack_count:1,total_units:30,sale_price:12000,offer_type:'SINGLE',is_active:true},
    {platform:'CAFE24',option_name:'3개 세트',pack_count:3,total_units:90,sale_price:32400,offer_type:'BUNDLE',is_active:true}
  ],[]);
  assert.equal(offers.length,2);
  assert.equal(offers[0].unit_price,12000);
  assert.equal(offers[1].unit_price,10800);
  assert.equal(offers[1].saving_rate,10);
  assert.equal(offers[1].operational_owner,'상품 성장센터');
});

test('short history never turns repurchase readiness into zero',()=>{
  const orders=[order('a1','private-a','2026-08-01'),order('a2','private-a','2026-08-20')];
  const result=growth.productRetentionSummary({orders,items:orders.map(row=>item(row.order_id)),asOf:new Date('2026-08-25T00:00:00Z')});
  assert.equal(result.status,'PARTIAL');
  assert.equal(result.summary.lifecycle_status,'INSUFFICIENT_HISTORY');
  assert.equal(result.summary.cycle_days,null);
  assert.equal(result.summary.due_customers,null);
  assert.doesNotMatch(JSON.stringify(result),/private-a/);
});

test('adequate history and repeat intervals produce an aggregate cycle without customer ids',()=>{
  const orders=[
    order('a1','customer-a','2026-01-01'),order('a2','customer-a','2026-01-31'),order('a3','customer-a','2026-03-02'),order('a4','customer-a','2026-04-01'),
    order('b1','customer-b','2026-01-05'),order('b2','customer-b','2026-02-04'),order('b3','customer-b','2026-03-06')
  ];
  const result=growth.productRetentionSummary({orders,items:orders.map(row=>item(row.order_id)),asOf:new Date('2026-04-08T00:00:00Z')});
  assert.equal(result.status,'READY');
  assert.equal(result.summary.cycle_days,30);
  assert.ok(result.summary.interval_samples>=3);
  assert.doesNotMatch(JSON.stringify(result),/customer-a|customer-b/);
});

test('growth lever input fixes platform by lever and keeps approval evidence fields',()=>{
  const input=growth.validateLever({lever_type:'NDELIVERY',current_state:'적용 여부 확인 전',hypothesis:'도착일 표시가 이탈을 줄일 것',next_action:'14일 비교',success_metric:'방문→주문 전환율',evidence_ids:[],owner_confirmed:false});
  assert.equal(input.platform,'NAVER');
  assert.equal(input.owner_confirmed,false);
  assert.throws(()=>growth.validateLever({lever_type:'UNKNOWN'}),/성장 항목/);
});

test('phase 17-7 route, RLS storage, responsive UI and ownership links are wired',()=>{
  const workspace=read('app/market-intelligence/[projectId]/workspace-page.js');
  const stage=read('app/market-intelligence/[projectId]/conversion/conversion-stage-client.js');
  const client=read('app/market-intelligence/[projectId]/conversion/growth-loop-client.js');
  const route=read('app/api/market-intelligence/projects/[projectId]/growth-loop/route.js');
  const migration=read('supabase/migrations/20260817010000_add_market_growth_loop.sql');
  const css=read('app/_analysis/harin-market-intelligence.css');
  assert.match(workspace,/ConversionStage/);
  assert.match(stage,/GrowthLoopWorkbench/);
  assert.match(stage,/opened\.growth\?<GrowthLoopWorkbench/);
  assert.match(client,/혜택에서 재구매까지/);
  assert.match(client,/상품 성장센터 원본/);
  assert.match(client,/고객 식별값은 서버/);
  assert.match(client,/href="\/products\/offers"/);
  assert.match(client,/href="\/validation"/);
  assert.match(route,/SAVE_LEVER/);
  assert.match(migration,/unique \(project_id, lever_type\)/);
  assert.match(migration,/enable row level security/);
  assert.match(migration,/revoke all on table public\.market_growth_levers/);
  assert.match(migration,/security invoker/);
  assert.match(migration,/market_verified_evidence_match/);
  assert.match(css,/marketGrowthLoopWorkbench/);
  assert.match(css,/@media\(max-width:700px\)/);
});
