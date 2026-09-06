'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {buildUnifiedSettlementCenter:build}=require('../lib/settlement/unified-center.js');
const now=new Date('2026-08-15T14:59:59.999Z');
const center=extra=>build({now,periodDays:2,...extra});
const channel=(result,family)=>result.channels.find(row=>row.platform===family);
const line=(family,extra={})=>({delivery_family:family,settlement_key:`${family}:O:V`,order_id:'O',vendor_item_id:'V',recognition_date:'2026-08-14',sale_type:'SALE',sale_amount:100000,service_fee:9000,service_fee_vat:1000,settlement_amount:90000,...extra});
const payout=(family,extra={})=>({delivery_family:family,summary_key:`${family}:PAY`,period_start:'2026-08-14',period_end:'2026-08-15',settlement_date:'2026-08-20',status:'DONE',final_amount:85000,...extra});

test('typed seller and RG payout ledgers remain independent despite identical order IDs',()=>{
 const result=center({coupangSettlements:[line('COUPANG'),line('ROCKET_GROWTH',{sale_amount:200000})],coupangSettlementSummaries:[payout('COUPANG'),payout('ROCKET_GROWTH',{final_amount:170000})]});
 assert.equal(channel(result,'COUPANG').gross_sales,100000);
 assert.equal(channel(result,'COUPANG_RG').gross_sales,200000);
 assert.equal(channel(result,'COUPANG').actual_payout,85000);
 assert.equal(channel(result,'COUPANG_RG').actual_payout,170000);
 assert.equal(result.waterfall.actual_payout,255000);
 assert.equal(result.schedules.find(row=>row.amount===170000).platform,'COUPANG_RG');
});

test('unclassified API ledgers never become seller revenue or payout by default',()=>{
 const result=center({coupangSettlements:[line('UNKNOWN')],coupangSettlementSummaries:[payout('UNKNOWN')]});
 assert.equal(channel(result,'COUPANG').gross_sales,null);
 assert.equal(channel(result,'COUPANG').actual_payout,null);
 assert.equal(result.ledger_diagnostics.unclassified_settlements,1);
 assert.equal(result.ledger_diagnostics.unclassified_payouts,1);
 assert.match(channel(result,'COUPANG').action,/배송유형/);
});

test('SUBJECT final amount is scheduled, never received, and partial payments are not shortages',()=>{
 const result=center({coupangSettlements:[line('ROCKET_GROWTH')],coupangSettlementSummaries:[payout('ROCKET_GROWTH',{summary_key:'done',final_amount:60000}),payout('ROCKET_GROWTH',{summary_key:'pending',status:'SUBJECT',final_amount:25000})]});
 const rg=channel(result,'COUPANG_RG');
 assert.ok(rg,'typed RG evidence creates its channel');
 assert.equal(rg.actual_payout,60000);
 assert.equal(rg.pending_payout,25000);
 assert.equal(rg.payout_complete,false);
 assert.equal(rg.payout_variance,null);
});

test('recognition period scopes payouts, not deposit date or sale-row expected amount',()=>{
 const result=center({coupangSettlements:[line('COUPANG')],coupangSettlementSummaries:[payout('COUPANG',{period_start:'2026-07-01',period_end:'2026-07-31',settlement_date:'2026-08-14'})]});
 assert.equal(channel(result,'COUPANG').actual_payout,null);
 assert.equal(channel(center({coupangSettlements:[line('COUPANG')]}),'COUPANG').actual_payout,null);
});

test('missing payout period and missing final amount stay unknown, explicit completed zero remains zero',()=>{
 assert.equal(channel(center({coupangSettlementSummaries:[payout('COUPANG',{period_start:null})]}),'COUPANG').actual_payout,null);
 assert.equal(channel(center({coupangSettlementSummaries:[payout('COUPANG',{final_amount:null})]}),'COUPANG').actual_payout,null);
 assert.equal(channel(center({coupangSettlementSummaries:[payout('COUPANG',{final_amount:0})]}),'COUPANG').actual_payout,0);
});

