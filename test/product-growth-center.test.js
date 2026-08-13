'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const growthCenter = require('../lib/products/growth-center.js');

test('구성별 실제 이익에 원가·수수료·배송·사은품·광고비를 모두 반영한다', () => {
  const calculation = growthCenter.calculateOfferProfit({
    offer:{ quantity:2, list_price:32000, sale_price:30000, customer_shipping_revenue:0, gift_cost:1000, extra_packaging_cost:500, ad_cost_per_order:5000 },
    productCost:{ unit_cost:5000, packaging_cost:500, other_unit_cost:0 },
    channelSetting:{ commission_rate:0.02, payment_fee_rate:0.01, default_shipping_cost:3000 },
    shippingRule:{ return_shipping_cost:5000, return_rate:0.1, remote_area_surcharge:5000, remote_area_rate:0.02 }
  });
  assert.equal(calculation.status, 'SAFE');
  assert.equal(calculation.product_cost, 11000);
  assert.equal(calculation.fees, 900);
  assert.equal(calculation.shipping_cost, 3000);
  assert.equal(calculation.expected_shipping_loss, 600);
  assert.equal(calculation.actual_profit, 8000);
  assert.equal(calculation.maximum_additional_discount, 8000);
  assert.equal(calculation.break_even_ad_cost, 13000);
  assert.equal(calculation.margin_rate, 26.7);
});

test('원가가 없으면 이익을 0원으로 단정하지 않고 확인 필요로 반환한다', () => {
  const calculation = growthCenter.calculateOfferProfit({
    offer:{ quantity:1, list_price:15000, sale_price:15000 },
    productCost:null,
    channelSetting:{ commission_rate:0.03, payment_fee_rate:0, default_shipping_cost:3000 },
    shippingRule:null
  });
  assert.equal(calculation.status, 'CHECK_REQUIRED');
  assert.equal(calculation.actual_profit, null);
  assert.equal(calculation.margin_rate, null);
  assert.match(calculation.warnings[0], /원가/);
});

test('저장된 구성이 없으면 1개·2개·묶음 제안을 만들고 작수차 티백을 첫 시범상품으로 고른다', () => {
  const result = growthCenter.buildGrowthCenter({
    masterProducts:[
      { id:'11111111-1111-4111-8111-111111111111', name:'일반 상품', selling_price:10000, is_active:true },
      { id:'22222222-2222-4222-8222-222222222222', name:'하린 작수차 36g (1.2g x 30TB)', selling_price:12000, is_active:true }
    ],
    productCosts:[],
    channelSettings:[{ platform:'CAFE24', commission_rate:0.03, payment_fee_rate:0, default_shipping_cost:3000 }],
    shippingRules:[{ platform:'CAFE24', return_shipping_cost:0, return_rate:0, remote_area_surcharge:0, remote_area_rate:0 }]
  });
  assert.equal(result.pilot_product_id, '22222222-2222-4222-8222-222222222222');
  assert.deepEqual(result.items[0].offers.map(item => item.offer_type), ['SINGLE','DOUBLE','BUNDLE']);
  assert.equal(result.items[0].offers[0].calculation.status, 'CHECK_REQUIRED');
});
