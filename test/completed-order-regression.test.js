'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const unified=require('../lib/orders/unified-orders.js');
const adapter=require('../lib/ui/phase28-adapters/orders.js');
function fixture(date='2026-09-20T00:00:00Z') {
 return {asOf:'2026-09-21T12:00:00Z',
 cafe24Orders:[{order_id:'C',order_date:date,raw_data:{tracking_no:'1234567890123'}}],
 cafe24OrderItems:[{order_id:'C',quantity:1,raw_data:{order_status:'N40'}}],
 coupangOrders:[{order_id:'P',shipment_box_id:'S',ordered_at:date,status:'FINAL_DELIVERY',raw_data:{invoiceNumber:'1234567890124'}}],
 naverOrders:[{order_id:'N',order_date:date,status:'PURCHASE_DECIDED'}]};
}
for(const state of [null,{status:'FAILED'},{status:'QUEUED'},{status:'SUCCESS',statusCode:'NOT_FOUND'},{status:'SUCCESS',statusCode:'IN_TRANSIT'}]) {
 test(`channel completion never reopens for tracking ${JSON.stringify(state)}`,()=>{
  const input=fixture();
  input.trackingStates=Object.fromEntries([['CAFE24','C'],['COUPANG','P','S'],['NAVER','N']].map(args=>[unified.hubOrderId(...args),state]));
  const result=unified.buildUnifiedOrders(input);
  assert.equal(result.orders.length,3);
  for(const row of result.orders){assert.equal(row.stage,'DELIVERED');assert.equal(row.shippingEligible,false);}
  const view=adapter.buildPhase28OrdersModel({unifiedOrders:result});
  assert.equal(view.workspaces.find(w=>w.id==='REGISTER').count,0);
  assert.equal(view.workspaces.find(w=>w.id==='COMPLETED').count,3);
  const page=adapter.buildOrderPage(result.orders,[],{stage:'COMPLETED'});
  for(const row of page.orders){assert.equal(row.listDeliveryBadge.status,'DELIVERED');assert.equal(row.listDeliveryBadge.source,'CHANNEL');}
 });
}
test('old channel completions stay outside active work and the 30 day display window',()=>{
 const result=unified.buildUnifiedOrders(fixture('2026-06-01T00:00:00Z'));
 assert.equal(result.orders.length,0);
 assert.equal(result.stageCounts.WAITING_FOR_CARRIER,0);
});
