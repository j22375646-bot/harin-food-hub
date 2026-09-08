'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {assertCurrentShippingOrder}=require('../lib/epost/dispatch-guard.js');
const order=()=>({hubOrderId:'HR-C24-1234ABCD',platform:'CAFE24',externalOrderId:'ORDER-1',shipmentId:'',fulfillment:'SELLER',stage:'PAID',cancelled:false,cancellationRequested:false,shippingEligible:true,shippingHistoryStatus:'READY',invoiceNumber:'',issuedInvoiceNumber:''});
const center=current=>({orders:[current],channels:[{platform:'CAFE24',status:'READY'}]});
test('dispatch accepts the matching current eligible order',()=>{
 const current=order(); assert.equal(assertCurrentShippingOrder(center(current),order(),'HR-C24-1234ABCD'),current);
});
test('dispatch blocks cancellation, invoices, stale identity and unavailable history',()=>{
 for(const patch of [{cancelled:true},{cancellationRequested:true},{stage:'SHIPPING'},{invoiceNumber:'1234567890123'},{issuedInvoiceNumber:'1234567890123'},{shippingEligible:false},{shippingHistoryStatus:'CHECK_REQUIRED'},{fulfillment:'ROCKET_GROWTH'},{platform:'NAVER'},{externalOrderId:'OTHER'},{cancelled:undefined}]) {
  assert.throws(()=>assertCurrentShippingOrder(center({...order(),...patch}),order(),'HR-C24-1234ABCD'),{code:'EPOST_ORDER_RECHECK_REQUIRED'});
 }
});
test('dispatch rejects missing or duplicate order and failed source channel',()=>{
 for(const value of [{orders:[],channels:[]},{orders:[order(),order()],channels:[{platform:'CAFE24',status:'READY'}]},{orders:[order()],channels:[{platform:'CAFE24',status:'FAILED'}]}]) assert.throws(()=>assertCurrentShippingOrder(value,order(),'HR-C24-1234ABCD'),{code:'EPOST_ORDER_RECHECK_REQUIRED'});
});
test('real worker checks current order before calling the carrier',async()=>{
 const config=require('../lib/epost/config.js');
 const client=require('../lib/epost/client.js');
 const unified=require('../lib/orders/unified-orders.js');
 const worker=require('../scripts/coupang-local-worker.js');
 const saved={fetch:global.fetch,readiness:config.readiness,issue:client.issueShipment,load:unified.loadUnifiedOrders};
 let calls=0;
 try {
  global.fetch=async()=>new Response(JSON.stringify({ip:'127.0.0.1'}),{headers:{'Content-Type':'application/json'}});
  config.readiness=()=>({readyForLive:true});
  client.issueShipment=async()=>{calls++;return {trackingNo:'1234567890123'};};
  unified.loadUnifiedOrders=async()=>center({...order(),cancellationRequested:true});
  const request={operation_type:'EPOST_LIVE_ISSUE',target_type:'HUB_ORDER',target_id:'HR-C24-1234ABCD'};
  await assert.rejects(worker.dispatchOperation(request,{live:true,order:order()},{},{}),{code:'EPOST_ORDER_RECHECK_REQUIRED'});
  assert.equal(calls,0);
  unified.loadUnifiedOrders=async()=>center(order());
  assert.equal((await worker.dispatchOperation(request,{live:true,order:order()},{},{})).epostLive.trackingNo,'1234567890123');
  assert.equal(calls,1);
 } finally {global.fetch=saved.fetch;config.readiness=saved.readiness;client.issueShipment=saved.issue;unified.loadUnifiedOrders=saved.load;}
});
