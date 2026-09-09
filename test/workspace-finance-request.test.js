'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {resolveTenantContext}=require('../lib/tenancy/context.js');
const A='a3452bca-e259-40ed-a93d-b8bcc5c1b9e0';
const B='10000000-0000-4000-8000-000000000002';
const request=(id=A)=>new Request(`https://hub.example/api/moaon/businesses/${id}/finance`,{headers:{cookie:'harin_dashboard_session=abc.def'}});
async function context(tenantId=A,role='OWNER'){
 return resolveTenantContext({session:{id:'session',userId:'user',expiresAt:'2099-01-01'},requestedTenantId:tenantId},{now:()=>new Date(),findMembership:async()=>({userId:'user',tenantId,role,status:'ACTIVE',version:1})});
}
const create=()=>require('../lib/tenancy/workspace-finance-request.js').createWorkspaceFinanceRequest;

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
