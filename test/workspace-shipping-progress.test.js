'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createWorkspaceShippingProgressRequest}=require('../lib/tenancy/workspace-shipping-progress-request.js');
const {createShippingProgressReader}=require('../lib/shipping/progress-reader.js');
const A='a3452bca-e259-40ed-a93d-b8bcc5c1b9e0',id='HR-C24-AAAAAAAA',req='12345678-1234-4234-8234-123456789012',at='2026-10-24T06:00:00.000Z';
const request=(query='?targets='+id,tenant=A)=>new Request(`https://hub.example/api/moaon/businesses/${tenant}/shipping-progress${query}`,{headers:{cookie:'harin_dashboard_session=abc.def'}});
const context=(tenantId=A,role='OWNER',version=1)=>require('../lib/tenancy/context.js').resolveTenantContext({session:{id:'session',userId:'user',expiresAt:'2099-01-01'},requestedTenantId:tenantId},{now:()=>new Date(),findMembership:async()=>({userId:'user',tenantId,role,status:'ACTIVE',version})});
const state=()=>({hubOrderId:id,platform:'CAFE24',phase:'ISSUE',status:'RUNNING',requestId:req,createdAt:at,updatedAt:at,nextAttemptAt:null});
test('progress read rechecks identity and strips private fields before response',async()=>{
 let checks=0;const handle=createWorkspaceShippingProgressRequest({resolveContext:()=>{checks++;return context();},readProgress:async targets=>{assert.equal(checks,1);assert.deepEqual(targets,[{hubOrderId:id}]);return [{...state(),receiver:'PRIVATE'}];}});
 const r=await handle(request());assert.equal(r.status,200);const p=await r.json();assert.equal(checks,2);assert.equal(p.items[0].receiver,undefined);assert.equal(p.scopeKey.length,64);
});
test('foreign business, nonowner, revoked session and malformed requests cannot expose progress',async()=>{
 let reads=0;for(const ctx of [await context('10000000-0000-4000-8000-000000000002'),await context(A,'VIEWER'),await context(A,'OPERATOR')]){const handle=createWorkspaceShippingProgressRequest({resolveContext:()=>ctx,readProgress:()=>{reads++;return [state()];}});assert.equal((await handle(request())).status,403);}assert.equal(reads,0);
 let checks=0;const handle=createWorkspaceShippingProgressRequest({resolveContext:()=>context(A,'OWNER',++checks),readProgress:()=>[state()]});assert.equal((await handle(request())).status,409);
 for(const q of ['','?targets='+id+'&tenantId=x','?targets='+id+'&targets='+id,'?targets='+id+','+id])assert.equal((await handle(request(q))).status,400);
});
test('timeout discards late identity and never reads after deadline',async()=>{
 let release,reads=0;const h=createWorkspaceShippingProgressRequest({timeoutMs:5,resolveContext:()=>new Promise(r=>release=r),readProgress:()=>{reads++;return [state()];}});assert.equal((await h(request())).status,504);release(await context());await new Promise(r=>setTimeout(r,10));assert.equal(reads,0);
});
function db(operations,identities=[]){const calls=[];return {calls,from(table){const call={table};calls.push(call);const q={select(s){call.select=s;return q;},in(k,v){call[k]=v;return q;},order(){return q;},limit(n){call.limit=n;return q;},abortSignal(){return q;},then(resolve){return Promise.resolve({data:table==='coupang_orders'?identities:operations,error:null}).then(resolve);}};return q;}};}
test('reader queries only bounded targets, keeps issued success distinct from registration',async()=>{
 const d=db([{id:req,operation_type:'EPOST_LIVE_ISSUE',target_type:'HUB_ORDER',target_id:id,status:'SUCCESS',created_at:at,executed_at:at}]);const read=createShippingProgressReader({db:d});const r=await read([{hubOrderId:id}],{});assert.equal(r[0].phase,'ISSUE');assert.equal(r[0].status,'SUCCESS');assert.deepEqual(d.calls[0].target_id,[id]);assert.doesNotMatch(d.calls[0].select,/payload|result_json|error_message/);
 const empty=await createShippingProgressReader({db:db([])})([{hubOrderId:id}],{});assert.equal(empty[0].status,'UNKNOWN');
});
test('Coupang shipment identities must match canonical order before reading operations',async()=>{
 const target={hubOrderId:'HR-CP-BBBBBBBB',shipmentId:'123'};const d=db([],[{shipment_box_id:'123',order_id:'wrong'}]);await assert.rejects(()=>createShippingProgressReader({db:d})([target],{}));assert.equal(d.calls.length,1);
});
test('separate Coupang shipping bundles cannot borrow each other registration state',async()=>{
 const {hubOrderId}=require('../lib/orders/unified-orders.js'),a=hubOrderId('COUPANG','ORDER','111'),b=hubOrderId('COUPANG','ORDER','222');
 const d=db([{id:req,operation_type:'UPLOAD_INVOICE',target_type:'ORDER',target_id:'111',status:'SUCCESS',created_at:at,executed_at:at}],[{shipment_box_id:'111',order_id:'ORDER'},{shipment_box_id:'222',order_id:'ORDER'}]);
 const rows=await createShippingProgressReader({db:d})([{hubOrderId:a,shipmentId:'111'},{hubOrderId:b,shipmentId:'222'}],{});assert.equal(rows[0].status,'REGISTERED');assert.equal(rows[1].status,'UNKNOWN');assert.equal(d.calls.length,2);
});
