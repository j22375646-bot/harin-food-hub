'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const {buildMainCashflow}=require('../lib/analytics/main-cashflow.js');

const baseInput=()=>({
  revenueTotals:{ALL:270_000,CAFE24:100_000,NAVER:70_000,COUPANG:100_000},
  ordersBySource:{
    CAFE24:[{order_id:'C-ORDER',payment_status:'PAID',paid_amount:100_000,raw_data:{market_id:'self'}}],
    NAVER:[{order_id:'N-ORDER',status:'PURCHASE_DECIDED',paid_amount:70_000}],
    COUPANG:[{order_id:'CP-ORDER',status:'FINAL_DELIVERY',gross_amount:40_000}],
    COUPANG_RG:[{order_id:'RG-ORDER',status:'FINAL_DELIVERY',total_amount:60_000}]
  },
  cafe24Items:[{order_id:'C-ORDER',external_product_no:'C-1',quantity:2,paid_amount:100_000}],
  naverItems:[{order_id:'N-ORDER',product_id:'N-1',quantity:1,paid_amount:70_000}],
  coupangItems:[{order_id:'CP-ORDER',seller_product_id:'CP-1',quantity:2,paid_amount:40_000}],
  coupangRgItems:[{order_id:'RG-ORDER',vendor_item_id:'V-1',quantity:3,amount:60_000}],
  coupangProductItems:[{vendor_item_id:'V-1',seller_product_id:'CP-1'}],
  channelProducts:[
    {platform:'CAFE24',external_product_id:'C-1',master_product_id:'M-C'},
    {platform:'NAVER',external_product_id:'N-1',master_product_id:'M-N'},
    {platform:'COUPANG',external_product_id:'CP-1',master_product_id:'M-CP'}
  ],
  productCosts:[
    {master_product_id:'M-C',unit_cost:8_000,packaging_cost:2_000,other_unit_cost:0},
    {master_product_id:'M-N',unit_cost:12_000,packaging_cost:3_000,other_unit_cost:0},
    {master_product_id:'M-CP',unit_cost:4_000,packaging_cost:1_000,other_unit_cost:0}
  ],
  channelCostSettings:[
    {platform:'CAFE24',commission_rate:.03,payment_fee_rate:.02,default_shipping_cost:3_000},
    {platform:'NAVER',commission_rate:.04,payment_fee_rate:.02,default_shipping_cost:3_500},
    {platform:'COUPANG',commission_rate:.1,payment_fee_rate:0,default_shipping_cost:1_000}
  ],
  channelShippingRules:[],
  naverAdRows:[{cost:10_000}],
  coupangAdRows:[{ad_spend:5_000}],
  availability:{orders:true,items:true,mappings:true,costs:true,settings:true,shipping:true,ads:true}
});

test('main cashflow automatically calculates every row from current-month evidence',()=>{
  const result=buildMainCashflow(baseInput());

  assert.equal(result.status,'READY');
  assert.equal(result.sales,270_000);
  assert.equal(result.productCost,60_000);
  assert.equal(result.shippingCost,8_500);
  assert.equal(result.platformFees,19_200);
  assert.equal(result.adSpend,15_000);
  assert.deepEqual(result.adSpendByPlatform,{ALL:15_000,NAVER:10_000,CAFE24:0,COUPANG:5_000});
  assert.equal(result.operatingCost,68_500);
  assert.equal(result.feesAndAds,34_200);
  assert.equal(result.profit,167_300);
  assert.equal(result.costCoverageRate,100);
  assert.match(result.description,/자동 계산/);
});

test('main cashflow keeps profit protected when product-cost coverage is below 95 percent',()=>{
  const input=baseInput();
  input.productCosts=input.productCosts.slice(0,1);
  const result=buildMainCashflow(input);

  assert.equal(result.status,'CHECK_REQUIRED');
  assert.equal(result.sales,270_000);
  assert.equal(result.operatingCost,null);
  assert.equal(result.feesAndAds,34_200);
  assert.equal(result.profit,null);
  assert.ok(result.costCoverageRate<95);
  assert.match(result.description,/원가 반영률/);
});

test('main cashflow never turns an unavailable ad source into a zero expense',()=>{
  const input=baseInput();
  input.availability.ads=false;
  const result=buildMainCashflow(input);

  assert.equal(result.adSpend,null);
  assert.equal(result.feesAndAds,19_200);
  assert.equal(result.feesAndAdsStatus,'PARTIAL');
  assert.equal(result.feesAndAdsLabel,'확인된 수수료');
  assert.equal(result.profit,null);
  assert.equal(result.status,'CHECK_REQUIRED');
});

test('main cashflow treats a zero-only product cost row as missing evidence',()=>{
  const input=baseInput();
  input.productCosts=input.productCosts.map(row=>row.master_product_id==='M-C'
    ?{...row,unit_cost:0,packaging_cost:0,other_unit_cost:0}
    :row);
  const result=buildMainCashflow(input);

  assert.equal(result.status,'CHECK_REQUIRED');
  assert.ok(result.costCoverageRate<100);
  assert.equal(result.productCost,null);
  assert.equal(result.profit,null);
});

test('main cashflow exposes measured ad spend without claiming placeholder fee settings are ready',()=>{
  const input=baseInput();
  input.channelCostSettings=input.channelCostSettings.map(row=>({
    ...row,commission_rate:0,payment_fee_rate:0,default_shipping_cost:0
  }));
  const result=buildMainCashflow(input);

  assert.equal(result.status,'CHECK_REQUIRED');
  assert.equal(result.platformFees,null);
  assert.equal(result.shippingCost,null);
  assert.equal(result.feesAndAds,15_000);
  assert.equal(result.feesAndAdsStatus,'PARTIAL');
  assert.equal(result.feesAndAdsLabel,'확인된 광고비');
  assert.equal(result.profit,null);
  assert.match(result.description,/수수료/);
});
