'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {createBusinessListRuntime}=require('../lib/tenancy/business-list-runtime.js');
const validRequest=(headers={},suffix='')=>new Request('https://hub.example/api/moaon/businesses'+suffix,{headers:{cookie:'harin_dashboard_session=abc.def',...headers}});
const business={tenantId:'10000000-0000-4000-8000-000000000001',displayName:'事業場 A',role:'OWNER',membershipVersion:1};
function harness(overrides={}){
 const state={databaseCalls:0,identityCalls:0,serviceCalls:0,closeCalls:0,inputs:[]};
 const database={async close(){state.closeCalls++;}};
 const identityDb={from(){}};const authAdmin={getUserById(){}};
 const runtime=createBusinessListRuntime({env:{MOAON_CONTROL_DB_HOST:'configured'},createControlDatabase(){state.databaseCalls++;return database;},createIdentityClient(){state.identityCalls++;return {from:identityDb.from,auth:{admin:authAdmin}};},createService(input){state.serviceCalls++;state.inputs.push(input);return async()=>new Response(JSON.stringify({ok:true,businesses:[business]}),{status:200,headers:{'cache-control':'no-store','content-type':'application/json'}});},...overrides});
 return {runtime,state,database,identityDb,authAdmin};
}
test('server supplied request guard supports a scoped read before initializing',async()=>{
 let calls=0;
 const {runtime,state}=harness({guardRequest:()=>{calls++;return {sessionCredential:'abc.def'};}});
 assert.equal((await runtime.handle(validRequest({},'?stage=before-issue'))).status,200);
 assert.equal(calls,1);assert.equal(state.databaseCalls,1);await runtime.close();
});
test('request guards reject before runtime initialization',async()=>{
 const {runtime,state}=harness();
 for(const request of [new Request('https://hub.example/api/moaon/businesses'),validRequest({origin:'https://evil.example'}),validRequest({},'?userId=someone')])assert.notEqual((await runtime.handle(request)).status,200);
 assert.equal(state.databaseCalls,0);await runtime.close();
});
test('missing control settings stay setup required without identity initialization',async()=>{
 const {runtime,state}=harness({createControlDatabase(){state.databaseCalls++;return null;}});const response=await runtime.handle(validRequest());
 assert.equal(response.status,503);assert.deepEqual(await response.json(),{ok:false,code:'SETUP_REQUIRED'});assert.equal(response.headers.get('cache-control'),'no-store');assert.equal(state.identityCalls,0);
});
test('invalid runtime composition is sanitized and a partial adapter is closed',async()=>{
 const {runtime,state}=harness({createIdentityClient(){state.identityCalls++;throw Error('SUPABASE_SERVICE_ROLE_KEY private');}});const response=await runtime.handle(validRequest());
 assert.equal(response.status,503);const text=await response.text();assert.deepEqual(JSON.parse(text),{ok:false,code:'BUSINESS_LIST_UNAVAILABLE'});assert.doesNotMatch(text,/SUPABASE|private/);assert.equal(state.closeCalls,1);
});
test('configured composition passes only restricted database and identity dependencies',async()=>{
 const {runtime,state,database,authAdmin}=harness();const response=await runtime.handle(validRequest());assert.equal(response.status,200);
 assert.equal(state.inputs[0].database,database);assert.equal(state.inputs[0].authAdmin,authAdmin);assert.equal(typeof state.inputs[0].identityDb.from,'function');assert.deepEqual(Object.keys(state.inputs[0]).sort(),['authAdmin','database','identityDb']);
 await runtime.close();assert.equal(state.closeCalls,1);
});
test('successful initialization is reused without caching user responses',async()=>{
 let requests=0;const {runtime,state}=harness({createService(){state.serviceCalls++;return async()=>new Response(JSON.stringify({ok:true,businesses:[{...business,membershipVersion:++requests}]}),{status:200,headers:{'cache-control':'no-store','content-type':'application/json'}});}});
 assert.equal((await (await runtime.handle(validRequest())).json()).businesses[0].membershipVersion,1);assert.equal((await (await runtime.handle(validRequest())).json()).businesses[0].membershipVersion,2);assert.equal(state.databaseCalls,1);assert.equal(state.identityCalls,1);assert.equal(state.serviceCalls,1);await runtime.close();
});
test('failed initialization is retried and cleans each partial adapter',async()=>{
 let attempts=0;const {runtime,state}=harness({createIdentityClient(){state.identityCalls++;if(++attempts===1)throw Error('first failure');return {from(){},auth:{admin:{}}};}});
 assert.equal((await runtime.handle(validRequest())).status,503);assert.equal((await runtime.handle(validRequest())).status,200);assert.equal(state.databaseCalls,2);assert.equal(state.closeCalls,1);assert.equal(state.serviceCalls,1);await runtime.close();assert.equal(state.closeCalls,2);
});
