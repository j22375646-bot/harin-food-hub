'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const {order:mapCafe24Order}=require('../lib/cafe24/mappers.js');

const {
  orderPaymentEvidence,
  settlementPaymentDate,
  summarizeSettlementDayEvidence,
}=require('../lib/cafe24/settlement-evidence.js');

test('명시적 미결제 Cafe24 주문은 표시가가 있어도 대체 매출에 포함하지 않는다',()=>{
  const evidence=orderPaymentEvidence({
    order_id:'UNPAID-1',
    payment_status:'F',
    paid_amount:null,
    order_price:50000,
    raw_data:{paid:'F',order_place_id:'cafe24'}
  });

  assert.deepEqual(evidence,{
    eligible:false,
    amount:null,
    basis:null,
    issue:'EXPLICITLY_UNPAID'
  });
});

test('실결제금액은 충돌하는 주문 표시가보다 우선한다',()=>{
  const evidence=orderPaymentEvidence({
    order_id:'PAID-1',
    payment_status:'P',
    paid_amount:30000,
    order_price:50000,
    raw_data:{paid:'T',order_place_id:'cafe24'}
  });

  assert.deepEqual(evidence,{
    eligible:true,
    amount:30000,
    basis:'PAID_AMOUNT',
    issue:null
  });
});

test('저장 실결제금액이 0이어도 양수 원시 실결제금액이 있으면 원시 금액을 우선한다',()=>{
  const evidence=orderPaymentEvidence({
    order_id:'RAW-PAID-1',
    payment_status:'P',
    paid_amount:0,
    order_price:50000,
    raw_data:{paid:'T',actual_payment_amount:41000,order_place_id:'cafe24'}
  });

  assert.deepEqual(evidence,{
    eligible:true,
    amount:41000,
    basis:'RAW_ACTUAL_PAYMENT_AMOUNT',
    issue:null
  });
});

test('부분결제 주문의 주문총액 fallback은 실제 수납액으로 인증하지 않는다',()=>{
  const mapped=mapCafe24Order({
    order_id:'PARTIAL-TOTAL',
    order_date:'2026-09-01T10:00:00+09:00',
    payment_date:'2026-09-01T11:00:00+09:00',
    paid:'M',
    payment_amount:'50000.00',
    order_place_id:'cafe24'
  });

  assert.equal(mapped.paid_amount,50000);
  assert.deepEqual(orderPaymentEvidence(mapped),{
    eligible:false,
    amount:null,
    basis:null,
    issue:'PARTIAL_PAYMENT_AMOUNT_MISSING'
  });
});

test('부분결제 주문에 실제 수납액이 있으면 알려진 부분금액만 보존한다',()=>{
  const mapped=mapCafe24Order({
    order_id:'PARTIAL-ACTUAL',
    order_date:'2026-09-01T10:00:00+09:00',
    payment_date:'2026-09-01T11:00:00+09:00',
    paid:'M',
    actual_payment_amount:'12000.00',
    payment_amount:'50000.00',
    order_place_id:'cafe24'
  });

  assert.deepEqual(orderPaymentEvidence(mapped),{
    eligible:true,
    amount:12000,
    basis:'RAW_ACTUAL_PAYMENT_AMOUNT',
    issue:'PARTIAL_PAYMENT'
  });
});

test('결제 후 취소·환불된 주문은 결제 gross를 보존하고 환불은 별도 원장에 맡긴다',()=>{
  const evidence=orderPaymentEvidence({
    order_id:'REFUNDED-1',
    payment_status:'C40',
    paid_amount:42000,
    cancel_amount:42000,
    raw_data:{paid:'T',canceled:'T',order_place_id:'cafe24'}
  });

  assert.deepEqual(evidence,{
    eligible:true,
    amount:42000,
    basis:'PAID_AMOUNT',
    issue:null
  });
});

test('결제상태가 없는 legacy 양수 실결제금액은 금액만 보존하고 완전성은 인증하지 않는다',()=>{
  const evidence=orderPaymentEvidence({
    order_id:'LEGACY-1',
    paid_amount:27000,
    order_price:30000,
    raw_data:{order_place_id:'NCHECKOUT'}
  });

  assert.deepEqual(evidence,{
    eligible:true,
    amount:27000,
    basis:'PAID_AMOUNT',
    issue:'PAYMENT_STATUS_UNCERTAIN'
  });
});

test('SmartStore 미러는 제외하고 Cafe24 공식몰 네이버페이는 유지한다',()=>{
  const ncheckout=orderPaymentEvidence({payment_status:'P',paid_amount:10000,raw_data:{paid:'T',order_place_id:'NCHECKOUT'}});
  const smartStore=orderPaymentEvidence({payment_status:'P',paid_amount:20000,raw_data:{paid:'T',order_place_id:'shopn'}});

  assert.equal(ncheckout.eligible,true);
  assert.equal(ncheckout.amount,10000);
  assert.deepEqual(smartStore,{eligible:false,amount:null,basis:null,issue:'MIRRORED_MARKETPLACE'});
});

