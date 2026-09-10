'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {projectOrdersPayload} = require('../hub-connection.cjs');
const base = () => ({hubOrderId:'HR-C24-1234ABCD',externalOrderId:'C1',platform:'CAFE24',fulfillment:'SELLER',stage:'PAID',cancelled:false,cancellationRequested:false,shippingHistoryStatus:'READY',shippingEligible:true,selectionEligible:true,invoiceNumber:'',issuedInvoiceNumber:'',invoice:null,quantity:2,receiver:{name:'PRIVATE-NAME',contact:'01012345678',postCode:'12345',address:'PRIVATE-ADDRESS'}});
const check = (order,partial=false) => projectOrdersPayload({ok:true,orders:[order],total:1,offset:0,nextOffset:null,snapshot:'a'.repeat(64),partial},'2026-09-08T00:00:00Z').orders[0].preflight;

test('real order page preserves verified history and does not invent it when absent', () => {
  const {buildOrderPage} = require('../../lib/ui/phase28-adapters/orders.js');
  for (const history of ['READY', 'CHECK_REQUIRED', undefined]) {
    const page = buildOrderPage([{...base(), shippingHistoryStatus:history}], [], {stage:'ACTIVE'});
    assert.equal(page.orders[0].shippingHistoryStatus, history === 'READY' ? 'READY' : 'CHECK_REQUIRED');
    assert.equal(check(page.orders[0]).status, history === 'READY' ? 'REVIEW_ONLY' : 'CHECK_REQUIRED');
  }
});

test('missing or failed shipping history cannot become a final review candidate', () => {
  for (const shippingHistoryStatus of [undefined, null, 'CHECK_REQUIRED', 'FAILED']) {
    const result = check({...base(), shippingHistoryStatus});
    assert.equal(result.status, 'CHECK_REQUIRED');
    assert.ok(result.codes.includes('HISTORY_UNAVAILABLE'));
  }
});

test('complete stored order is review-only, never an execution authorization', () => {
  assert.deepEqual(check(base()),{status:'REVIEW_ONLY',route:'HUB',codes:[]});
  assert.equal(Object.isFrozen(check(base()).codes),true);
  const dto = JSON.stringify(check(base()));
  for(const privateValue of ['PRIVATE-NAME','01012345678','12345','PRIVATE-ADDRESS']) assert.equal(dto.includes(privateValue),false);
});
test('hub review candidates require a canonical id for their own channel', () => {
  for (const hubOrderId of ['H1', 'HR-CP-1234ABCD', 'HR-C24-1234abcd', ' HR-C24-1234ABCD']) {
    const result = check({...base(), hubOrderId});
    assert.equal(result.status, 'CHECK_REQUIRED');
    assert.ok(result.codes.includes('ORDER_ID'));
  }
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
  assert.equal(check({...base(),platform:'COUPANG',hubOrderId:'HR-CP-1234ABCD',shipmentId:'123456'}).status,'REVIEW_ONLY');
  assert.equal(check({...base(),platform:'UNKNOWN'}).status,'CHECK_REQUIRED');
});
test('missing identity, readiness, delivery information and partial response fail closed', () => {
  for(const patch of [{hubOrderId:''},{externalOrderId:''},{fulfillment:null},{cancelled:undefined},{cancellationRequested:'false'},{invoiceNumber:undefined},{issuedInvoiceNumber:undefined},{shippingEligible:false},{selectionEligible:undefined},{receiver:{}},{receiver:{...base().receiver,contact:'x'}},{quantity:0}]) {
    assert.equal(check({...base(),...patch}).status,'CHECK_REQUIRED',JSON.stringify(patch));
  }
  assert.equal(check(base(),true).status,'CHECK_REQUIRED');
  assert.ok(check({...base(),receiver:{}}).codes.includes('DELIVERY_INFO'));
});

test('seller Coupang without a shipment group exposes the reason instead of silently disabling',()=>{assert.ok(check({...base(),platform:'COUPANG',hubOrderId:'HR-CP-1234ABCD'}).codes.includes('SHIPMENT_ID'));});

test('server shipping block reason stays visible as bounded plain text',()=>{const result=check({...base(),shippingEligible:false,shippingBlockedReason:'계약 택배 설정을 확인하세요. <img src=x>'});assert.equal(result.serverReason,'계약 택배 설정을 확인하세요. <img src=x>');assert.equal(check({...base(),shippingEligible:false,shippingBlockedReason:'x'.repeat(600)}).serverReason.length,500);});
