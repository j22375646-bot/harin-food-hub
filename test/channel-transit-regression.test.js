'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const u=require('../lib/orders/unified-orders');
test('confirmed channel transit survives missing carrier tracking',()=>{
 const center=u.buildUnifiedOrders({asOf:'2026-09-09T07:00:00Z',coupangOrders:[{shipment_box_id:'TEST',order_id:'TEST',status:'DELIVERING',raw_data:{invoiceNumber:'1234567890123'}}],coupangOrderItems:[{shipment_box_id:'TEST',order_id:'TEST',product_name:'TEST',quantity:1}]});
 assert.equal(center.orders[0].stage,'SHIPPING');
 assert.equal(center.orders[0].shippingEligible,false);
 const adapter=require('../lib/ui/phase28-adapters/orders');
 assert.equal(adapter.buildOrderPage(center.orders,[],{stage:'IN_TRANSIT'}).total,1);
});
test('Cafe24 N30 transit survives missing carrier tracking but N22 is not transit',()=>{
 for(const status of ['N30','N22']){
  const center=u.buildUnifiedOrders({asOf:'2026-09-09T07:00:00Z',cafe24Orders:[{order_id:'TEST',order_date:'2026-09-09',raw_data:{tracking_no:'1234567890123'}}],cafe24OrderItems:[{order_id:'TEST',external_item_id:'I',quantity:1,raw_data:{order_status:status}}]});
  assert.equal(center.orders[0].stage,status==='N30'?'SHIPPING':'WAITING_FOR_CARRIER');
 }
});