test('KST 기간의 API·주문추정·누락·불확실 날짜를 중복 없이 요약한다',()=>{
  const result=summarizeSettlementDayEvidence({
    periodStart:'2026-09-05',
    periodEnd:'2026-09-08',
    salesDaily:[{date:'2026-09-05',payment_amount:1100,refund_amount:100,sales_count:1,source_status:'OK'}],
    orders:[
      {order_id:'API-DAY',order_date:'2026-09-04T16:00:00Z',payment_status:'P',paid_amount:1000,raw_data:{paid:'T',order_place_id:'cafe24'}},
      {order_id:'ESTIMATE-DAY',order_date:'2026-09-06T10:00:00+09:00',payment_status:'P',paid_amount:2000,raw_data:{paid:'T',order_place_id:'cafe24'}},
      {order_id:'UNCERTAIN-DAY',order_date:'2026-09-07T10:00:00+09:00',paid_amount:3000,raw_data:{order_place_id:'NCHECKOUT'}}
    ]
  });

  assert.deepEqual(result.coverage,{
    expected_days:4,
    api_days:1,
    estimated_days:2,
    missing_days:1,
    uncertain_days:2
  });
  assert.deepEqual(result.days.map(day=>[day.date,day.source,day.payment_amount,day.source_status]),[
    ['2026-09-05','SALES_REPORT',1100,'OK'],
    ['2026-09-06','ORDER_ESTIMATE',2000,'UNCERTAIN'],
    ['2026-09-07','ORDER_ESTIMATE',3000,'UNCERTAIN'],
    ['2026-09-08','MISSING',null,'NO_DATA']
  ]);
  assert.equal(result.actual_payout,null);
});

test('필수 필드가 빠진 API 날짜는 완전한 API 근거로 인증하지 않는다',()=>{
  const result=summarizeSettlementDayEvidence({
    periodStart:'2026-09-07',
    periodEnd:'2026-09-07',
    salesDaily:[{
      date:'2026-09-07',
      payment_amount:5000,
      refund_amount:null,
      sales_count:1,
      source_status:'PARTIAL'
    }],
    orders:[]
  });

  assert.deepEqual(result.coverage,{
    expected_days:1,
    api_days:0,
    estimated_days:0,
    missing_days:1,
    uncertain_days:0
  });
  assert.equal(result.days[0].source,'MISSING');
  assert.equal(result.actual_payout,null);
});

test('주문일 다음 날 결제된 주문은 결제일 API와 중복 합산하지 않는다',()=>{
  const result=summarizeSettlementDayEvidence({
    periodStart:'2026-09-01',
    periodEnd:'2026-09-02',
    orders:[{
      order_id:'NEXT-DAY-PAID',
      order_date:'2026-09-01T10:00:00+09:00',
      paid_amount:10000,
      raw_data:{paid:'T',payment_date:'2026-09-02T10:00:00+09:00',order_place_id:'cafe24'}
    }],
    salesDaily:[{
      date:'2026-09-02',payment_amount:10000,refund_amount:0,sales_count:1,source_status:'OK'
    }]
  });

  assert.deepEqual(result.days.map(day=>[day.date,day.source,day.payment_amount]),[
    ['2026-09-01','MISSING',null],
    ['2026-09-02','SALES_REPORT',10000]
  ]);
});

test('정산 결제일은 유효한 결제일을 우선하고 주문일 fallback의 불확실성을 보존한다',()=>{
  assert.deepEqual(settlementPaymentDate({
    order_date:'2026-09-01',
    payment_date:'2026-09-02T00:00:00Z',
    raw_data:{payment_date:'2026-09-02T16:00:00Z'}
  }),{date:'2026-09-03',basis:'RAW_PAYMENT_DATE',issue:null});
  assert.deepEqual(settlementPaymentDate({
    order_date:'2026-09-01',payment_date:'not-a-date',raw_data:{}
  }),{date:'2026-09-01',basis:'ORDER_DATE_ESTIMATE',issue:'PAYMENT_DATE_INVALID'});
  assert.deepEqual(settlementPaymentDate({
    order_date:'2026-09-01',raw_data:{}
  }),{date:'2026-09-01',basis:'ORDER_DATE_ESTIMATE',issue:'PAYMENT_DATE_MISSING'});
  assert.deepEqual(settlementPaymentDate({raw_data:{}}),{
    date:null,basis:null,issue:'SETTLEMENT_DATE_MISSING'
  });
});
