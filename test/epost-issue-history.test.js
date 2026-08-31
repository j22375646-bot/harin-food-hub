'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const operationQueue=require('../lib/coupang/operation-queue.js');
const issueHistory=require('../lib/epost/issue-history.js');

test('successful live ePost issues expose only real 13 digit invoice numbers by order',()=>{
  const secret='0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
  const rows=[
    {id:'newest',operation_type:'EPOST_LIVE_ISSUE',target_type:'HUB_ORDER',target_id:'HR-C24-AAAA1111',status:'SUCCESS',result_json:operationQueue.seal({epostLive:{trackingNo:'1234567890123'}},secret)},
    {id:'older',operation_type:'EPOST_LIVE_ISSUE',target_type:'HUB_ORDER',target_id:'HR-C24-AAAA1111',status:'SUCCESS',result_json:operationQueue.seal({epostLive:{trackingNo:'9999999999999'}},secret)},
    {id:'failed',operation_type:'EPOST_LIVE_ISSUE',target_type:'HUB_ORDER',target_id:'HR-CP-BBBB2222',status:'FAILED',result_json:operationQueue.seal({epostLive:{trackingNo:'2222222222222'}},secret)},
    {id:'test-number',operation_type:'EPOST_LIVE_ISSUE',target_type:'HUB_ORDER',target_id:'HR-CP-CCCC3333',status:'SUCCESS',result_json:operationQueue.seal({epostLive:{trackingNo:'TESTREGINOAPI'}},secret)}
  ];

  const index=issueHistory.successfulIssueIndex(rows,secret);

  assert.deepEqual(index.get('HR-C24-AAAA1111'),{invoiceNumber:'1234567890123',requestId:'newest'});
  assert.equal(index.has('HR-CP-BBBB2222'),false);
  assert.equal(index.has('HR-CP-CCCC3333'),false);
});
