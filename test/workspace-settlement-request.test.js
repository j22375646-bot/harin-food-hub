'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {resolveTenantContext}=require('../lib/tenancy/context.js');
const A='a3452bca-e259-40ed-a93d-b8bcc5c1b9e0',B='10000000-0000-4000-8000-000000000002';
const request=(id=A,query='')=>new Request(`https://hub.example/api/moaon/businesses/${id}/settlement${query}`,{headers:{cookie:'harin_dashboard_session=abc.def'}});
const create=options=>require('../lib/tenancy/workspace-settlement-request.js').createWorkspaceSettlementRequest(options);
const context=(tenantId=A,role='OWNER',version=1)=>resolveTenantContext({session:{id:'session',userId:'user',expiresAt:'2099-01-01'},requestedTenantId:tenantId},{now:()=>new Date(),findMembership:async()=>({tenantId,userId:'user',role,status:'ACTIVE',version})});
const data=()=>({generatedAt:'2026-09-09T09:00:00Z',unifiedSettlement:{period_start:'2026-08-10T09:00:00Z',period_end:'2026-09-09T09:00:00Z',channels:[],waterfall:{actual_payout:12,actual_payout_complete:false},raw_data:{secret:'DO_NOT_RETURN'}}});
test('settlement requires bound owner and blocks wrong business before loading',async()=>{
 let loads=0;
 for(const [id,role] of [[B,'OWNER'],[A,'VIEWER'],[A,'OPERATOR']]){
  const response=await create({resolveContext:()=>context(id,role),readSettlement:async()=>{loads++;return data();}})(request(id));
  assert.equal(response.status,403);
 }
 assert.equal(loads,0);
});
test('settlement returns only the approved 30-day projection after two permission checks',async()=>{
 const order=[];
 const response=await create({resolveContext:()=>{order.push('auth');return context();},readSettlement:async()=>{order.push('read');return data();}})(request());
 assert.equal(response.status,200);assert.deepEqual(order,['auth','read','auth']);
 const body=await response.json();assert.equal(body.ok,true);assert.equal(body.period.days,30);assert.deepEqual(body.summary.actual,{value:12,status:'PARTIAL'});
 assert.doesNotMatch(JSON.stringify(body),/DO_NOT_RETURN|raw_data/);
 assert.match(response.headers.get('cache-control'),/private.*no-store/);
});
test('revocation and membership version drift discard settlement data',async()=>{
 for(const role of ['VIEWER','OWNER']){let count=0;
  const response=await create({resolveContext:()=>++count===1?context():context(A,role,2),readSettlement:async()=>data()})(request());
  assert.equal(response.status,role==='OWNER'?409:403);assert.doesNotMatch(await response.text(),/summary|actual/);
 }
});
test('unsupported period, extra query, missing cookie and non-GET fail before dependencies',async()=>{
 let calls=0;const handle=create({resolveContext:async()=>{calls++;return context();},readSettlement:async()=>{calls++;return data();}});
 for(const req of [request(A,'?days=7'),request(A,'?tenantId='+B),new Request(request().url),new Request(request(),{method:'POST'})])assert.notEqual((await handle(req)).status,200);
 assert.equal(calls,0);
});
test('timeout never starts a late read and sanitizes internal failures',async()=>{
 let release,loads=0;
 const response=await create({timeoutMs:5,resolveContext:()=>new Promise(resolve=>release=resolve),readSettlement:async()=>{loads++;return data();}})(request());
 assert.equal(response.status,504);release(await context());await new Promise(setImmediate);assert.equal(loads,0);
 const failed=await create({resolveContext:()=>context(),readSettlement:async()=>{throw Error('PRIVATE_SQL');}})(request());
 assert.equal(failed.status,503);assert.doesNotMatch(await failed.text(),/PRIVATE_SQL/);
});
