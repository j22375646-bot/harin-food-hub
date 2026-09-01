'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const {buildPhase28SettlementModel,PHASE28_AVAILABLE_ADAPTERS}=require('../lib/ui/phase28-adapters/index.js');

const channel=(platform,overrides={})=>({
  platform,
  label:platform==='NAVER'?'네이버':platform==='CAFE24'?'Cafe24':'쿠팡',
  status:'ACTUAL',
  basis:'확정 지급 자료',
  gross_sales:1000000,
  refunds:50000,
  fees:100000,
  logistics:30000,
  advertising:20000,
  expected_payout:850000,
  actual_payout:820000,
  payout_variance:-30000,
  order_count:18,
  last_updated_at:'2026-08-29T01:42:00.000Z',
  action:'원본 정산서를 확인하세요.',
  ...overrides
});

function center(days,channels){
  return {
    period_start:`2026-08-${String(29-days).padStart(2,'0')}T01:42:00.000Z`,
    period_end:'2026-08-29T01:42:00.000Z',
    channels,
    schedules:[
      {platform:'NAVER',date:'2026-09-01',status:'정산예정',amount:820000,type:'일별 정산'},
      {platform:'COUPANG',date:'2026-09-04',status:'예정',amount:null,type:'주정산'}
    ],
    waterfall:{gross_sales:3000000,refunds:150000,fees:300000,logistics:90000,advertising:20000,expected_payout:2530000,actual_payout:1640000,variance:-60000,comparable_channels:2},
    summary:{actual_payout:1640000,estimated_payout:null,known_fees:300000,known_logistics:90000,known_advertising:20000,actual_channels:2,estimated_channels:0,check_required_channels:1}
  };
}

test('settlement adapter keeps channel boundaries and unknown money explicit',()=>{
  const model=buildPhase28SettlementModel({
    generatedAt:'2026-08-29T01:42:00.000Z',
    settlementPeriods:{
      7:center(7,[channel('NAVER'),channel('CAFE24',{actual_payout:850000,payout_variance:0}),channel('COUPANG',{status:'UNAVAILABLE',basis:'자료 확인 필요',gross_sales:null,refunds:null,fees:null,logistics:null,expected_payout:null,actual_payout:null,payout_variance:null,order_count:null})]),
      30:center(30,[channel('NAVER'),channel('CAFE24',{actual_payout:850000,payout_variance:0}),channel('COUPANG',{status:'UNAVAILABLE',basis:'자료 확인 필요',gross_sales:null,refunds:null,fees:null,logistics:null,expected_payout:null,actual_payout:null,payout_variance:null,order_count:null})])
    }
  });

  assert.equal(model.defaultPeriod,30);
  assert.deepEqual(model.periodOptions,[7,30]);
  assert.equal(model.periods['30'].channels[0].platform,'NAVER');
  assert.equal(model.periods['30'].channels[1].platform,'CAFE24');
  assert.equal(model.periods['30'].channels[2].platform,'COUPANG');
  assert.equal(model.periods['30'].channels[2].actual,null);
  assert.equal(model.periods['30'].channels[2].variance,null);
  assert.equal(model.periods['30'].channels[2].stateLabel,'연결 확인 필요');
  assert.equal(model.hero.checkCount,2);
  assert.equal(JSON.stringify(model).includes('raw_data'),false);
});

test('settlement adapter exposes payout, variance, cost, and history evidence without write commands',()=>{
  const model=buildPhase28SettlementModel({settlementPeriods:{30:center(30,[channel('NAVER'),channel('CAFE24',{actual_payout:850000,payout_variance:0}),channel('COUPANG')])}});
  const period=model.periods['30'];
  assert.equal(period.waterfall.length,7);
  assert.deepEqual(period.waterfall.map(item=>item.id),['gross','refunds','fees','logistics','advertising','expected','actual']);
  assert.equal(period.channels[2].advertising,20000);
  assert.equal(period.channels[0].evidence.orderCount,18);
  assert.equal(period.channels[0].evidence.coverage,100);
  assert.equal(period.schedules[1].amount,null);
  assert.equal(model.writePolicy,'READ_ONLY');
});

test('settlement adapter keeps Naver ad charge and spend reconciliation separate',()=>{
  const model=buildPhase28SettlementModel({settlementPeriods:{30:center(30,[channel('NAVER',{
    advertising:25000,
    advertising_stats:24000,
    advertising_charged:115000,
    advertising_balance:90000,
    advertising_variance:1000,
    advertising_source:'BIZMONEY_EXHAUST',
    advertising_history:[{date:'2026-08-10',charged:115000,used:25000,balance:90000}]
  })])}});
  const naver=model.periods['30'].channels[0];
  assert.equal(naver.advertising,25000);
  assert.equal(naver.advertisingStats,24000);
  assert.equal(naver.advertisingCharged,115000);
  assert.equal(naver.advertisingBalance,90000);
  assert.equal(naver.advertisingVariance,1000);
  assert.equal(naver.advertisingSource,'BIZMONEY_EXHAUST');
  assert.deepEqual(naver.advertisingHistory,[{date:'2026-08-10',charged:115000,used:25000,balance:90000}]);
});

test('settlement adapter exposes Rocket Growth as its own cost evidence card',()=>{
  const model=buildPhase28SettlementModel({settlementPeriods:{30:center(30,[channel('COUPANG_RG',{
    label:'쿠팡 로켓그로스',
    gross_sales:150000,
    refunds:null,
    fees:10000,
    logistics:8800,
    advertising:33000,
    expected_payout:null,
    actual_payout:null,
    payout_variance:null,
    order_count:2,
    settlement_order_count:1,
    settlement_coverage:50,
    status:'COST_REQUIRED',
    basis:'로켓그로스 주문 API · 정산 연결 1/2건'
  })])}});
  const rocket=model.periods['30'].channels[0];
  assert.equal(rocket.platform,'COUPANG_RG');
  assert.equal(rocket.label,'쿠팡 로켓그로스');
  assert.equal(rocket.logistics,8800);
  assert.equal(rocket.advertising,33000);
  assert.equal(rocket.evidence.orderCount,2);
  assert.equal(rocket.evidence.settlementOrderCount,1);
  assert.equal(rocket.evidence.settlementCoverage,50);
});

test('settlement adapter preserves Cafe24 scope recovery state and reconnect route',()=>{
  const model=buildPhase28SettlementModel({settlementPeriods:{30:center(30,[channel('CAFE24',{
    status:'SCOPE_REQUIRED',
    basis:'주문 기반 추정 · 매출통계 권한 필요',
    gross_sales:1000000,
    expected_payout:1000000,
    actual_payout:null,
    payout_variance:null,
    action:'Cafe24를 다시 연결해 매출통계 권한을 승인하세요.',
    action_href:'/oauth/cafe24/start'
  })])}});
  const cafe24=model.periods['30'].channels[0];
  assert.equal(cafe24.stateLabel,'API 권한 필요');
  assert.equal(cafe24.actionHref,'/oauth/cafe24/start');
  assert.match(cafe24.basis,/매출통계 권한 필요/);
});

test('settlement joins the implemented V106 adapter set',()=>{
  assert.deepEqual(PHASE28_AVAILABLE_ADAPTERS,['main','calendar','orders','cs','inventory','products','settlement','keywords','product-analysis','insights','development','system','notifications','diagnoses','changes','validation','experiments','knowledge']);
});
