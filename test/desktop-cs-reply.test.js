const test=require('node:test'),assert=require('node:assert/strict'),{command}=require('../lib/customer-service/desktop-reply.js'),{validInput}=require('../desktop/team-contract.cjs');
const input={action:'CS_REPLY_SEND',inquiryId:'123',content:'답변 시험',replyBy:'seller',sourceUpdatedAt:'2026-09-16T01:00:00Z',confirm:true};
const db=(prior,row)=>({from:t=>{const q={select:()=>q,eq:()=>q,order:()=>q,limit:()=>q,maybeSingle:async()=>({data:t==='coupang_operation_requests'?prior:row})};return q;}});
test('reply requires explicit confirmation and stable source identity',async()=>{assert.equal(validInput(input),true);assert.equal(validInput({...input,confirm:false}),false);assert.equal(validInput({...input,inquiryId:'../1'}),false);await assert.rejects(command({db:db(null,{inquiry_type:'ONLINE',answered:true,updated_at:input.sourceUpdatedAt}),input}),/TEAM_CONFLICT/);});
test('reply queues once through the existing fixed IP worker',async()=>{let queued;const r=await command({db:db(null,{inquiry_type:'ONLINE',answered:false,updated_at:input.sourceUpdatedAt}),input,queue:async(_,v)=>{queued=v;return {request:{id:'job',status:'PENDING'}};}});assert.equal(r.status,'PENDING');assert.equal(queued.retryFailed,false);assert.equal(queued.payload.content,input.content);});
test('pending, successful and uncertain previous replies are never repeated',async()=>{for(const status of ['PENDING','RUNNING','EXECUTING','FAILED','CANCELLED']){const r=await command({db:db({id:'existing',status},null),input,queue:()=>{throw Error('must not repeat');}});assert.equal(r.status,status);}});

test('API success requests one idempotent read check and does not imply answered',async()=>{
 const prior={id:'job',status:'SUCCESS',executed_at:'2026-09-18T00:00:00Z'};let check;
 const r=await command({db:db(prior,{answered:false}),input,recheck:async(...args)=>{check=args;},queue:()=>{throw Error('no duplicate write');}});
 assert.equal(r.status,'VERIFYING');assert.equal(check[1],'CS_REALTIME');assert.equal(check[2].idempotencyKey,'moaon-reply-check:job');
 const done=await command({db:db(prior,{answered:true,updated_at:'2026-09-18T00:01:00Z'}),input,recheck:()=>{throw Error('must not collect');}});
 assert.equal(done.status,'SUCCESS');assert.equal(done.verifiedAt,'2026-09-18T00:01:00Z');
});
test('status preserves timings and redacts internal error details',async()=>{
 const r=await command({db:db({id:'job',status:'FAILED',created_at:'2026-09-18T00:00:00Z',error_message:'401 secret internal response'},null),input});
 assert.equal(r.reason,'AUTH_CHECK');assert.equal(r.createdAt,'2026-09-18T00:00:00Z');assert.equal(JSON.stringify(r).includes('secret'),false);
});
test('verification collection failure preserves acknowledged send and blocks resend',async()=>{
 const r=await command({db:db({id:'job',status:'SUCCESS'},null),input,recheck:async()=>{throw Error('unavailable');},queue:()=>{throw Error('no write');}});
 assert.equal(r.status,'VERIFYING');assert.equal(r.reason,'VERIFY_CHECK');
});

test('desktop transport reaches authenticated reply status route',async()=>{
 const {createHandler}=require('../lib/team/request.js');
 const {teamRequest}=require('../desktop/team-transport.cjs');
 const {COOKIE_NAME}=require('../lib/dashboard-auth.js');
 const store=db(null,null);store.rpc=async()=>({data:{revision:0,config:null},error:null});
 const handle=createHandler({database:()=>store,validate:async()=>({role:'OWNER',userId:'test-owner',id:'test-session'})});
 const response=await teamRequest((url,init)=>handle(new Request(url,{...init,headers:{...init.headers,Cookie:COOKIE_NAME+'=fixture-session'}})),{action:'CS_REPLY_STATUS',inquiryId:'123'});
 assert.equal(response.ok,true);assert.equal(response.value.status,'NONE');
});
