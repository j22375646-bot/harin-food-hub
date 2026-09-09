'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createCredentialRequestAdmission}=require('../lib/tenancy/credential-request-admission.js');
const {createCredentialSaveRequest}=require('../lib/tenancy/credential-request.js');
const userId='ABCDEF00-0000-4000-8000-000000000001';
const session=()=>({userId,expiresAt:'2099-01-01T00:00:00Z'});
const options={hmacKey:'k'.repeat(32),trustedClientIp:'127.0.0.1',verifySession:async()=>session(),timeoutMs:100};
const pause=ms=>new Promise(r=>setTimeout(r,ms));
test('network precedes same credential verification and normalized user quota; frozen safe result',async()=>{
 const calls=[]; const make=ip=>createCredentialRequestAdmission({...options,trustedClientIp:ip,verifySession:async value=>{calls.push(value);return session();},rpcClient:{rpc:async(name,args)=>{calls.push({name,args});return {data:true,error:null};}}});
 assert.deepEqual(await make('::ffff:127.0.0.1')('same.cookie'),{allowed:true}); const first=calls.splice(0);const result=await make('127.0.0.1')('same.cookie');assert.ok(Object.isFrozen(result));assert.deepEqual(calls,first);assert.equal(calls[1],'same.cookie');assert.equal(calls[0].name,'moaon_consume_credential_network');assert.equal(calls[2].name,'moaon_consume_credential_user');assert.notEqual(calls[0].args.p_ip_hash,calls[2].args.p_user_hash);assert.doesNotMatch(JSON.stringify([calls[0],calls[2]]),/127\.0|ABCDEF|same.cookie/);
});
test('denied network never verifies; malformed errors and invalid expired identity fail closed',async()=>{
 let verifies=0;const make=data=>createCredentialRequestAdmission({...options,verifySession:async()=>{verifies++;return session();},rpcClient:{rpc:async()=>({data,error:null})}});
 assert.deepEqual(await make(false)('a.b'),{allowed:false});assert.equal(verifies,0);
 for(const data of [null,{},1,'true'])await assert.rejects(make(data)('a.b'),{code:'CREDENTIAL_ADMISSION_UNAVAILABLE'});
 for(const identity of [null,{userId:'bad',expiresAt:'2099-01-01'},{userId,expiresAt:'2000-01-01'}]) {let calls=0;await assert.rejects(createCredentialRequestAdmission({...options,verifySession:async()=>identity,rpcClient:{rpc:async()=>{calls++;return {data:true,error:null};}}})('a.b'));assert.equal(calls,1);}
});
test('deadline and abort latch stop late network or verifier from starting user RPC',async()=>{
 for(const stage of ['network','verify'])for(const abort of [false,true]){let calls=0;const controller=new AbortController();const admission=createCredentialRequestAdmission({...options,timeoutMs:15,verifySession:async()=>{if(stage==='verify')await pause(50);return session();},rpcClient:{rpc:async()=>{calls++;if(stage==='network')await pause(50);return {data:true,error:null};}}});const pending=admission('a.b',{signal:controller.signal});if(abort)setTimeout(()=>controller.abort(),5);await assert.rejects(pending,{code:'CREDENTIAL_ADMISSION_UNAVAILABLE'});await pause(65);assert.equal(calls,1);}
});
const origin='https://hub.example';const request=signal=>new Request(origin+'/api/moaon/credentials',{method:'POST',signal,headers:{origin,'content-type':'application/json',cookie:'harin_dashboard_session=a.b'},body:JSON.stringify({tenantId:'11111111-1111-4111-8111-111111111111',provider:'NAVER',expectedRevision:0,fields:{clientId:'x',clientSecret:'y'}})});
test('handler requires admission, distinguishes denied and unavailable, bounds rogue adapter and blocks late save',async()=>{
 let writes=0;const save=async()=>{writes++;};
 assert.equal((await (await createCredentialSaveRequest({origin,save})(request())).json()).code,'SETUP_REQUIRED');
 for(const [admit,expected,admissionTimeoutMs] of [[async()=>({allowed:false}),429,10000],[async()=>null,503,10000],[async()=>{throw Error('secret');},503,10000],[async()=>{await pause(50);return {allowed:true};},503,10]]) {const response=await createCredentialSaveRequest({origin,save,admit,admissionTimeoutMs})(request());assert.equal(response.status,expected);}
 await pause(70);assert.equal(writes,0);
});
test('one total deadline covers all stages, including user completion and pre-aborted calls',async()=>{
 let calls=0;const admission=createCredentialRequestAdmission({...options,timeoutMs:35,verifySession:async()=>{await pause(20);return session();},rpcClient:{rpc:async()=>{calls++;await pause(20);return {data:true,error:null};}}});
 await assert.rejects(admission('a.b'),{code:'CREDENTIAL_ADMISSION_UNAVAILABLE'});await pause(60);assert.equal(calls,1);
 for(const abort of [false,true]){let stages=0;const control=new AbortController();const fn=createCredentialRequestAdmission({...options,timeoutMs:20,rpcClient:{rpc:async()=>{stages++;if(stages===2){if(abort)control.abort();await pause(45);}return {data:true,error:null};}}});await assert.rejects(fn('a.b',{signal:control.signal}),{code:'CREDENTIAL_ADMISSION_UNAVAILABLE'});assert.equal(stages,2);}
 const c=new AbortController();c.abort();calls=0;await assert.rejects(admission('a.b',{signal:c.signal}));assert.equal(calls,0);
});
test('malformed transport and throwing verifier never proceed; user false is a quota denial',async()=>{
 for(const bad of [undefined,{},[],{data:true,error:{}},{data:true}])await assert.rejects(createCredentialRequestAdmission({...options,rpcClient:{rpc:async()=>bad}})('a.b'),{code:'CREDENTIAL_ADMISSION_UNAVAILABLE'});
 let calls=0;await assert.rejects(createCredentialRequestAdmission({...options,verifySession:async()=>{throw Error('private');},rpcClient:{rpc:async()=>{calls++;return {data:true,error:null};}}})('a.b'));assert.equal(calls,1);
 for(const value of [false,null,{},'true']){calls=0;const fn=createCredentialRequestAdmission({...options,rpcClient:{rpc:async()=>({data:++calls===1?true:value,error:null})}});if(value===false)assert.deepEqual(await fn('a.b'),{allowed:false});else await assert.rejects(fn('a.b'));assert.equal(calls,2);}
});
test('handler abort while admission pending blocks late write and releases concurrency slot',async()=>{
 let writes=0,entered;const started=new Promise(r=>entered=r),controller=new AbortController();const handler=createCredentialSaveRequest({origin,maxConcurrent:1,admissionTimeoutMs:100,admit:async(req,credential)=>{assert.equal(credential,'a.b');entered();await pause(40);return {allowed:true};},save:async()=>{writes++;}});
 const pending=handler(request(controller.signal));await started;controller.abort();assert.equal((await pending).status,503);await pause(60);assert.equal(writes,0);
});
test('shorter handler deadline cancels adapter so late network cannot start USER quota',async()=>{
 let calls=0,writes=0;const admission=createCredentialRequestAdmission({...options,timeoutMs:200,rpcClient:{rpc:async()=>{calls++;await pause(50);return {data:true,error:null};}}});
 const handler=createCredentialSaveRequest({origin,admissionTimeoutMs:10,admit:(req,value,options)=>admission(value,options),save:async()=>{writes++;}});
 assert.equal((await handler(request())).status,503);await pause(80);assert.equal(calls,1);assert.equal(writes,0);
});
test('parent absolute deadline stops late microtasks even when RPC blocks timer delivery',async()=>{
 const {performance}=require('node:perf_hooks');let calls=0,verified=0,writes=0;
 const admission=createCredentialRequestAdmission({...options,timeoutMs:200,verifySession:async()=>{verified++;return session();},rpcClient:{rpc:async()=>{calls++;const end=performance.now()+35;while(performance.now()<end){}return {data:true,error:null};}}});
 const response=await createCredentialSaveRequest({origin,admissionTimeoutMs:10,admit:(req,value,options)=>admission(value,options),save:async()=>{writes++;}})(request());
 assert.equal(response.status,503);assert.equal(calls,1);assert.equal(verified,0);assert.equal(writes,0);
});
