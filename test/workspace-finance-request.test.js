'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {resolveTenantContext}=require('../lib/tenancy/context.js');
const A='a3452bca-e259-40ed-a93d-b8bcc5c1b9e0';
const B='10000000-0000-4000-8000-000000000002';
const request=(id=A)=>new Request(`https://hub.example/api/moaon/businesses/${id}/finance`,{headers:{cookie:'harin_dashboard_session=abc.def'}});
async function context(tenantId=A,role='OWNER',identity={}){
 const userId=identity.userId||'user';
 return resolveTenantContext({session:{id:identity.sessionId||'session',userId,expiresAt:'2099-01-01'},requestedTenantId:tenantId},{now:()=>new Date(),findMembership:async()=>({userId,tenantId,role,status:'ACTIVE',version:identity.membershipVersion||1})});
}
const create=()=>require('../lib/tenancy/workspace-finance-request.js').createWorkspaceFinanceRequest;
test('finance default server budget leaves time for both authorization passes',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});let done=false;
 const pending=create()({resolveContext:()=>new Promise(()=>{}),readFinance:async()=>({})})(request()).then(response=>{done=true;return response;});
 t.mock.timers.tick(15000);await new Promise(setImmediate);assert.equal(done,false);
 t.mock.timers.tick(10000);assert.equal((await pending).status,504);
});

test('authorization blocks every finance loader read for another tenant or role',async()=>{
 let loads=0;
 for(const [tenant,role] of [[B,'OWNER'],[A,'VIEWER'],[A,'OPERATOR']]){
  const handle=create()({resolveContext:()=>context(tenant,role),readFinance:async()=>{loads++;return {};}});
  const response=await handle(request(tenant));
  assert.equal(response.status,403);
 }
 assert.equal(loads,0);
});

test('finance response preserves null, zero, and negative values with explicit statuses',async()=>{
 const handle=create()({resolveContext:()=>context(),readFinance:async()=>({
  month:'2026-09',generatedAt:'2026-09-09T03:04:05.000Z',
  metrics:{sales:{value:0,status:'READY'},profit:{value:-1234,status:'READY'},balance:{value:null,status:'BLOCKED'}},
  rawOrders:[{secret:'must not escape'}]
 })});
 const response=await handle(request());
 assert.equal(response.status,200);
 assert.deepEqual(await response.json(),{ok:true,month:'2026-09',generatedAt:'2026-09-09T03:04:05.000Z',metrics:{sales:{value:0,status:'READY'},profit:{value:-1234,status:'READY'},balance:{value:null,status:'BLOCKED'}}});
});

test('malformed finance requests are rejected before identity and finance access',async()=>{
 let checks=0,loads=0;
 const handle=create()({resolveContext:async()=>{checks++;return context();},readFinance:async()=>{loads++;return {};}});
 for(const input of [request('bad'),new Request(request().url+'?tenantId='+B,{headers:request().headers}),new Request(request(),{method:'POST'}),new Request(request(),{headers:{origin:'https://evil.example',cookie:'harin_dashboard_session=abc.def'}})]){
  assert.notEqual((await handle(input)).status,200);
 }
 assert.equal(checks,0);assert.equal(loads,0);
});

test('a workspace change after the read discards the projected finance result',async()=>{
 let checks=0;
 const handle=create()({resolveContext:async()=>++checks===1?context():context(A,'VIEWER'),readFinance:async()=>({month:'2026-09',generatedAt:'2026-09-09T00:00:00.000Z',metrics:{sales:{value:999,status:'READY'},profit:{value:1,status:'READY'},balance:{value:1,status:'PARTIAL'}}})});
 const response=await handle(request());
 assert.notEqual(response.status,200);
 assert.doesNotMatch(await response.text(),/999|sales|profit|balance/);
});

test('owner identity drift after read returns 409 without exposing finance',async()=>{
 for(const drift of [{sessionId:'other'},{userId:'other'},{membershipVersion:2}]){
  let checks=0;
  const handle=create()({resolveContext:async()=>++checks===1?context():context(A,'OWNER',drift),readFinance:async()=>({month:'2026-09',generatedAt:'2026-09-09T00:00:00.000Z',metrics:{sales:{value:777,status:'READY'},profit:{value:1,status:'READY'},balance:{value:1,status:'PARTIAL'}}})});
  const response=await handle(request());
  assert.equal(response.status,409);
  assert.deepEqual(await response.json(),{ok:false,code:'WORKSPACE_CHANGED'});
 }
});

test('pre-authorization timeout identifies auth-before and never starts finance read',async()=>{
 let reads=0,release;
 const handle=create()({timeoutMs:5,resolveContext:()=>new Promise(resolve=>{release=resolve;}),readFinance:async()=>{reads++;return {};}});
 const response=await handle(request());
 assert.equal(response.status,504);
 assert.match(response.headers.get('server-timing')||'',/(?:^|, )auth-before;dur=\d+(?:\.\d+)?/);
 assert.doesNotMatch(response.headers.get('server-timing')||'',/finance-read|auth-after/);
 release(await context());await new Promise(resolve=>setTimeout(resolve,10));
 assert.equal(reads,0);
});

test('slow finance timeout identifies finance-read without bypassing pre-authorization',async()=>{
 let checks=0,release;
 const handle=create()({timeoutMs:5,resolveContext:async()=>{checks++;return context();},readFinance:()=>new Promise(resolve=>{release=resolve;})});
 const response=await handle(request());
 assert.equal(response.status,504);
 const timing=response.headers.get('server-timing')||'';
 assert.match(timing,/(?:^|, )auth-before;dur=\d+(?:\.\d+)?/);
 assert.match(timing,/(?:^|, )finance-read;dur=\d+(?:\.\d+)?/);
 assert.match(timing,/(?:^|, )total;dur=\d+(?:\.\d+)?/);
 assert.doesNotMatch(timing,/auth-after|tenant|session|user|777/i);
 assert.equal(checks,1);
 release({});
});
