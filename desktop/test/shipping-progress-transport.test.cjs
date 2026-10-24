'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createProgressTransport}=require('../shipping-progress-transport.cjs');
const {BASE,TENANT}=require('../shipping-progress-contract.cjs');
const {isAllowedRemoteRequest}=require('../connection-policy.cjs');
const id='HR-C24-AAAAAAAA',targets=[{hubOrderId:id}],at='2026-10-24T06:00:00.000Z';
const feed=()=>({ok:true,contract:1,tenantId:TENANT,scopeKey:'a'.repeat(64),checkedAt:at,partial:false,items:[{hubOrderId:id,platform:'CAFE24',phase:'QUEUE',status:'UNKNOWN',requestId:null,createdAt:null,updatedAt:null,nextAttemptAt:null}]});
test('progress transport issues one fixed Main-only GET and projects safe data',async()=>{
 const permits=[],calls=[];const transport=createProgressTransport({fetch:async(url,options)=>{calls.push({url,options});return Response.json(feed());},permit:p=>permits.push(p)});
 const r=await transport.read(targets);assert.equal(r.status,'READY');assert.equal(calls.length,1);assert.equal(calls[0].options.method,'GET');assert.equal(calls[0].options.body,undefined);assert.equal(calls[0].url,BASE+'?targets='+id);assert.equal(permits.at(-1),null);
 const url=calls[0].url,context={progressPermit:url};assert.equal(isAllowedRemoteRequest({url,method:'GET',webContentsId:-1},context),true);
 for(const details of [{url,method:'POST',webContentsId:-1},{url,method:'GET',webContentsId:12},{url:url+'&tenantId=other',method:'GET',webContentsId:-1}])assert.equal(isAllowedRemoteRequest(details,context),false);
});
test('bad or partial responses, authorization loss and missing server do not become empty success',async()=>{
 for(const [status,result] of [[401,'LOGIN_REQUIRED'],[403,'FORBIDDEN'],[404,'SETUP_REQUIRED'],[409,'WORKSPACE_CHANGED'],[429,'RATE_LIMITED']]){const read=createProgressTransport({fetch:async()=>new Response('',{status}),permit:()=>{}});assert.deepEqual(await read.read(targets),{status:result});}
 const p=feed();p.partial=true;assert.equal((await createProgressTransport({fetch:async()=>Response.json(p),permit:()=>{}}).read(targets)).status,'UNAVAILABLE');
});
test('abort-ignoring fetch has a deadline and duplicate polls do not overlap or retry',async()=>{
 let calls=0;const transport=createProgressTransport({fetch:()=>{calls++;return new Promise(()=>{});},permit:()=>{},timeoutMs:10});const first=transport.read(targets);assert.equal((await transport.read(targets)).status,'BUSY');assert.equal((await first).status,'TIMEOUT');assert.equal(calls,1);
 const cancelled=createProgressTransport({fetch:()=>new Promise(()=>{}),permit:()=>{}});const pending=cancelled.read(targets);cancelled.cancel();assert.equal((await pending).status,'CANCELLED');
});
