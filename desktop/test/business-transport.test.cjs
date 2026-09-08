'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs');
const file=require('node:path').join(__dirname,'../business-transport.cjs');
const create=options=>{assert.ok(fs.existsSync(file),'business transport must exist');return require(file).createBusinessTransport(options);};
const row={tenantId:'10000000-0000-4000-8000-000000000001',displayName:'하린식품',role:'OWNER',membershipVersion:1};
test('only main process fixed business GET is allowed',()=>{
 const {isAllowedRemoteRequest}=require('../connection-policy.cjs');
 const url='https://harin-cafe24-sync.vercel.app/api/moaon/businesses';
 assert.equal(isAllowedRemoteRequest({url,method:'GET',webContentsId:0}),true);
 for(const details of [{url,method:'POST'},{url:url+'?tenant=x',method:'GET'},{url,method:'GET',webContentsId:12}])assert.equal(isAllowedRemoteRequest(details),false);
});
test('business read uses a fixed credentialed GET and projects only picker fields',async()=>{
 const read=create({fetch:async(url,options)=>{
  assert.equal(url,'https://harin-cafe24-sync.vercel.app/api/moaon/businesses');
  assert.equal(options.method,'GET');assert.equal(options.credentials,'include');assert.equal(options.redirect,'error');assert.equal(options.cache,'no-store');
  return Response.json({ok:true,businesses:[{...row,secret:'private'}]});
 }});
 assert.deepEqual(await read(),{status:'READY',businesses:[row]});
});
test('business errors never reuse previous successful rows',async()=>{
 let response=Response.json({ok:true,businesses:[]});
 const read=create({fetch:async()=>response});
 assert.deepEqual(await read(),{status:'READY',businesses:[]});
 for(const [http,status] of [[401,'LOGIN_REQUIRED'],[403,'FORBIDDEN'],[504,'TIMEOUT'],[503,'UNAVAILABLE']]){
  response=Response.json({secret:'internal'}, {status:http});
  assert.deepEqual(await read(),{status,businesses:[]});
 }
});
test('invalid or duplicate business rows fail closed',async()=>{
 for(const businesses of [[{...row,role:'ADMIN'}],[row,row],[{...row,membershipVersion:0}],Array(201).fill(row)]){
  const read=create({fetch:async()=>Response.json({ok:true,businesses})});
  assert.deepEqual(await read(),{status:'UNAVAILABLE',businesses:[]});
 }
});
test('deadline settles even when transport ignores abort; cancellation never returns rows',async()=>{
 const read=create({fetch:()=>new Promise(()=>{}),timeoutMs:10});
 assert.deepEqual(await read(),{status:'TIMEOUT',businesses:[]});
 const controller=new AbortController();controller.abort();
 assert.deepEqual(await read({signal:controller.signal}),{status:'CANCELLED',businesses:[]});
});
test('oversized body is rejected',async()=>{
 const read=create({fetch:async()=>new Response('x'.repeat(262145))});
 assert.deepEqual(await read(),{status:'UNAVAILABLE',businesses:[]});
});
