'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {isAllowedRemoteRequest}=require('../connection-policy.cjs');
const URL='https://harin-cafe24-sync.vercel.app/api/moaon/businesses/a3452bca-e259-40ed-a93d-b8bcc5c1b9e0/finance';
const payload={ok:true,month:'2026-09',generatedAt:'2026-09-09T01:02:03.000Z',metrics:{sales:{value:0,status:'READY'},profit:{value:-1200,status:'READY'},balance:{value:null,status:'BLOCKED'}}};

test('finance allowlist permits only the exact main-process GET',()=>{
 assert.equal(isAllowedRemoteRequest({url:URL,method:'GET',webContentsId:0},{financePermit:URL}),true);
 for(const request of [{url:URL,method:'POST',webContentsId:0},{url:URL+'?tenant=x',method:'GET',webContentsId:0},{url:URL.replace('a3452bca-e259-40ed-a93d-b8bcc5c1b9e0','10000000-0000-4000-8000-000000000002'),method:'GET',webContentsId:0},{url:URL,method:'GET',webContentsId:7}])assert.equal(isAllowedRemoteRequest(request,{financePermit:URL}),false);
 assert.equal(isAllowedRemoteRequest({url:URL,method:'GET',webContentsId:0}),false);
});

test('finance transport preserves true zero and negative values and strips unknown fields',async()=>{
 const {createFinanceTransport}=require('../finance-transport.cjs');
 const read=createFinanceTransport({fetch:async(url,options)=>{assert.equal(url,URL);assert.deepEqual({method:options.method,credentials:options.credentials,cache:options.cache,redirect:options.redirect},{method:'GET',credentials:'include',cache:'no-store',redirect:'error'});return Response.json({...payload,private:'secret'});}});
 assert.deepEqual(await read(),{status:'READY',month:'2026-09',generatedAt:'2026-09-09T01:02:03.000Z',metrics:payload.metrics});
});

test('finance transport rejects coercion, malformed dates, unknown statuses and missing metrics',async()=>{
 const {createFinanceTransport}=require('../finance-transport.cjs');
 for(const bad of [
  {...payload,month:'2026-9'},
  {...payload,generatedAt:'today'},
  {...payload,generatedAt:'2026-09-09'},
  {...payload,metrics:{...payload.metrics,sales:{value:'0',status:'READY'}}},
  {...payload,metrics:{...payload.metrics,profit:{value:1,status:'UNKNOWN'}}},
  {...payload,metrics:{sales:payload.metrics.sales,profit:payload.metrics.profit}},
 ]){
  const read=createFinanceTransport({fetch:async()=>Response.json(bad)});
  assert.deepEqual(await read(),{status:'UNAVAILABLE',month:null,generatedAt:null,metrics:{sales:{value:null,status:'BLOCKED'},profit:{value:null,status:'BLOCKED'},balance:{value:null,status:'BLOCKED'}}});
 }
});

test('finance timeout, cancellation and oversized responses expose no values',async()=>{
 const {createFinanceTransport}=require('../finance-transport.cjs');
 const empty={month:null,generatedAt:null,metrics:{sales:{value:null,status:'BLOCKED'},profit:{value:null,status:'BLOCKED'},balance:{value:null,status:'BLOCKED'}}};
 assert.deepEqual(await createFinanceTransport({fetch:()=>new Promise(()=>{}),timeoutMs:10})(),{status:'TIMEOUT',...empty});
 const controller=new AbortController();controller.abort();
 assert.deepEqual(await createFinanceTransport({fetch:async()=>Response.json(payload)})({signal:controller.signal}),{status:'CANCELLED',...empty});
 assert.deepEqual(await createFinanceTransport({fetch:async()=>new Response('x'.repeat(262145))})(),{status:'UNAVAILABLE',...empty});
});
test('finance default client budget is 30 seconds, beyond server authorization and read budget',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});let done=false;
 const pending=require('../finance-transport.cjs').createFinanceTransport({fetch:()=>new Promise(()=>{})})().then(result=>{done=true;return result;});
 t.mock.timers.tick(25000);await new Promise(setImmediate);assert.equal(done,false);
 t.mock.timers.tick(5000);assert.equal((await pending).status,'TIMEOUT');
});