test('null fee or logistics line poisons only complete component, not zero',()=>{
 const result=center({coupangSettlements:[line('ROCKET_GROWTH',{service_fee:null})],coupangCostTransactions:[{delivery_family:'ROCKET_GROWTH',source_type:'STORAGE',event_date:'2026-08-14',cost_amount:null,cost_vat:0,credit_amount:0}],coupangAdSettlements:[{delivery_type:'ROCKETGROWTH',row_type:'DELIVERY_SUMMARY',date:'2026-08-14',billed_amount:0}]});
 const rg=channel(result,'COUPANG_RG');
 assert.ok(rg);
 assert.equal(rg.fees,null);
 assert.equal(rg.logistics,null);
 assert.equal(rg.expected_payout,null);
});

test('all order lines must be matched; one of two vendor items cannot certify an order',()=>{
 const result=center({coupangRgOrders:[{order_id:'O',paid_at:'2026-08-14',total_amount:200000}],coupangRgOrderItems:[{order_id:'O',vendor_item_id:'V',amount:100000},{order_id:'O',vendor_item_id:'V2',amount:100000}],coupangSettlements:[line('ROCKET_GROWTH')],coupangCostTransactions:[{delivery_family:'ROCKET_GROWTH',source_type:'STORAGE',event_date:'2026-08-14',cost_amount:0,cost_vat:0,credit_amount:0}],coupangAdSettlements:[{delivery_type:'ROCKETGROWTH',row_type:'DELIVERY_SUMMARY',date:'2026-08-14',billed_amount:0}]});
 const rg=channel(result,'COUPANG_RG');
 assert.equal(rg.settlement_coverage,50);
 assert.equal(rg.expected_payout,null);
});

test('date-only recognition rows on first KST calendar day are included',()=>{
 const result=build({now:new Date('2026-08-15T03:00:00Z'),periodDays:2,coupangSettlements:[line('COUPANG',{recognition_date:'2026-08-14'})]});
 assert.equal(channel(result,'COUPANG').gross_sales,100000);
});

test('date-only amounts for the current KST day are visible before 09:00',()=>{
 const result=build({now:new Date('2026-08-14T16:00:00Z'),periodDays:2,coupangSettlements:[line('COUPANG',{recognition_date:'2026-08-15'})]});
 assert.equal(channel(result,'COUPANG').gross_sales,100000);
});

test('Cafe24 quoted unpaid orders are excluded while paid Naver Pay cancellation preserves gross and refund',()=>{
 const result=center({cafe24Orders:[
  {order_id:'unpaid',order_date:'2026-08-14',payment_status:'F',paid_amount:null,order_price:50000,raw_data:{paid:'F'}},
  {order_id:'paid',order_date:'2026-08-14',paid_amount:30000,cancel_amount:30000,raw_data:{paid:'T',order_status:'C40',order_place_id:'NCHECKOUT'}},
  {order_id:'mirror',order_date:'2026-08-14',paid_amount:70000,raw_data:{paid:'T',order_place_id:'NAVER'}}
 ]});
 const cafe=channel(result,'CAFE24');
 assert.equal(cafe.gross_sales,30000);
 assert.equal(cafe.refunds,30000);
 assert.equal(cafe.order_count,1);
 assert.equal(cafe.actual_payout,null);
 assert.equal(cafe.sales_evidence.coverage.estimated_days,1);
 assert.equal(cafe.sales_evidence.coverage.missing_days,1);
});

test('Cafe24 missing days and uncertain legacy payment evidence cannot certify a complete API period',()=>{
 const result=center({cafe24Orders:[{order_date:'2026-08-14',paid_amount:20000}],cafe24SalesDaily:[
  {date:'2026-08-14',source_status:'ERROR',payment_amount:99999,refund_amount:0,sales_count:1}
 ]});
 const cafe=channel(result,'CAFE24');
 assert.equal(cafe.gross_sales,20000);
 assert.equal(cafe.refunds,null);
 assert.equal(cafe.sales_api_complete,false);
 assert.equal(cafe.sales_evidence.coverage.api_days,0);
 assert.equal(cafe.sales_evidence.coverage.uncertain_days,1);
});

