'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const orders=require('../lib/orders/unified-orders');
const adapter=require('../lib/ui/phase28-adapters/orders');
test('Coupang confirmed movement survives missing or earlier postal tracking, but invoice upload alone stays waiting',()=>{
 for(const status of ['DEPARTURE','DELIVERING','FINAL_DELIVERY'])for(const code of [null,'NOT_FOUND','ACCEPTED']){
  const id=orders.hubOrderId('COUPANG','CP-MOVE','123');
  const center=orders.buildUnifiedOrders({asOf:'2026-09-29T05:00:00Z',coupangOrders:[{order_id:'CP-MOVE',shipment_box_id:'123',ordered_at:'2026-09-28T01:00:00Z',status,raw_data:{invoiceNumber:'1234567890123'}}],trackingStates:code?{[id]:{status:'SUCCESS',statusCode:code,trackingNo:'1234567890123'}}:{}});
  const order=center.orders[0];
  assert.equal(order.stage,{DEPARTURE:'WAITING_FOR_CARRIER',DELIVERING:'SHIPPING',FINAL_DELIVERY:'DELIVERED'}[status],`${status}/${code}`);
  if(status==='DELIVERING'){
   const page=adapter.buildOrderPage(center.orders,[],{stage:'IN_TRANSIT'});
   assert.equal(page.orders.length,1);
   assert.equal(page.orders[0].listDeliveryBadge.status,'IN_TRANSIT');
   assert.equal(page.orders[0].listDeliveryBadge.source,'CHANNEL');
  }
 }
});
test('Naver externally shipped orders retain channel status without a postal invoice',()=>{
 const center=orders.buildUnifiedOrders({asOf:'2026-09-29T05:00:00Z',naverOrders:[{order_id:'NV-MOVE',order_date:'2026-09-25T01:00:00Z',status:'DELIVERING',invoice_no:''}]});
 assert.equal(center.orders[0].stage,'SHIPPING');
 const page=adapter.buildOrderPage(center.orders,[],{stage:'IN_TRANSIT'});
 assert.equal(page.orders[0].listDeliveryBadge.source,'CHANNEL');
 assert.equal(page.orders[0].listDeliveryBadge.status,'IN_TRANSIT');
});
