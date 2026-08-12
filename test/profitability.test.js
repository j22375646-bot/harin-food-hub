'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { calculateProfitability } = require('../lib/analytics/profitability.js');

test('calculates contribution profit and break-even ROAS on the server', () => {
  const result = calculateProfitability({
    items:[{order_id:'O1',external_product_no:'10',product_name:'차',quantity:2,paid_amount:20000}],
    productLinks:[{external_product_id:'10',master_product_id:'M1'}],
    productCosts:[{master_product_id:'M1',unit_cost:3000,packaging_cost:500,other_unit_cost:0}],
    channelSetting:{commission_rate:0.05,payment_fee_rate:0.03,default_shipping_cost:3000}, adSpend:4000
  });
  assert.equal(result.product_cost,7000);
  assert.equal(result.fees,1600);
  assert.equal(result.shipping_cost,3000);
  assert.equal(result.contribution_before_ads,8400);
  assert.equal(result.contribution_profit,4400);
  assert.equal(result.break_even_roas,238.1);
  assert.equal(result.cost_status,'COMPLETE');
});

test('marks incomplete product cost coverage without inventing zero-cost confidence', () => {
  const result = calculateProfitability({items:[{order_id:'O1',external_product_no:'missing',product_name:'미설정',quantity:1,paid_amount:10000}]});
  assert.equal(result.cost_status,'COST_DATA_REQUIRED');
  assert.equal(result.cost_coverage_rate,0);
  assert.equal(result.contribution_profit,null);
  assert.equal(result.break_even_roas,null);
  assert.equal(result.missing_cost_products,1);
  assert.equal(result.missing_cost_revenue,10000);
  assert.equal(result.products[0].cost_configured,false);
  assert.equal(result.products[0].contribution_before_ads,null);
});

test('adds expected return and remote-area reserves without storing customer addresses', () => {
  const result = calculateProfitability({
    items:[{order_id:'O1',external_product_no:'10',product_name:'차',quantity:1,paid_amount:10000}],
    productLinks:[{external_product_id:'10',master_product_id:'M1'}],
    productCosts:[{master_product_id:'M1',unit_cost:3000,packaging_cost:0,other_unit_cost:0}],
    channelSetting:{default_shipping_cost:3000},
    shippingRule:{return_shipping_cost:5000,return_rate:.1,remote_area_surcharge:4000,remote_area_rate:.05}
  });
  assert.equal(result.base_shipping_cost,3000);
  assert.equal(result.return_reserve,500);
  assert.equal(result.remote_area_reserve,200);
  assert.equal(result.shipping_cost,3700);
  assert.equal(result.contribution_before_ads,3300);
});
