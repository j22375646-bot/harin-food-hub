'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const {buildPhase28CsModel}=require('../lib/ui/phase28-adapters/cs.js');

test('CS adapter exposes verified conversation and reply gates without leaking raw fields',()=>{
  const source={inquiry_id:'123',inquiry_type:'CALL_CENTER',question_text:'다시 확인해주세요.',parent_answer_id:'20',reply_required:true,can_reply:true,status_verified:true,fetched_at:'2026-09-07T10:00:00Z',raw_json:{token:'secret'},conversation:[{answerId:'20',parentAnswerId:null,answerType:'csAgent',partnerTransferStatus:'REQUEST_ANSWER',needAnswer:true,replyAt:'2026-09-07T09:00:00Z',content:'다시 확인해주세요.',privateField:'secret'}]};
  const row=buildPhase28CsModel({customerService:{rows:[{id:'C1',platform:'COUPANG',kind:'INQUIRY',source}]}}).rows[0];
  assert.equal(row.content,'다시 확인해주세요.');
  assert.equal(row.source.canReply,true);
  assert.equal(row.source.statusVerified,true);
  assert.equal(row.source.replyRequired,true);
  assert.equal(row.source.parentAnswerId,'20');
  assert.deepEqual(row.source.conversation,[{answerId:'20',parentAnswerId:null,answerType:'csAgent',partnerTransferStatus:'REQUEST_ANSWER',needAnswer:true,replyAt:'2026-09-07T09:00:00Z',content:'다시 확인해주세요.'}]);
  assert.equal(JSON.stringify(row).includes('secret'),false);
});

test('CALL_CENTER reply stays locked without verified current reply target',()=>{
  const {replyBlockedReason}=require('../lib/customer-service/sync-watch.js');
  const row={kind:'INQUIRY',platform:'COUPANG',source:{inquiryType:'CALL_CENTER',statusVerified:true,canReply:true,replyRequired:true,parentAnswerId:'20'}};
  assert.equal(replyBlockedReason(row),'');
  assert.match(replyBlockedReason({...row,source:{...row.source,statusVerified:false}}),/상태.*확인/);
  assert.match(replyBlockedReason({...row,source:{...row.source,parentAnswerId:null}}),/답변 대상/);
  assert.match(replyBlockedReason({...row,source:{...row.source,canReply:false}}),/답변.*허용/);
  assert.match(replyBlockedReason({...row,completed:true}),/완료/);
});

test('reused successful queue IDs are rechecked and pending work times out without a false success',async()=>{
  const {watchCustomerServiceSync}=require('../lib/customer-service/sync-watch.js');
  const initial={jobs:[{platform:'COUPANG',ok:true,data:{queued:true,request:{id:'cp-1',status:'SUCCESS'}}}]};
  const partial=await watchCustomerServiceSync(initial,{wait:async()=>{},fetchImpl:async()=>Response.json({jobs:[{platform:'COUPANG',id:'cp-1',status:'PARTIAL'}]})});
  assert.equal(partial.jobs[0].status,'PARTIAL');
  const pending=await watchCustomerServiceSync(initial,{maxAttempts:2,wait:async()=>{},fetchImpl:async()=>Response.json({jobs:[{platform:'COUPANG',id:'cp-1',status:'PENDING'}]})});
  assert.equal(pending.timedOut,true);
  assert.equal(pending.jobs[0].status,'PENDING');
});

test('queued CS collection waits for terminal channel results and retains partial failures',async()=>{
  const {watchCustomerServiceSync}=require('../lib/customer-service/sync-watch.js');
  const initial={jobs:[{platform:'CAFE24',ok:true,data:{status:'SUCCESS'}},{platform:'COUPANG',ok:true,data:{queued:true,request:{id:'cp-1',status:'PENDING'}}},{platform:'NAVER',ok:true,data:{queued:true,request:{id:'nv-1',status:'PENDING'}}}]};
  const responses=[{jobs:[{platform:'COUPANG',id:'cp-1',status:'RUNNING'},{platform:'NAVER',id:'nv-1',status:'SUCCESS'}]},{jobs:[{platform:'COUPANG',id:'cp-1',status:'PARTIAL'}]}];
  const result=await watchCustomerServiceSync(initial,{wait:async()=>{},fetchImpl:async()=>Response.json(responses.shift())});
  assert.equal(result.timedOut,false);
  assert.deepEqual(result.jobs.map(job=>[job.platform,job.status]),[['CAFE24','SUCCESS'],['COUPANG','PARTIAL'],['NAVER','SUCCESS']]);
});

test('CS status failures and aborted navigation never publish a completed collection',async()=>{
  const {watchCustomerServiceSync}=require('../lib/customer-service/sync-watch.js');
  const initial={jobs:[{platform:'COUPANG',ok:true,data:{request:{id:'cp-1',status:'PENDING'}}}]};
  await assert.rejects(watchCustomerServiceSync(initial,{wait:async()=>{},fetchImpl:async()=>Response.json({error:'인증 확인 필요'},{status:401})}),/인증 확인 필요/);
  const controller=new AbortController();let updates=0;
  await assert.rejects(watchCustomerServiceSync(initial,{wait:async()=>{},signal:controller.signal,onUpdate:()=>updates++,fetchImpl:async()=>{controller.abort();return Response.json({jobs:[{platform:'COUPANG',id:'cp-1',status:'SUCCESS'}]});}}),{name:'AbortError'});
  assert.equal(updates,1);
});
