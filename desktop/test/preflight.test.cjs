'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {projectOrdersPayload} = require('../hub-connection.cjs');
const base = () => ({hubOrderId:'H1',externalOrderId:'C1',platform:'CAFE24',fulfillment:'SELLER',stage:'PAID',cancelled:false,cancellationRequested:false,shippingEligible:true,selectionEligible:true,invoiceNumber:'',issuedInvoiceNumber:'',invoice:null,quantity:2,receiver:{name:'PRIVATE-NAME',contact:'01012345678',postCode:'12345',address:'PRIVATE-ADDRESS'}});
const check = (order,partial=false) => projectOrdersPayload({ok:true,orders:[order],total:1,offset:0,nextOffset:null,snapshot:'a'.repeat(64),partial},'2026-09-08T00:00:00Z').orders[0].preflight;

test('complete stored order is review-only, never an execution authorization', () => {
  assert.deepEqual(check(base()),{status:'REVIEW_ONLY',route:'HUB',codes:[]});
  assert.equal(Object.isFrozen(check(base()).codes),true);
  const dto = JSON.stringify(check(base()));
  for(const privateValue of ['PRIVATE-NAME','01012345678','12345','PRIVATE-ADDRESS']) assert.equal(dto.includes(privateValue),false);
});
test('cancellation, shipment and any existing invoice evidence block another issue', () => {
  for(const patch of [{cancelled:true},{cancellationRequested:true},{stage:'SHIPPING'},{invoiceNumber:'broken'},{issuedInvoiceNumber:'1234567890123'},{invoice:{status:'ISSUED',number:'bad'}},{listDeliveryBadge:{status:'DELIVERED'}}]) {
    assert.equal(check({...base(),...patch}).status,'BLOCKED',JSON.stringify(patch));
  }
});
test('provider routing never merges Naver or Rocket Growth with hub shipping', () => {
  assert.equal(check({...base(),platform:'NAVER'}).route,'NAVER');
  assert.equal(check({...base(),platform:'NAVER'}).status,'EXTERNAL');
  assert.equal(check({...base(),platform:'COUPANG',fulfillment:'ROCKET_GROWTH'}).route,'COUPANG_ROCKET');
  assert.equal(check({...base(),platform:'COUPANG',fulfillment:'ROCKET_GROWTH'}).status,'EXTERNAL');
  assert.equal(check({...base(),platform:'COUPANG'}).status,'REVIEW_ONLY');
  assert.equal(check({...base(),platform:'UNKNOWN'}).status,'CHECK_REQUIRED');
});
test('missing identity, readiness, delivery information and partial response fail closed', () => {
  for(const patch of [{hubOrderId:''},{externalOrderId:''},{fulfillment:null},{cancelled:undefined},{cancellationRequested:'false'},{invoiceNumber:undefined},{issuedInvoiceNumber:undefined},{shippingEligible:false},{selectionEligible:undefined},{receiver:{}},{receiver:{...base().receiver,contact:'x'}},{quantity:0}]) {
    assert.equal(check({...base(),...patch}).status,'CHECK_REQUIRED',JSON.stringify(patch));
  }
  assert.equal(check(base(),true).status,'CHECK_REQUIRED');
  assert.ok(check({...base(),receiver:{}}).codes.includes('DELIVERY_INFO'));
});