test('Cafe24 generic forbidden evidence does not assert developer approval is the cause',()=>{
 const result=center({cafe24Token:{access_token:'test',scopes:['mall.read_salesreport']},syncs:[{platform:'CAFE24',job_type:'FETCH_ALL',metadata:{capabilities:{settlement:'VERIFY_REQUIRED'},errors:[{dataset:'salesDaily',status:403,code:'VERIFY_REQUIRED',evidence:{http_status:403,error_message:'Forbidden'}}]}}]});
 assert.equal(channel(result,'CAFE24').status,'VERIFY_REQUIRED');
 assert.match(channel(result,'CAFE24').action,/앱 설치/);
});

test('mixed delivery labels and incomplete advertising amount never become confirmed components',()=>{
 const mixed=center({coupangAdSettlements:[{delivery_type:'SELLER/ROCKETGROWTH',date:'2026-08-14',row_type:'DELIVERY_SUMMARY',billed_amount:1000}]});
 assert.equal(mixed.ledger_diagnostics.unclassified_advertising,1);
 const result=center({coupangSettlements:[line('ROCKET_GROWTH')],coupangCostTransactions:[{delivery_family:'ROCKET_GROWTH',source_type:'ADVERTISING',event_date:'2026-08-14',cost_amount:null,cost_vat:100,credit_amount:0}]});
 assert.equal(channel(result,'COUPANG_RG').advertising,null);
});

test('Cafe24 delayed payment is replaced on payment day, never counted on both order and payment dates',()=>{
 const result=center({cafe24Orders:[{order_date:'2026-08-14',paid_amount:10000,cancel_amount:0,raw_data:{paid:'T',payment_date:'2026-08-15T01:00:00+09:00'}}],cafe24SalesDaily:[{date:'2026-08-15',source_status:'OK',payment_amount:10000,refund_amount:0,sales_count:1}]});
 assert.equal(channel(result,'CAFE24').gross_sales,10000);
 assert.equal(channel(result,'CAFE24').order_count,1);
 assert.equal(channel(result,'CAFE24').sales_evidence.days[0].payment_amount,null);
});

test('seller incomplete explicit operating costs cannot produce a payout variance',()=>{
 for(const source_type of ['STORAGE','ADVERTISING']){
  const result=center({coupangSettlements:[line('COUPANG')],coupangSettlementSummaries:[payout('COUPANG',{final_amount:90000,provenance:{coverage:'COMPLETE'}})],coupangCostTransactions:[{delivery_family:'COUPANG',source_type,event_date:'2026-08-14',cost_amount:null,cost_vat:0,credit_amount:0}]});
  assert.equal(channel(result,'COUPANG').expected_payout,null);
  assert.equal(channel(result,'COUPANG').payout_variance,null);
 }
});

test('RG declared item count cannot be certified by a truncated saved item list',()=>{
 const result=center({coupangRgOrders:[{order_id:'O',paid_at:'2026-08-14',total_amount:200000,item_count:2}],coupangRgOrderItems:[{order_id:'O',vendor_item_id:'V',amount:100000}],coupangSettlements:[line('ROCKET_GROWTH')],coupangCostTransactions:[{delivery_family:'ROCKET_GROWTH',source_type:'STORAGE',event_date:'2026-08-14',cost_amount:0,cost_vat:0,credit_amount:0}],coupangAdSettlements:[{delivery_type:'ROCKETGROWTH',row_type:'DELIVERY_SUMMARY',date:'2026-08-14',billed_amount:0}]});
 assert.equal(channel(result,'COUPANG_RG').settlement_coverage,50);
 assert.equal(channel(result,'COUPANG_RG').expected_payout,null);
});
