'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { buildUnifiedSettlementCenter } = require('../lib/settlement/unified-center.js');

const now = new Date('2026-08-14T03:00:00Z');

test('Cafe24 주문과 비용 설정으로 예상 정산액을 계산한다', () => {
  const center=buildUnifiedSettlementCenter({now,cafe24Orders:[
    {order_id:'C1',order_date:'2026-08-10T10:00:00+09:00',paid_amount:100000,cancel_amount:10000},
    {order_id:'C2',order_date:'2026-08-11T10:00:00+09:00',paid_amount:50000,cancel_amount:0}
  ],channelCostSettings:[{platform:'CAFE24',commission_rate:.05,payment_fee_rate:.03,default_shipping_cost:3000}]});
  const cafe=center.channels.find(item=>item.platform==='CAFE24');
  assert.equal(cafe.status,'ESTIMATED');
  assert.equal(cafe.gross_sales,150000);
  assert.equal(cafe.refunds,10000);
  assert.equal(cafe.fees,11200);
  assert.equal(cafe.logistics,6000);
  assert.equal(cafe.expected_payout,128800);
});

test('비용 설정이 없으면 Cafe24 예상 정산액을 0원으로 만들지 않는다', () => {
  const center=buildUnifiedSettlementCenter({now,cafe24Orders:[{order_id:'C1',order_date:'2026-08-10',paid_amount:100000}]});
  const cafe=center.channels.find(item=>item.platform==='CAFE24');
  assert.equal(cafe.status,'COST_REQUIRED');
  assert.equal(cafe.fees,null);
  assert.equal(cafe.expected_payout,null);
  assert.equal(center.summary.estimated_payout,null);
});

test('쿠팡 매출·환불·수수료와 확정 지급액을 분리한다', () => {
  const center=buildUnifiedSettlementCenter({now,coupangSettlements:[
    {order_id:'O1',recognition_date:'2026-08-10',sale_type:'SALE',sale_amount:100000,service_fee:10000,service_fee_vat:1000,settlement_amount:89000},
    {order_id:'O2',recognition_date:'2026-08-11',sale_type:'REFUND',sale_amount:20000,service_fee:-2000,service_fee_vat:-200,settlement_amount:-17800}
  ],coupangSettlementSummaries:[{settlement_date:'2026-08-13',final_amount:71200,status:'DONE'}]});
  const coupang=center.channels.find(item=>item.platform==='COUPANG');
  assert.equal(coupang.status,'ACTUAL');
  assert.equal(coupang.gross_sales,100000);
  assert.equal(coupang.refunds,20000);
  assert.equal(coupang.fees,8800);
  assert.equal(coupang.actual_payout,71200);
  assert.equal(center.summary.actual_payout,71200);
});

test('네이버 커머스 정산 자료가 없으면 0원이 아닌 자료 없음으로 표시한다', () => {
  const center=buildUnifiedSettlementCenter({now});
  const naver=center.channels.find(item=>item.platform==='NAVER');
  assert.equal(naver.status,'NO_DATA');
  assert.equal(naver.gross_sales,null);
  assert.match(naver.action,/커머스 수집을 다시 실행/);
});

test('네이버 커머스 정산완료 자료를 매출·수수료·입금액으로 표시한다', () => {
  const center=buildUnifiedSettlementCenter({now,
    naverOrders:[{order_id:'N1',payment_date:'2026-08-10T10:00:00+09:00'}],
    naverSettlements:[{
      settle_basis_end_date:'2026-08-10',settle_expect_date:'2026-08-12',settle_complete_date:'2026-08-13',
      pay_settle_amount:100000,commission_settle_amount:6000,settle_amount:94000
    }]
  });
  const naver=center.channels.find(item=>item.platform==='NAVER');
  assert.equal(naver.status,'ACTUAL');
  assert.equal(naver.gross_sales,100000);
  assert.equal(naver.fees,6000);
  assert.equal(naver.expected_payout,94000);
  assert.equal(naver.actual_payout,94000);
  assert.equal(naver.order_count,1);
  assert.equal(center.schedules.some(item=>item.platform==='NAVER'&&item.amount===94000),true);
});

test('채널 조회 실패는 저장된 0원 대신 자료 확인 필요로 격리한다', () => {
  const center=buildUnifiedSettlementCenter({now,unavailable:{CAFE24:true,COUPANG:true,NAVER:true}});
  assert.equal(center.summary.actual_payout,null);
  assert.equal(center.summary.estimated_payout,null);
  assert.equal(center.summary.check_required_channels,3);
  assert.ok(center.channels.every(item=>item.status==='UNAVAILABLE'));
});
