'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const insights=require('../lib/market-intelligence/naver-commerce-orders.js');

const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');

test('18-4 keeps missing commerce economics nullable instead of fabricating zero',()=>{
  const row=insights.normalizeProductOrderEconomics({order_id:'O1',product_order_id:'P1',quantity:1,raw_data:{productId:'N1',inflowPath:'SA',productDiscountAmount:1800,sellerBurdenDiscountAmount:800,paymentCommission:300,channelCommission:200,expectedSettlementAmount:8700}},{payment_date:'2026-08-17T10:00:00+09:00'});
  assert.equal(row.other_discount_amount,1000);
  assert.equal(row.fee_amount,500);
  assert.equal(row.sale_commission,null);
  assert.equal(row.paid_amount,null);
});

test('18-4 isolates rows by the selected product mapping and returns aggregate-only data',()=>{
  const data=insights.buildOrderInsight({
    project:{master_product_id:'M1',product_snapshot:{name:'작두콩차'}},product:{id:'M1',name:'작두콩차'},now:new Date('2026-08-18T00:00:00Z'),periodDays:30,
    links:[{platform:'NAVER',external_product_id:'N1',raw_data:{source_type:'NAVER_COMMERCE_PRODUCT'}}],
    orders:[{order_id:'O1',payment_date:'2026-08-17T01:00:00Z'},{order_id:'O2',payment_date:'2026-08-17T02:00:00Z'}],
    items:[
      {order_id:'O1',product_order_id:'PO1',product_id:'N1',quantity:2,paid_amount:20000,raw_data:{inflowPath:'SA',totalProductAmount:22000,productDiscountAmount:2000,sellerBurdenDiscountAmount:1000,paymentCommission:300,saleCommission:100,channelCommission:100,expectedSettlementAmount:18500}},
      {order_id:'O2',product_order_id:'PO2',product_id:'OTHER',quantity:99,paid_amount:999999,raw_data:{inflowPath:'BAND',expectedSettlementAmount:900000}}
    ]
  });
  assert.equal(data.data_status,'READY');
  assert.equal(data.summary.order_count,1);
  assert.equal(data.summary.units,2);
  assert.equal(data.totals.paid_amount.value,20000);
  assert.equal(data.inflows[0].label,'검색광고(SA)');
  const serialized=JSON.stringify(data);
  assert.doesNotMatch(serialized,/PO1|O1|receiver|phone|address/i);
  assert.equal(data.contains_pii,false);
});

test('18-4 reports partial coverage and mapping requirements honestly',()=>{
  const base={project:{master_product_id:'M1',product_snapshot:{name:'차'}},product:{id:'M1',name:'차'},now:new Date('2026-08-18T00:00:00Z')};
  assert.equal(insights.buildOrderInsight(base).data_status,'MAPPING_REQUIRED');
  const partial=insights.buildOrderInsight({...base,links:[{platform:'NAVER',external_product_id:'N1',raw_data:{source_type:'NAVER_COMMERCE_PRODUCT'}}],orders:[{order_id:'O1',payment_date:'2026-08-17T01:00:00Z'}],items:[{order_id:'O1',product_order_id:'P1',product_id:'N1',paid_amount:10000,raw_data:{}}]});
  assert.equal(partial.data_status,'PARTIAL');
  assert.equal(partial.totals.expected_settlement_amount.value,null);
  assert.deepEqual(partial.coverage.settlement,{known:0,total:1});
});

test('18-4 route is owner protected and the market page keeps page AI separate',()=>{
  const route=read('app/api/market-intelligence/projects/[projectId]/naver-commerce-orders/route.js');
  assert.match(route,/apiSafety\.isAuthorized\(request,authModule\)/);
  assert.match(route,/validPeriod/);
  const workspace=read('app/market-intelligence/[projectId]/workspace-page.js');
  assert.match(workspace,/MarketNaverCommerceOrders/);
  assert.match(workspace,/MarketPageAi/);
  const client=read('app/market-intelligence/[projectId]/market/naver-commerce-orders-client.js');
  assert.match(client,/개인정보 없이/);
  assert.match(client,/0원 대신 확인 필요/);
  assert.doesNotMatch(client,/receiver_name|receiver_phone|order_id/);
  const mapping=read('lib/products/mapping-service.js');
  assert.match(mapping,/NAVER_COMMERCE_PRODUCT/);
  assert.match(mapping,/requestedPlatform/);
  const dashboard=read('app/dashboard-client.js');
  assert.match(dashboard,/mappingPlatformTabs/);
  assert.match(dashboard,/네이버 광고그룹은 계속 제외/);
});

test('18-4 has V8 pastel flow, table and mobile touch sizing',()=>{
  const css=read('app/_analysis/harin-market-intelligence.css');
  assert.match(css,/Phase 18-4/);
  assert.match(css,/\.marketCommerceFlowRail/);
  assert.match(css,/\.marketCommerceInflowTable/);
  assert.match(css,/@media\(max-width:700px\)/);
  assert.match(css,/marketNaverCommerceWorkbench button[^}]+min-height:48px/);
});
