'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const performance = require('../lib/products/performance.js');

test('확정 매핑을 기준으로 Cafe24·네이버·쿠팡 성과를 한 상품에 합친다', () => {
  const result = performance.buildUnifiedProductPerformance({
    periodStart:'2026-08-01',periodEnd:'2026-08-07',
    masterProducts:[{id:'M1',name:'돼지감자차 36g(1.2gX30TB)'}],
    channelProducts:[
      {platform:'CAFE24',external_product_id:'P1',master_product_id:'M1'},
      {platform:'NAVER',external_product_id:'G1',master_product_id:'M1'},
      {platform:'COUPANG',external_product_id:'C1',master_product_id:'M1'}
    ],
    cafe24Orders:[{order_id:'O1',order_date:'2026-08-02'}],
    cafe24OrderItems:[{order_id:'O1',external_product_no:'P1',quantity:2,paid_amount:22000}],
    naverKeywords:[{ncc_keyword_id:'K1',ncc_adgroup_id:'G1'}],
    naverKeywordStats:[{ncc_keyword_id:'K1',cost:1000,conversions:1,conversion_revenue:11000}],
    coupangOrders:[{order_id:'O2',paid_at:'2026-08-03'}],
    coupangOrderItems:[{order_id:'O2',seller_product_id:'C1',quantity:1,paid_amount:11000}],
    productCosts:[{master_product_id:'M1',unit_cost:3000,packaging_cost:500,other_unit_cost:0}],
    channelCostSettings:[]
  });
  const item = result.items[0];
  assert.equal(item.revenue, 44000);
  assert.equal(item.ad_spend, 1000);
  assert.equal(item.units, 4);
  assert.equal(item.contribution_profit, 29000);
  assert.equal(item.channels.CAFE24.revenue, 22000);
  assert.equal(item.channels.NAVER.revenue, 11000);
  assert.equal(item.channels.COUPANG.revenue, 11000);
});

test('매핑되지 않은 상품과 기간 밖 주문은 통합 성과에서 제외한다', () => {
  const result = performance.buildUnifiedProductPerformance({
    periodStart:'2026-08-01',periodEnd:'2026-08-07',
    masterProducts:[{id:'M1',name:'국화차'}],channelProducts:[],
    cafe24Orders:[{order_id:'OLD',order_date:'2026-07-01'}],
    cafe24OrderItems:[{order_id:'OLD',external_product_no:'P1',quantity:1,paid_amount:12000}]
  });
  assert.equal(result.items.length, 0);
  assert.equal(result.summary.revenue, 0);
});

test('플랫폼별 반품·도서산간 충당비를 통합 상품 공헌이익에 반영한다', () => {
  const result = performance.buildUnifiedProductPerformance({
    periodStart:'2026-08-01',periodEnd:'2026-08-07',
    masterProducts:[{id:'M1',name:'국화차'}],
    channelProducts:[{platform:'CAFE24',external_product_id:'P1',master_product_id:'M1'}],
    cafe24Orders:[{order_id:'O1',order_date:'2026-08-02'}],
    cafe24OrderItems:[{order_id:'O1',external_product_no:'P1',quantity:1,paid_amount:10000}],
    productCosts:[{master_product_id:'M1',unit_cost:3000}],
    channelCostSettings:[{platform:'CAFE24',default_shipping_cost:3000}],
    channelShippingRules:[{platform:'CAFE24',return_shipping_cost:5000,return_rate:.1,remote_area_surcharge:4000,remote_area_rate:.05}]
  });
  const channel = result.items[0].channels.CAFE24;
  assert.equal(channel.return_reserve,500);
  assert.equal(channel.remote_area_reserve,200);
  assert.equal(channel.fees,3700);
  assert.equal(result.items[0].contribution_profit,3300);
  assert.equal(result.summary.return_reserve,500);
  assert.equal(result.summary.remote_area_reserve,200);
});

test('미귀속 쿠팡 광고비가 있으면 상품 ROAS와 공헌이익을 미산정 처리한다', () => {
  const result = performance.buildUnifiedProductPerformance({
    periodStart:'2026-08-01',periodEnd:'2026-08-07',
    masterProducts:[{id:'M1',name:'국화차'}],
    channelProducts:[{platform:'CAFE24',external_product_id:'P1',master_product_id:'M1'}],
    cafe24Orders:[{order_id:'O1',order_date:'2026-08-02'}],
    cafe24OrderItems:[{order_id:'O1',external_product_no:'P1',quantity:1,paid_amount:10000}],
    productCosts:[{master_product_id:'M1',unit_cost:3000}],
    coupangAdKeywords:[{keyword:'완전히 다른 상품',ad_spend:5000}]
  });
  assert.equal(result.financial_trust.status,'BLOCKED');
  assert.equal(result.summary.contribution_profit,null);
  assert.equal(result.items[0].contribution_profit,null);
  assert.equal(result.items[0].roas,null);
});
