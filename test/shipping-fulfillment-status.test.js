'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const operationQueue=require('../lib/coupang/operation-queue.js');
const fulfillmentStatus=require('../lib/shipping/fulfillment-status.js');

const secret='phase28-fulfillment-status-test-secret';
const order={hubOrderId:'HR-C24-AAAAAAAA',platform:'CAFE24',shipmentId:'',invoiceNumber:'',issuedInvoiceNumber:''};

function row(overrides={}){
  return {
    id:'11111111-1111-4111-8111-111111111111',operation_type:'EPOST_LIVE_ISSUE',target_type:'HUB_ORDER',
    target_id:order.hubOrderId,status:'PENDING',payload:operationQueue.seal({},secret),result_json:operationQueue.seal({},secret),
    error_message:null,created_at:'2026-09-02T01:00:00.000Z',started_at:null,executed_at:null,next_attempt_at:null,
    ...overrides
  };
}

test('fulfillment status exposes live postal issue, platform transfer, and tracking phases',()=>{
  const issue=row({status:'SUCCESS',result_json:operationQueue.seal({epostLive:{trackingNo:'1234567890123'}},secret),executed_at:'2026-09-02T01:01:00.000Z'});
  const transfer=row({id:'22222222-2222-4222-8222-222222222222',operation_type:'CAFE24_UPLOAD_INVOICE',status:'EXECUTING',created_at:'2026-09-02T01:02:00.000Z',started_at:'2026-09-02T01:02:01.000Z'});
  const result=fulfillmentStatus.buildFulfillmentStatuses({orders:[order],operationRows:[transfer,issue],trackingStates:{},secret,now:new Date('2026-09-02T01:03:00.000Z')});

  assert.equal(result.items.length,1);
  assert.deepEqual(result.items[0],{
    hubOrderId:order.hubOrderId,platform:'CAFE24',phase:'TRANSFER',status:'RUNNING',label:'Cafe24 송장 등록 중',
    detail:'발급 송장 1234567890123을 쇼핑몰에 등록하고 있어요.',active:true,needsAttention:false,
    progress:3,trackingNo:'1234567890123',requestId:transfer.id,updatedAt:'2026-09-02T01:02:01.000Z',error:''
  });
  assert.equal(result.summary.active,1);
  assert.equal(result.summary.needsAttention,0);
});

test('fulfillment status distinguishes retry wait and failed work without hiding the server state',()=>{
  const retry=row({status:'PENDING',next_attempt_at:'2026-09-02T01:05:00.000Z',error_message:'우체국 점검 중'});
  const retryResult=fulfillmentStatus.buildFulfillmentStatuses({orders:[order],operationRows:[retry],trackingStates:{},now:new Date('2026-09-02T01:03:00.000Z')});
  assert.equal(retryResult.items[0].status,'RETRY_WAITING');
  assert.equal(retryResult.items[0].label,'우체국 재시도 대기');
  assert.equal(retryResult.items[0].active,true);

  const failed=row({status:'FAILED',error_message:'수취인 주소 확인 필요',executed_at:'2026-09-02T01:04:00.000Z'});
  const failedResult=fulfillmentStatus.buildFulfillmentStatuses({orders:[order],operationRows:[failed],trackingStates:{},now:new Date('2026-09-02T01:05:00.000Z')});
  assert.equal(failedResult.items[0].status,'FAILED');
  assert.equal(failedResult.items[0].label,'우체국 송장 발급 실패');
  assert.equal(failedResult.items[0].needsAttention,true);
  assert.equal(failedResult.items[0].error,'수취인 주소 확인 필요');
});

test('fulfillment status advances a registered invoice from carrier waiting to in transit',()=>{
  const issue=row({status:'SUCCESS',result_json:operationQueue.seal({epostLive:{trackingNo:'1234567890123'}},secret)});
  const transfer=row({id:'22222222-2222-4222-8222-222222222222',operation_type:'CAFE24_UPLOAD_INVOICE',status:'SUCCESS',created_at:'2026-09-02T01:02:00.000Z',executed_at:'2026-09-02T01:02:30.000Z'});
  const tracking={hubOrderId:order.hubOrderId,trackingNo:'1234567890123',status:'SUCCESS',statusCode:'IN_TRANSIT',statusLabel:'배송중',checkedAt:'2026-09-02T01:03:00.000Z',requestId:'33333333-3333-4333-8333-333333333333'};
  const result=fulfillmentStatus.buildFulfillmentStatuses({orders:[order],operationRows:[transfer,issue],trackingStates:{[order.hubOrderId]:tracking},secret});

  assert.equal(result.items[0].phase,'TRACKING');
  assert.equal(result.items[0].status,'IN_TRANSIT');
  assert.equal(result.items[0].label,'배송중');
  assert.equal(result.items[0].progress,4);
  assert.equal(result.items[0].active,false);
});

