'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {buildOrdersScopeUrl,buildOrdersPageUrl,isAllowedRemoteRequest}=require('../connection-policy.cjs');
const base='https://harin-cafe24-sync.vercel.app/api/moaon/businesses/a3452bca-e259-40ed-a93d-b8bcc5c1b9e0/orders';
test('all order scopes and pagination use the bound workspace path',()=>{
 for(const stage of ['ACTIVE','REGISTER','IN_TRANSIT','COMPLETED']){
  const url=`${base}?stage=${stage}&platform=ALL`;
  assert.equal(buildOrdersScopeUrl(stage),url);
  assert.equal(buildOrdersPageUrl(20,'a'.repeat(64),stage),`${url}&offset=20&snapshot=${'a'.repeat(64)}`);
  assert.equal(isAllowedRemoteRequest({method:'GET',url,webContentsId:0}),true);
 }
});
test('legacy, other business, renderer, write and extra tenant parameter stay denied',()=>{
 const url=base+'?stage=ACTIVE&platform=ALL';
 for(const details of [
  {url:url.replace(/\/api\/moaon\/businesses\/[^/]+\/orders/,'/api/orders/page')},
  {url:url.replace('a3452bca-e259-40ed-a93d-b8bcc5c1b9e0','10000000-0000-4000-8000-000000000002')},
  {url,webContentsId:42},{url,method:'POST'},{url:url+'&tenantId=other'},
 ])assert.equal(isAllowedRemoteRequest({method:'GET',webContentsId:0,...details}),false);
});
