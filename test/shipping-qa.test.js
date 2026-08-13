'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const operationQueue = require('../lib/coupang/operation-queue.js');
const { buildShippingQa } = require('../lib/shipping/qa.js');

const secret='shipping-qa-test-secret';

test('11-3F QA summarizes real tracking, batch, duplicate guard, recovery and address validation', () => {
  const previous=process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.SUPABASE_SERVICE_ROLE_KEY=secret;
  try{
    const rows=[0,1,2].map(index=>({
      operation_type:'EPOST_TRACKING', target_type:'TRACKING', target_id:`12345678901${index}`,
      status:'SUCCESS', attempt_count:1, idempotency_key:`tracking-${index}`,
      payload:operationQueue.seal({},secret), result_json:operationQueue.seal({epostTracking:{statusCode:index?'DELIVERED':'IN_TRANSIT'}},secret),
      created_at:'2026-08-14T01:05:20.000Z', executed_at:'2026-08-14T01:05:40.000Z'
    }));
    rows.push({operation_type:'UPLOAD_INVOICE',target_type:'HUB_ORDER',target_id:'HR-CP-00000000',status:'SUCCESS',attempt_count:2,idempotency_key:'invoice-1',payload:operationQueue.seal({invoiceNumber:'1234567890123'},secret),result_json:operationQueue.seal({},secret),created_at:'2026-08-14T01:06:00.000Z'});
    const qa=buildShippingQa(rows,{now:'2026-08-14T02:00:00.000Z'});
    assert.equal(qa.summary.passed,6);
    assert.equal(qa.summary.warnings,0);
    assert.match(qa.checks.find(check=>check.id==='batch').detail,/최대 3건/);
    assert.match(qa.checks.find(check=>check.id==='recovery').detail,/재시도 복구 1건/);
  }finally{
    if(previous===undefined)delete process.env.SUPABASE_SERVICE_ROLE_KEY;else process.env.SUPABASE_SERVICE_ROLE_KEY=previous;
  }
});

test('11-3F QA warns about unresolved transfer and duplicate execution evidence', () => {
  const previous=process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.SUPABASE_SERVICE_ROLE_KEY=secret;
  try{
    const envelope=operationQueue.seal({},secret);
    const rows=[
      {operation_type:'UPLOAD_INVOICE',target_type:'HUB_ORDER',target_id:'HR-CP-00000000',status:'FAILED',attempt_count:1,idempotency_key:'same',payload:envelope,result_json:envelope,created_at:'2026-08-14T01:00:00.000Z'},
      {operation_type:'UPLOAD_INVOICE',target_type:'HUB_ORDER',target_id:'HR-CP-00000001',status:'PENDING',attempt_count:0,idempotency_key:'same',payload:envelope,result_json:envelope,created_at:'2026-08-14T00:59:00.000Z'}
    ];
    const qa=buildShippingQa(rows);
    assert.equal(qa.checks.find(check=>check.id==='duplicate').status,'WARN');
    assert.equal(qa.checks.find(check=>check.id==='recovery').status,'WARN');
  }finally{
    if(previous===undefined)delete process.env.SUPABASE_SERVICE_ROLE_KEY;else process.env.SUPABASE_SERVICE_ROLE_KEY=previous;
  }
});
