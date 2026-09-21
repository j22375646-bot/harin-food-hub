'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const u=require('../lib/orders/unified-orders');
const adapter=require('../lib/ui/phase28-adapters/orders');
function input(platform,status,invoice='1234567890123'){
 const common={asOf:'2026-09-21T07:00:00Z'};
 if(platform==='CAFE24')return {...common,cafe24Orders:[{order_id:'TEST',order_date:'2026-09-21',raw_data:{tracking_no:invoice}}],cafe24OrderItems:[{order_id:'TEST',external_item_id:'I',quantity:1,raw_data:{order_status:status}}]};
 if(platform==='NAVER')return {...common,naverOrders:[{order_id:'TEST',order_date:'2026-09-21',status,invoice_no:invoice}],naverOrderItems:[{order_id:'TEST',quantity:1}]};
 return {...common,coupangOrders:[{shipment_box_id:'TEST',order_id:'TEST',ordered_at:'2026-09-21',status,raw_data:{invoiceNumber:invoice}}],coupangOrderItems:[{shipment_box_id:'TEST',order_id:'TEST',product_name:'TEST',quantity:1}]};
}
for(const [platform,statuses] of [['CAFE24',['N22','N30','N40']],['COUPANG',['DELIVERING','FINAL_DELIVERY']],['NAVER',['DELIVERING','DELIVERED']]]){
 for(const status of statuses)for(const code of [null,'NOT_FOUND','ACCEPTED','IN_TRANSIT','DELIVERED'])test(`${platform} ${status}: carrier ${code} owns the delivery tab`,()=>{
  const base=input(platform,status),id=u.buildUnifiedOrders(base).orders[0].hubOrderId;
  const center=u.buildUnifiedOrders({...base,trackingStates:code?{[id]:{status:'SUCCESS',statusCode:code,trackingNo:'1234567890123'}}:{}});
  const expected=code==='DELIVERED'?'DELIVERED':code==='IN_TRANSIT'?'SHIPPING':'WAITING_FOR_CARRIER';
  assert.equal(center.orders[0].stage,expected);
  assert.equal(center.orders[0].shippingEligible,false);
  const model=adapter.buildPhase28OrdersModel({unifiedOrders:center});
  const scope=expected==='DELIVERED'?'COMPLETED':expected==='SHIPPING'?'IN_TRANSIT':'REGISTER';
  assert.deepEqual(model.orders[0].stageIds,[scope]);
  assert.equal(model.workspaces.find(row=>row.id===scope).count,1);
 });
}
test('failed, pending and different-invoice tracking cannot prove delivery',()=>{
 const base=input('CAFE24','N30'),id=u.buildUnifiedOrders(base).orders[0].hubOrderId;
 for(const tracking of [{status:'FAILED',statusCode:'DELIVERED'},{status:'QUEUED',statusCode:'IN_TRANSIT'},{status:'SUCCESS',statusCode:'DELIVERED',trackingNo:'9876543210987'}]){
  const center=u.buildUnifiedOrders({...base,trackingStates:{[id]:tracking}});
  assert.equal(center.orders[0].stage,'WAITING_FOR_CARRIER');
  assert.deepEqual(adapter.buildPhase28OrdersModel({unifiedOrders:center}).orders[0].stageIds,['REGISTER']);
 }
});
test('channel shipping without a supported invoice remains visible and cannot be reissued',()=>{
 for(const invoice of ['', '1234567890']){
  const center=u.buildUnifiedOrders(input('CAFE24','N30',invoice));
  assert.equal(center.orders[0].stage,'WAITING_FOR_CARRIER');
  assert.equal(center.orders[0].shippingEligible,false);
  assert.equal(adapter.buildOrderPage(center.orders,[],{stage:'REGISTER'}).total,1);
 }
});
test('cancellation wins over previous delivery tracking',()=>{
 const base=input('CAFE24','C40'),id=u.buildUnifiedOrders(base).orders[0].hubOrderId;
 const center=u.buildUnifiedOrders({...base,trackingStates:{[id]:{status:'SUCCESS',statusCode:'IN_TRANSIT'}}});
 assert.equal(center.orders[0].stage,'CANCELLED');
 assert.deepEqual(adapter.buildPhase28OrdersModel({unifiedOrders:center}).orders[0].stageIds,['COMPLETED']);
});
