'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {buildMainCashflow}=require('../lib/analytics/main-cashflow.js');
const {calculateProfitability}=require('../lib/analytics/profitability.js');
const {buildUnifiedProductPerformance:buildPerformance}=require('../lib/products/performance.js');
const coverage={status:'SUCCESS',complete:true,source:'NAVER_COMMERCE',basis:'PAYMENT_DATE',period_start:'2026-08-01',period_end:'2026-09-07',collected_at:'2026-09-07T00:00:00Z'};
const buildUnifiedProductPerformance=input=>buildPerformance({naverCollectionEvidence:coverage,...input});
const {buildUnifiedSettlementCenter}=require('../lib/settlement/unified-center.js');
const {buildPhase28MainModel}=require('../lib/ui/phase28-adapters/main.js');
const now=new Date('2026-09-07T00:00:00Z');
test('FIN-07 UTC order and KST daily sales replace the same calendar day',()=>{
 const result=buildUnifiedSettlementCenter({now,cafe24Orders:[{order_date:'2026-09-04T16:00:00Z',paid_amount:100000}],cafe24SalesDaily:[{date:'2026-09-05',payment_amount:100000,refund_amount:0,sales_count:1}]});
 assert.equal(result.channels[0].gross_sales,100000);
 assert.equal(result.channels[0].order_count,1);
});
test('FIN-04 KST first-day payment remains in its product period',()=>{
 const result=buildUnifiedProductPerformance({masterProducts:[{id:'m'}],channelProducts:[{platform:'NAVER',external_product_id:'p',master_product_id:'m'}],periodStart:'2026-09-01',periodEnd:'2026-09-07',naverOrders:[{order_id:'n',payment_date:'2026-08-31T16:00:00Z'}],naverOrderItems:[{order_id:'n',product_id:'p',quantity:1,paid_amount:100000}]});
 assert.equal(result.summary.revenue,100000);
});
test('FIN-01 failed sales remain unknown while measured zero remains zero',()=>{
 assert.equal(buildMainCashflow({revenueTotals:{ALL:null}}).sales,null);
 assert.equal(buildMainCashflow({revenueTotals:{ALL:0}}).sales,0);
});
test('FIN-05 initial zero cost rows cannot establish profitability',()=>{
 const input={items:[{order_id:'a',external_product_no:'p',paid_amount:100000,quantity:1}],productLinks:[{external_product_id:'p',master_product_id:'m'}],productCosts:[{master_product_id:'m',unit_cost:0,packaging_cost:0,other_unit_cost:0}]};
 assert.equal(calculateProfitability(input).contribution_profit,null);
 assert.equal(calculateProfitability(input).cost_coverage_rate,0);
});
test('FIN-04 ad attribution does not create orders or sales',()=>{
 const result=buildUnifiedProductPerformance({masterProducts:[{id:'m'}],channelProducts:[{platform:'NAVER',external_product_id:'g',master_product_id:'m'}],periodStart:'2026-09-01',periodEnd:'2026-09-07',naverOrders:[],naverOrderItems:[],naverKeywords:[{ncc_keyword_id:'k',ncc_adgroup_id:'g'}],naverKeywordStats:[{ncc_keyword_id:'k',conversion_revenue:100000,conversions:2,cost:1000}]});
 assert.equal(result.summary.revenue,0);
 assert.equal(result.items[0].orders,0);
 assert.equal(result.items[0].channels.NAVER.attributed_revenue,100000);
});
test('FIN-03 mirrored marketplace orders excluded and official Naver Pay retained',()=>{
 const result=buildUnifiedSettlementCenter({now,cafe24Orders:[{order_date:'2026-09-05',paid_amount:100000,raw_data:{order_place_id:'NCHECKOUT'}},{order_date:'2026-09-05',paid_amount:200000,raw_data:{order_place_id:'NAVER'}}]});
 assert.equal(result.channels[0].gross_sales,100000);
});
test('FIN-02 unavailable channels remain in payout coverage denominator',()=>{
 const result=buildUnifiedSettlementCenter({now,unavailable:{CAFE24:true,NAVER:true},coupangSettlements:[{recognition_date:'2026-09-05',sale_amount:100000,settlement_amount:90000}]});
 assert.equal(result.waterfall.actual_payout_complete,false);
 assert.equal(result.waterfall.actual_payout_coverage,33.3);
 assert.equal(result.waterfall.gross_sales,null);
});
test('FIN-06 pending Naver payments do not become a shortfall',()=>{
 const result=buildUnifiedSettlementCenter({now,naverSettlements:[{settle_complete_date:'2026-09-03',pay_settle_amount:100000,settle_amount:90000},{settle_expect_date:'2026-09-06',pay_settle_amount:200000,settle_amount:180000}]});
 const naver=result.channels.find(row=>row.platform==='NAVER');
 assert.equal(naver.payout_variance,null);
 assert.equal(naver.pending_payout,180000);
 assert.equal(naver.payout_complete,false);
});
test('FIN-07 one daily API row cannot replace other days of orders or advertising',()=>{
 const result=buildUnifiedSettlementCenter({now,cafe24Orders:[{order_date:'2026-09-04',paid_amount:100000},{order_date:'2026-09-05',paid_amount:200000}],cafe24SalesDaily:[{date:'2026-09-04',payment_amount:110000,refund_amount:0,sales_count:1}],naverAdStats:[{date:'2026-09-04',cost:100},{date:'2026-09-05',cost:200}],naverBizmoneyDaily:[{date:'2026-09-04',used_purchased:110,used_free:0}]});
 assert.equal(result.channels[0].gross_sales,310000);
 assert.equal(result.channels.find(row=>row.platform==='NAVER').advertising,310);
});
test('FIN-08 platform payout and post operating cost amount have separate formulas',()=>{
 const result=buildUnifiedSettlementCenter({now,cafe24Orders:[{order_date:'2026-09-05',paid_amount:100000}],channelCostSettings:[{platform:'CAFE24',commission_rate:.1,payment_fee_rate:0,default_shipping_cost:3000}]});
 assert.equal(result.channels[0].expected_payout,90000);
 assert.equal(result.channels[0].after_operating_costs,87000);
 assert.equal(result.waterfall.payout_basis,'CHANNEL_SPECIFIC');
});
test('FIN-01 main adapter preserves an explicitly failed cashflow amount',()=>{
 const result=buildPhase28MainModel({mainCashflow:{sales:null,profit:null},liveProfitability:{revenue:0,contribution_profit:100}});
 assert.equal(result.cashflow.rows.find(row=>row.key==='sales').value,null);
 assert.equal(result.cashflow.rows.find(row=>row.key==='profit').value,null);
});
test('FIN-06 future payout for current recognition period remains pending',()=>{
 const result=buildUnifiedSettlementCenter({now,naverSettlements:[{settle_basis_end_date:'2026-09-05',settle_expect_date:'2026-09-10',pay_settle_amount:200000,settle_amount:180000}]});
 assert.equal(result.channels.find(row=>row.platform==='NAVER').pending_payout,180000);
});
test('FIN-04 commerce items supply Naver sales independently of advertising',()=>{
 const result=buildUnifiedProductPerformance({masterProducts:[{id:'m'}],channelProducts:[{platform:'NAVER',external_product_id:'p',master_product_id:'m'}],periodStart:'2026-09-01',periodEnd:'2026-09-07',naverOrders:[{order_id:'n',order_date:'2026-09-05',status:'PAYED'}],naverOrderItems:[{order_id:'n',product_id:'p',quantity:2,paid_amount:20000}]});
 assert.equal(result.summary.revenue,20000);
 assert.equal(result.items[0].channels.NAVER.orders,1);
});
test('FIN-04 missing commerce differs from successfully collected zero orders',()=>{
 const input={masterProducts:[{id:'m'}],channelProducts:[{platform:'NAVER',external_product_id:'p',master_product_id:'m'}],periodStart:'2026-09-01',periodEnd:'2026-09-07'};
 assert.equal(buildUnifiedProductPerformance(input).summary.revenue,null);
 assert.equal(buildUnifiedProductPerformance({...input,naverOrders:[],naverOrderItems:[]}).summary.revenue,0);
});
test('FIN-03/04 storefront and official checkout plus commerce count each source once',()=>{
 const result=buildUnifiedProductPerformance({masterProducts:[{id:'m'}],channelProducts:[{platform:'CAFE24',external_product_id:'c',master_product_id:'m'},{platform:'NAVER',external_product_id:'p',master_product_id:'m'}],periodStart:'2026-09-01',periodEnd:'2026-09-07',cafe24Orders:[{order_id:'own',order_date:'2026-09-05',raw_data:{order_place_id:'NCHECKOUT'}},{order_id:'mirror',order_date:'2026-09-05',raw_data:{order_place_id:'NAVER'}}],cafe24OrderItems:[{order_id:'own',external_product_no:'c',quantity:1,paid_amount:100000},{order_id:'mirror',external_product_no:'c',quantity:1,paid_amount:200000}],naverOrders:[{order_id:'n',order_date:'2026-09-05'}],naverOrderItems:[{product_order_id:'i',order_id:'n',product_id:'p',quantity:2,paid_amount:200000},{product_order_id:'i',order_id:'n',product_id:'p',quantity:2,paid_amount:200000},{product_order_id:'cancel',order_id:'n',product_id:'p',quantity:1,paid_amount:50000,status:'CANCELED'}]});
 assert.equal(result.summary.revenue,300000);
 assert.equal(result.items[0].units,3);
});
test('FIN-05 explicit evidence is required to accept genuinely free product costs',()=>{
 const input={items:[{order_id:'a',external_product_no:'p',paid_amount:100000,quantity:1}],productLinks:[{external_product_id:'p',master_product_id:'m'}],productCosts:[{master_product_id:'m',unit_cost:0,packaging_cost:0,other_unit_cost:0,zero_cost_confirmed:true,zero_cost_confirmed_at:'2026-09-01',zero_cost_evidence:'owner verified complimentary stock'}]};
 assert.equal(calculateProfitability(input).cost_coverage_rate,100);
});
test('FIN-04 orders with missing item detail cannot claim zero sales',()=>{
 const result=buildUnifiedProductPerformance({masterProducts:[{id:'m'}],channelProducts:[{platform:'NAVER',external_product_id:'p',master_product_id:'m'}],periodStart:'2026-09-01',periodEnd:'2026-09-07',naverOrders:[{order_id:'n',order_date:'2026-09-05'}],naverOrderItems:[]});
 assert.equal(result.summary.revenue,null);
});
