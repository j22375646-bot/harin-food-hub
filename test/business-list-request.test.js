'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {createBusinessListRequest}=require('../lib/tenancy/business-list-request.js');
const request=(headers={},suffix='')=>new Request('https://hub.example/api/moaon/businesses'+suffix,{headers:{cookie:'harin_dashboard_session=abc.def',...headers}});
const business={tenantId:'10000000-0000-4000-8000-000000000001',displayName:'사업장 A',role:'OWNER',membershipVersion:1};
test('unconfigured request returns setup required and never a fabricated business',async()=>{
 const response=await createBusinessListRequest()(request());
 assert.equal(response.status,503);assert.deepEqual(await response.json(),{ok:false,code:'SETUP_REQUIRED'});
 assert.equal(response.headers.get('cache-control'),'no-store');
});
test('cookie only feeds the trusted store; response strips extra fields',async()=>{
 const handle=createBusinessListRequest({listBusinesses:async input=>{
  assert.deepEqual(input,{sessionCredential:'abc.def'});return [{...business,secret:'hidden'}];
 }});
 const response=await handle(request());assert.equal(response.status,200);
 assert.deepEqual(await response.json(),{ok:true,businesses:[business]});
 assert.equal(response.headers.get('cache-control'),'no-store');
 assert.equal(response.headers.get('access-control-allow-origin'),null);
});
test('missing duplicate or malformed cookies never invoke store',async()=>{
 let calls=0;const handle=createBusinessListRequest({listBusinesses:async()=>{calls++;return [];}});
 for(const cookie of ['', 'other=x','harin_dashboard_session=x','harin_dashboard_session=abc.def; harin_dashboard_session=abc.def','harin_dashboard_session='+ 'x'.repeat(17000)]){
  assert.equal((await handle(request({cookie}))).status,401);
 }
 assert.equal(calls,0);
});
test('cross site and query identity requests never invoke store',async()=>{
 let calls=0;const handle=createBusinessListRequest({listBusinesses:async()=>{calls++;return [];}});
 assert.equal((await handle(request({origin:'https://evil.example'}))).status,403);
 assert.equal((await handle(request({'sec-fetch-site':'cross-site'}))).status,403);
 assert.equal((await handle(request({},'?userId=someone'))).status,400);
 assert.equal(calls,0);
});
test('known failures keep safe status while internal errors are hidden',async()=>{
 for(const [code,status] of [['AUTH_REQUIRED',401],['BUSINESS_LIST_LIMIT',409],['private query secret',503],['constructor',503],['__proto__',503]]){
  const response=await createBusinessListRequest({listBusinesses:async()=>{throw Object.assign(Error('private details'),{code});}})(request());
  assert.equal(response.status,status);assert.doesNotMatch(await response.text(),/private|query|secret/);
 }
});
test('empty success differs from invalid data and stalled work',async()=>{
 assert.deepEqual(await (await createBusinessListRequest({listBusinesses:async()=>[]})(request())).json(),{ok:true,businesses:[]});
 for(const data of [null,[{...business,role:'ADMIN'}],[business,business],[{...business,membershipVersion:0}]]){
  assert.equal((await createBusinessListRequest({listBusinesses:async()=>data})(request())).status,503);
 }
 const response=await createBusinessListRequest({listBusinesses:()=>new Promise(()=>{}),timeoutMs:10})(request());
 assert.equal(response.status,504);
});
