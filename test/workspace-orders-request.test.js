'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {resolveTenantContext}=require('../lib/tenancy/context.js');
const modPath='../lib/tenancy/workspace-orders-request.js';
const A='a3452bca-e259-40ed-a93d-b8bcc5c1b9e0';
const B='10000000-0000-4000-8000-000000000002';
const request=(id=A,query='?stage=before-issue')=>new Request(`https://hub.example/api/moaon/businesses/${id}/orders${query}`,{headers:{cookie:'harin_dashboard_session=abc.def'}});
async function context(tenantId=A,role='OWNER',version=1){
 return resolveTenantContext({session:{id:'session',userId:'user',expiresAt:'2099-01-01'},requestedTenantId:tenantId},{now:()=>new Date(),findMembership:async()=>({userId:'user',tenantId,role,status:'ACTIVE',version})});
}
function factory(){const fs=require('node:fs');assert.ok(fs.existsSync(require('node:path').join(__dirname,modPath)),'workspace request implementation required');return require(modPath).createWorkspaceOrdersRequest;}
test('bound owner reads orders only after authorization, and rechecks before returning',async()=>{
 const create=factory();let checks=0,reads=0;
 const handle=create({resolveContext:async input=>{assert.equal(input.sessionCredential,'abc.def');assert.equal(input.tenantId,A);checks++;return context();},readOrders:async()=>{assert.equal(checks,1);reads++;return Response.json({ok:true,orders:[{id:'stored-order'}]});}});
 const result=await handle(request());assert.equal(result.status,200);assert.equal(checks,2);assert.equal(reads,1);assert.equal((await result.json()).orders[0].id,'stored-order');assert.match(result.headers.get('cache-control'),/no-store/);
});
test('unbound business and non-owner never reach legacy orders',async()=>{
 const create=factory();let reads=0;
 for(const [tenant,role] of [[B,'OWNER'],[A,'VIEWER'],[A,'OPERATOR']]){
  const handle=create({resolveContext:()=>context(tenant,role),readOrders:async()=>{reads++;return Response.json({secret:true});}});
  assert.equal((await handle(request(tenant))).status,403);
 }assert.equal(reads,0);
});
test('role/version/session changes and revoked membership discard fetched data',async()=>{
 const create=factory();
 for(const second of [()=>context(A,'VIEWER'),()=>context(A,'OWNER',2),async()=>{throw Object.assign(Error('private'),{code:'TENANT_ACCESS_DENIED'});},async()=>({...await context(),sessionId:'other'})]){
  let checks=0;const handle=create({resolveContext:()=>++checks===1?context():second(),readOrders:async()=>Response.json({privateOrder:'never expose'})});
  const result=await handle(request());assert.notEqual(result.status,200);assert.doesNotMatch(await result.text(),/never expose|private/);
 }
});
test('guards reject malformed path, extra identity query, duplicate query and cross site before auth',async()=>{
 const create=factory();let checks=0;
 const handle=create({resolveContext:async()=>{checks++;return context();},readOrders:async()=>Response.json({ok:true})});
 const inputs=[request('bad'),request(A,'?tenantId='+B),request(A,'?stage=a&stage=b'),new Request(request(),{method:'POST'}),new Request(request(),{headers:{origin:'https://evil.example',cookie:'harin_dashboard_session=abc.def'}}),new Request(request().url)];
 for(const input of inputs)assert.notEqual((await handle(input)).status,200);
 assert.equal(checks,0);
});
test('deadline before auth finishes cannot start an orders read later',async()=>{
 const create=factory();let reads=0,release;
 const handle=create({timeoutMs:5,resolveContext:()=>new Promise(resolve=>{release=resolve;}),readOrders:async()=>{reads++;return Response.json({ok:true});}});
 assert.equal((await handle(request())).status,504);release(await context());await new Promise(resolve=>setTimeout(resolve,10));assert.equal(reads,0);
});
