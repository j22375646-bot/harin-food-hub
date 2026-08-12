'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const shippingRules = require('../lib/analytics/shipping-rules.js');

test('주문수와 발생률로 반품·도서산간 기대비용을 계산한다', () => {
  const result = shippingRules.calculateShippingReserve({
    orders:100,
    rule:{ return_shipping_cost:5000, return_rate:.08, remote_area_surcharge:4000, remote_area_rate:.03 }
  });
  assert.equal(result.return_reserve,40000);
  assert.equal(result.remote_area_reserve,12000);
  assert.equal(result.total_reserve,52000);
  assert.equal(result.reserve_per_order,520);
});

test('잘못된 음수와 100% 초과 비율은 안전 범위로 정규화한다', () => {
  const rule = shippingRules.normalizeShippingRule({ return_shipping_cost:-1, return_rate:3, remote_area_surcharge:-5, remote_area_rate:-1 });
  assert.equal(rule.return_shipping_cost,0);
  assert.equal(rule.return_rate,1);
  assert.equal(rule.remote_area_surcharge,0);
  assert.equal(rule.remote_area_rate,0);
});

test('숫자가 아닌 입력과 환급 초과 비용은 0으로 안전하게 처리한다', () => {
  const result=shippingRules.calculateShippingReserve({orders:'invalid',rule:{return_shipping_cost:'invalid',return_rate:'invalid'}});
  const evidence=shippingRules.buildCoupangShippingEvidence({costTransactions:[{source_type:'RETURN_PICKUP',order_id:'O1',cost_amount:1000,credit_amount:2000}]});
  assert.deepEqual(result,{orders:0,return_reserve:0,remote_area_reserve:0,total_reserve:0,reserve_per_order:0});
  assert.equal(evidence.actual_return_cost,0);
  assert.equal(evidence.actual_return_cost_per_case,null);
});

test('쿠팡 증빙은 주소 없이 비용 집계만 반환하고 작은 표본은 낮은 신뢰도로 둔다', () => {
  const result = shippingRules.buildCoupangShippingEvidence({
    returns:[{receipt_id:'R1',order_id:'O1'}],
    costTransactions:[
      {source_type:'RETURN_PICKUP',order_id:'O1',cost_amount:3000,cost_vat:300},
      {source_type:'SHIPPING',order_id:'O2',cost_amount:2000,raw_data:{additional_cost:4000}},
      {source_type:'SHIPPING',order_id:'O3',cost_amount:2000,raw_data:{}}
    ]
  });
  assert.equal(result.return_cases,1);
  assert.equal(result.actual_return_cost,3300);
  assert.equal(result.actual_return_cost_per_case,3300);
  assert.equal(result.remote_orders,1);
  assert.equal(result.actual_remote_cost,4000);
  assert.equal(result.observed_remote_rate,50);
  assert.equal(result.return_confidence,'LOW');
  assert.equal(result.remote_confidence,'LOW');
  assert.equal(result.privacy_basis,'AGGREGATED_COST_ONLY');
});
