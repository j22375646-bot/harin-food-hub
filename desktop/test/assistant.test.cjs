'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createAssistantTransport,ASSISTANT_URL}=require('../assistant-transport.cjs');
const {isAllowedRemoteRequest}=require('../connection-policy.cjs');
const empty={ok:true,status:'PARTIAL',writePolicy:'READ_ONLY',sourcePolicy:'STORED_DATA',externalAgent:'NOT_CONNECTED',retrievedAt:'2026-09-16T00:00:00Z',sources:Object.fromEntries(['orders','tasks','cs','reports'].map(k=>[k,{status:'UNAVAILABLE',sourceAsOf:null}])),caveats:[]};
test('assistant transport uses fixed GET and projects only allowed data',async()=>{
 const read=createAssistantTransport({fetch:async(url,options)=>{assert.equal(url,ASSISTANT_URL);assert.equal(options.method,'GET');assert.equal(options.credentials,'include');assert.equal(options.redirect,'error');return Response.json({...empty,secret:'NEVER_RETURN'});}});
 const r=await read();assert.equal(r.status,'PARTIAL');assert.equal(r.sources.orders.status,'UNAVAILABLE');assert.doesNotMatch(JSON.stringify(r),/NEVER_RETURN/);
});
test('assistant transport fails closed on auth, malformed, oversized, cancellation',async()=>{
 for(const response of [new Response('',{status:401}),Response.json({ok:true}),new Response('x'.repeat(262145))]){const r=await createAssistantTransport({fetch:async()=>response})();assert.ok(['LOGIN_REQUIRED','UNAVAILABLE'].includes(r.status));}
 const c=new AbortController();c.abort();let called=false;assert.equal((await createAssistantTransport({fetch:async()=>{called=true;}})({signal:c.signal})).status,'CANCELLED');assert.equal(called,false);
});
test('assistant remote request permit cannot authorize renderer, writes, or arbitrary urls',()=>{
 const d={url:ASSISTANT_URL,method:'GET',webContentsId:-1};assert.equal(isAllowedRemoteRequest(d,{assistantPermit:ASSISTANT_URL}),true);assert.equal(isAllowedRemoteRequest(d,{}),false);assert.equal(isAllowedRemoteRequest({...d,method:'POST'},{assistantPermit:ASSISTANT_URL}),false);assert.equal(isAllowedRemoteRequest({...d,url:ASSISTANT_URL+'?tenant=other'},{assistantPermit:ASSISTANT_URL}),false);assert.equal(isAllowedRemoteRequest({...d,webContentsId:1},{assistantPermit:ASSISTANT_URL}),false);
});
