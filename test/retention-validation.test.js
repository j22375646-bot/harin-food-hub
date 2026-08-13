const test=require('node:test');
const assert=require('node:assert/strict');
const moduleUnderTest=require('../lib/customers/retention-validation.js');

function order(id,customer,date,amount=10000,place='모바일웹'){return{order_id:id,customer_id:customer,order_date:`${date}T03:00:00Z`,paid_amount:amount,raw_data:{order_place_name:place}};}
function item(orderId,name='작두콩차',amount=10000){return{order_id:orderId,product_name:name,quantity:1,paid_amount:amount};}

test('고객 ID를 반환하지 않고 1회·반복 구매를 집계한다',()=>{
  const orders=[order('o1','private-a','2026-01-01'),order('o2','private-a','2026-02-01'),order('o3','private-b','2026-02-05'),order('o4','', '2026-02-06')];
  const result=moduleUnderTest.buildCustomerRetention({orders,items:orders.map(row=>item(row.order_id)),asOf:new Date('2026-04-15T00:00:00Z')});
  assert.equal(result.summary.identified_customers,2);
  assert.equal(result.summary.one_order_customers,1);
  assert.equal(result.summary.repeat_customers,1);
  assert.equal(result.summary.anonymous_orders,1);
  assert.doesNotMatch(JSON.stringify(result),/private-a|private-b/);
});

test('짧은 이력은 휴면과 재구매 예정 고객을 0으로 만들지 않는다',()=>{
  const orders=[order('o1','a','2026-08-01'),order('o2','b','2026-08-08')];
  const result=moduleUnderTest.buildCustomerRetention({orders,items:orders.map(row=>item(row.order_id)),asOf:new Date('2026-08-13T00:00:00Z')});
  assert.equal(result.summary.lifecycle_status,'INSUFFICIENT_HISTORY');
  assert.equal(result.summary.due_customers,null);
  assert.equal(result.summary.dormant_customers,null);
});

test('조회한 90일 범위와 실제 주문 발생 범위를 구분한다',()=>{
  const orders=[order('o1','a','2026-05-20'),order('o2','a','2026-08-08')];
  const result=moduleUnderTest.buildCustomerRetention({orders,items:orders.map(row=>item(row.order_id)),orderHistoryPeriod:{start_date:'2026-05-16',end_date:'2026-08-13'},asOf:new Date('2026-08-13T00:00:00Z')});
  assert.equal(result.period.days,90);
  assert.equal(result.period.order_activity_days,81);
});

test('반복 간격이 충분하면 상품 주기와 예정·휴면 대상을 계산한다',()=>{
  const orders=[
    order('a1','a','2026-01-01'),order('a2','a','2026-01-31'),order('a3','a','2026-03-02'),order('a4','a','2026-04-01'),
    order('b1','b','2026-01-05'),order('b2','b','2026-02-04'),order('b3','b','2026-03-06'),
    order('c1','c','2026-01-10')
  ];
  const result=moduleUnderTest.buildCustomerRetention({orders,items:orders.map(row=>item(row.order_id)),asOf:new Date('2026-04-08T00:00:00Z')});
  assert.equal(result.summary.cycle_days,30);
  assert.equal(result.summary.lifecycle_status,'READY');
  assert.equal(result.products[0].cycle_days,30);
  assert.ok(result.summary.due_customers>=1);
});

test('유입경로 주문 귀속이 없으면 방문 전용으로 표시한다',()=>{
  const result=moduleUnderTest.buildCustomerRetention({referrers:[{source:'naver.com',visitors:20,orders:null,revenue:null}]});
  assert.equal(result.acquisition.status,'VISITS_ONLY');
  assert.equal(result.acquisition.attributed_orders,null);
  assert.equal(result.acquisition.rows[0].label,'네이버 검색·서비스');
});

test('주문과 매출이 모두 0인 유입 자료도 귀속 완료로 오해하지 않는다',()=>{
  const result=moduleUnderTest.buildCustomerRetention({referrers:[{source:'naver.com',visitors:24,orders:0,revenue:0}]});
  assert.equal(result.acquisition.status,'VISITS_ONLY');
  assert.equal(result.acquisition.attributed_orders,null);
  assert.equal(result.acquisition.attributed_revenue,null);
});

test('실행 전 예상효과와 위험, 7일·14일 결과를 연결한다',()=>{
  const action={id:'action-1',platform:'NAVER',target_id:'keyword-1',target_name:'작두콩차',action_type:'LOWER_BID',status:'REVIEWED',executed_at:'2026-01-01T00:00:00Z'};
  const evaluations=[
    {action_id:'action-1',evaluation_end:'2026-01-09',metric_name:'ROAS',outcome:'IMPROVED',before_json:{conversion_revenue:10000},after_json:{conversion_revenue:13000},change_rate:30,explanation:'개선'},
    {action_id:'action-1',evaluation_end:'2026-01-16',metric_name:'ROAS',outcome:'IMPROVED',before_json:{conversion_revenue:10000,contribution_profit:1000},after_json:{conversion_revenue:15000,contribution_profit:2500},change_rate:50,explanation:'개선 유지'}
  ];
  const result=moduleUnderTest.buildExecutionValidation({actions:[action],evaluations,reports:[{id:'r1',platform:'NAVER',title:'네이버 보고서',created_at:'2026-01-16'}],experiments:[{id:'e1',name:'입찰 실험',status:'COMPLETED',evaluation_status:'WINNER',ab_test_variants:[{entity_id:'keyword-1'}]}],asOf:new Date('2026-01-20T00:00:00Z')});
  assert.equal(result.actions[0].expectation.risk_level,'MEDIUM');
  assert.equal(result.actions[0].day7.status,'IMPROVED');
  assert.equal(result.actions[0].day14.revenue_change,5000);
  assert.equal(result.actions[0].day14.profit_change,1500);
  assert.equal(result.summary.linked_reports,1);
  assert.equal(result.summary.linked_experiments,1);
});

test('아직 실행하지 않은 액션은 결과를 0으로 만들지 않는다',()=>{
  const result=moduleUnderTest.buildExecutionValidation({actions:[{id:'a',action_type:'WATCH',status:'PLANNED'}],asOf:new Date('2026-01-20')});
  assert.equal(result.actions[0].day7.status,'WAITING_EXECUTION');
  assert.equal(result.actions[0].day7.revenue_change,null);
  assert.equal(result.actions[0].day14.profit_change,null);
});
