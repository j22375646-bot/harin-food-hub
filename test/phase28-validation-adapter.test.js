'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const {buildPhase28ValidationModel,PHASE28_AVAILABLE_ADAPTERS}=require('../lib/ui/phase28-adapters/index.js');

const actions=[
  {id:'action-1',platform:'NAVER',target_id:'kw-1',target_name:'작두콩차 입찰가 감액',action_type:'LOWER_BID',reason:'광고비를 줄이고 주문을 유지합니다.',status:'EXECUTED',after_value:{recommendation:'ROAS를 개선합니다.'},decided_at:'2026-08-14T01:00:00Z',executed_at:'2026-08-14T02:00:00Z',priority:'HIGH'},
  {id:'action-2',platform:'CAFE24',target_id:'product-2',target_name:'상세 상단 정보 순서',action_type:'CONVERSION',reason:'구매 전환을 높입니다.',status:'PLANNED',decided_at:'2026-08-27T01:00:00Z'}
];

const evaluations=[
  {id:'eval-7',action_id:'action-1',evaluation_end:'2026-08-21',metric_name:'ROAS',before_json:{conversion_revenue:100000,contribution_profit:25000},after_json:{conversion_revenue:118400,contribution_profit:34000},change_rate:18.4,outcome:'IMPROVED',explanation:'초기 개선'},
  {id:'eval-14',action_id:'action-1',evaluation_end:'2026-08-28',metric_name:'이익',before_json:{conversion_revenue:100000,contribution_profit:25000},after_json:{conversion_revenue:146200,contribution_profit:52600},change_rate:110.4,outcome:'INCONCLUSIVE',explanation:'추가 관찰'}
];

test('Phase 28 실행검증 어댑터는 기대·실행·7일·14일·실험을 한 타임라인으로 만든다',()=>{
  const model=buildPhase28ValidationModel({
    generatedAt:'2026-08-29T01:42:00Z',actions,evaluations,
    reports:[{id:'report-1',platform:'NAVER',title:'네이버 주간 인사이트',created_at:'2026-08-28T00:00:00Z'}],
    experiments:[{id:'exp-1',name:'입찰가 감액 검증',status:'RUNNING',evaluation_status:'COLLECTING',ab_test_variants:[{entity_id:'kw-1'}]}],
    orders:[
      {order_id:'o-1',order_date:'2026-05-20T00:00:00Z',customer_id:'customer-secret',paid_amount:12000,raw_data:{}},
      {order_id:'o-2',order_date:'2026-07-01T00:00:00Z',customer_id:'customer-secret',paid_amount:12000,raw_data:{}}
    ],
    items:[{order_id:'o-1',product_name:'작두콩수세미차',quantity:1,paid_amount:12000},{order_id:'o-2',product_name:'작두콩수세미차',quantity:1,paid_amount:12000}]
  },{asOf:new Date('2026-08-29T01:42:00Z')});
  assert.equal(model.summary.executed,1);
  assert.equal(model.summary.day7Ready,1);
  assert.equal(model.summary.day14Ready,1);
  assert.equal(model.summary.linkedExperiments,1);
  assert.equal(model.items[0].targetLabel,'작두콩차 입찰가 감액');
  assert.equal(model.items[0].timeline.length,4);
  assert.equal(model.items[0].day7.valueLabel,'+18,400원');
  assert.equal(model.items[0].day14.profitLabel,'+27,600원');
  assert.equal(model.items[0].decisionLabel,'추가 관찰');
  assert.equal(model.items[0].experimentLabel,'입찰가 감액 검증');
  assert.equal(model.customer.period.days>=43,true);
  assert.equal(JSON.stringify(model).includes('customer-secret'),false);
  assert.equal(model.policy.missingAsZero,false);
});

test('실행검증 조회 오류와 보조자료 오류는 0건 성공으로 숨기지 않는다',()=>{
  const failed=buildPhase28ValidationModel({generatedAt:null,error:'actions unavailable'});
  assert.equal(failed.dataStatus,'ERROR');
  assert.equal(failed.summary.executed,null);
  assert.equal(failed.items.length,0);

  const partial=buildPhase28ValidationModel({generatedAt:'2026-08-29T01:42:00Z',actions,evaluations:[],reports:[],experiments:[],orders:[],items:[],customerError:'orders unavailable'});
  assert.equal(partial.dataStatus,'PARTIAL');
  assert.equal(partial.summary.executed,1);
  assert.equal(partial.customer.status,'ERROR');
  assert.equal(partial.customer.summary.orders,null);
});

test('validation joins the implemented V106 adapter set',()=>{
  assert.equal(PHASE28_AVAILABLE_ADAPTERS.at(-3),'validation');
});
