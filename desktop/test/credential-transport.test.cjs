'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createCredentialTransport}=require('../credential-transport.cjs');
const {isAllowedRemoteRequest,HARIN_ORIGIN}=require('../connection-policy.cjs');
const tenantId='10000000-0000-4000-8000-000000000001',provider='NAVER',identity={tenantId,provider};
const input={...identity,expectedRevision:0,fields:{clientId:'synthetic',clientSecret:'synthetic-secret'}};
const owner=async()=>({status:'READY',businesses:[{tenantId,role:'OWNER',membershipVersion:1}]});
const success=(revision=1)=>({ok:true,...identity,revision,status:revision?'SAVED_UNVERIFIED':'NOT_SAVED'});
const create=opts=>createCredentialTransport({authorize:owner,permit:()=>{},...opts});
test('fresh OWNER authorizes each operation and success returns metadata only with exact request permits',async()=>{
 let permit=null,auth=0,calls=0;
 const transport=create({authorize:async()=>{auth++;return owner();},permit:value=>{permit=value;},fetch:async(url,options)=>{calls++;assert.deepEqual(permit,{url,method:options.method});assert.equal(isAllowedRemoteRequest({url,method:options.method,webContentsId:0},{credentialPermit:permit}),true);assert.equal(isAllowedRemoteRequest({url,method:options.method,webContentsId:7},{credentialPermit:permit}),false);assert.equal(options.headers.Origin,HARIN_ORIGIN);assert.equal(options.redirect,'error');assert.equal(options.cache,'no-store');assert.equal(options.credentials,'include');if(options.method==='POST')assert.deepEqual(JSON.parse(options.body),input);return Response.json({...success(options.method==='GET'?0:1),secret:'never'});}});
 assert.deepEqual(await transport.read(identity),{...identity,revision:0,status:'NOT_SAVED'});assert.equal(permit,null);
 assert.deepEqual(await transport.save(input),{...identity,revision:1,status:'SAVED_UNVERIFIED'});assert.equal(permit,null);assert.equal(auth,2);assert.equal(calls,2);
});
test('failed fresh owner check and malformed schema never send credentials',async()=>{
 let calls=0;for(const proof of [{status:'UNAVAILABLE',businesses:[]},{status:'READY',businesses:[{tenantId,role:'VIEWER'}]},{status:'READY',businesses:[]}]){assert.equal((await create({authorize:async()=>proof,fetch:async()=>{calls++;}}).save(input)).status,proof.status==='READY'?'ACCESS_DENIED':'UNAVAILABLE');}
 const t=create({fetch:async()=>{calls++;}});for(const bad of [{...input,extra:1},{...input,expectedRevision:-1},{...input,fields:{...input.fields,extra:'x'}},{...input,tenantId:'bad'}])assert.deepEqual(await t.save(bad),{status:'INVALID'});assert.equal(calls,0);
});
test('POST known failures map safely and unknown network/status/success never invite retry',async()=>{
 for(const [http,code,status] of [[404,'x','SETUP_REQUIRED'],[503,'SETUP_REQUIRED','SETUP_REQUIRED'],[401,'x','ACCESS_DENIED'],[403,'x','ACCESS_DENIED'],[429,'x','RATE_LIMITED'],[409,'x','CONFLICT'],[400,'x','INVALID'],[503,'CREDENTIAL_RESULT_UNKNOWN','RESULT_UNKNOWN'],[500,'x','RESULT_UNKNOWN']]){let calls=0;assert.deepEqual(await create({fetch:async()=>{calls++;return Response.json({code,secret:'private'},{status:http});}}).save(input),{status});assert.equal(calls,1);}
 for(const fetch of [async()=>{throw Error('secret');},async()=>Response.json({...success(),revision:3}),async()=>new Response('bad')])assert.deepEqual(await create({fetch}).save(input),{status:'RESULT_UNKNOWN'});
});
test('busy, cancellation and late response do not produce success or duplicate POST',async()=>{
 let release,started,permit;const entered=new Promise(r=>started=r);let calls=0;
 const t=create({permit:v=>permit=v,fetch:async()=>{calls++;started();return new Promise(r=>release=r);}});
 const pending=t.save(input);await entered;assert.deepEqual(await t.save(input),{status:'BUSY'});t.cancel();assert.deepEqual(await pending,{status:'RESULT_UNKNOWN'});assert.equal(permit,null);release(Response.json(success()));await new Promise(setImmediate);assert.equal(calls,1);
});
test('timeout during authorization cannot start a late POST; response body has a strict bound',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});let release,entered,posts=0;const started=new Promise(r=>entered=r);const transport=create({timeoutMs:100,authorize:()=>{entered();return new Promise(r=>release=r);},fetch:async()=>{posts++;}});const pending=transport.save(input);await started;t.mock.timers.tick(100);assert.deepEqual(await pending,{status:'UNAVAILABLE'});release(await owner());await new Promise(setImmediate);assert.equal(posts,0);
 assert.deepEqual(await create({fetch:async()=>new Response('x'.repeat(16385))}).read(identity),{status:'UNAVAILABLE'});
});
test('credential policy has no ambient permission, alternate query/path/method or renderer escape',()=>{
 const url=HARIN_ORIGIN+'/api/moaon/credentials',get=url+'?tenantId='+tenantId+'&provider=NAVER';
 for(const [value,method] of [[url,'POST'],[get,'GET']]){assert.equal(isAllowedRemoteRequest({url:value,method}),false);for(const bad of [value+'&extra=x',value+'#fragment',value.replace('/credentials','/credentials/'),value.replace('https:','http:')])assert.equal(isAllowedRemoteRequest({url:bad,method},{credentialPermit:{url:bad,method}}),false);}
});
test('POST timeout after dispatch is unknown and late body cannot release success',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});let entered,release,permit;const started=new Promise(r=>entered=r);
 const transport=create({timeoutMs:100,permit:v=>permit=v,fetch:async()=>{entered();return new Promise(r=>release=r);}});const pending=transport.save(input);await started;t.mock.timers.tick(100);assert.deepEqual(await pending,{status:'RESULT_UNKNOWN'});assert.equal(permit,null);release(Response.json(success()));await new Promise(setImmediate);
});
test('GET malformed metadata and setup failures remain explicit, never revision zero',async()=>{
 for(const payload of [{ok:true,...identity,revision:0,status:'SAVED_UNVERIFIED'},{...success(0),tenantId:'20000000-0000-4000-8000-000000000001'},{...success(0),revision:'0'}])assert.deepEqual(await create({fetch:async()=>Response.json(payload)}).read(identity),{status:'UNAVAILABLE'});
 assert.deepEqual(await create({fetch:async()=>new Response('<html>missing</html>',{status:404})}).read(identity),{status:'SETUP_REQUIRED'});
});
test('save snapshots fields and revision before fresh OWNER asynchronous boundary',async()=>{
 let release,entered;const started=new Promise(r=>entered=r),value=structuredClone(input);let sent;
 const transport=create({authorize:async()=>{entered();return new Promise(r=>release=r);},fetch:async(_url,options)=>{sent=JSON.parse(options.body);return Response.json(success());}});
 const pending=transport.save(value);await started;value.fields.clientSecret='changed';value.expectedRevision=9;release(await owner());assert.equal((await pending).status,'SAVED_UNVERIFIED');assert.deepEqual(sent,input);
});
