const test=require('node:test'),assert=require('node:assert/strict');
let createCredentialSaveRequest;try{({createCredentialSaveRequest}=require('../lib/tenancy/credential-request.js'));}catch(e){if(e.code!=='MODULE_NOT_FOUND')throw e;}
const origin='https://hub.example',tenantId='11111111-1111-4111-8111-111111111111';
const input={tenantId,provider:'NAVER',expectedRevision:0,fields:{clientId:'test',clientSecret:'secret-test'}};
const request=(body=input,headers={})=>new Request(origin+'/api/moaon/credentials',{method:'POST',headers:{origin,'content-type':'application/json',cookie:'harin_dashboard_session=test.signature',...headers},body:typeof body==='string'?body:JSON.stringify(body)});
test('parent expired deadline prevents admission and parent options reach save',async()=>{
 let admitted=0,saved=0;const {performance}=require('node:perf_hooks');const controller=new AbortController();
 const handle=createCredentialSaveRequest({origin,admit:async()=>{admitted++;return {allowed:true};},save:async(cookie,value,options)=>{saved++;assert.equal(options.signal,controller.signal);assert.ok(options.deadline<=limit);return {tenantId,provider:'NAVER',revision:1,status:'SAVED_UNVERIFIED'};}});
 assert.equal((await handle(request(),{deadline:performance.now()-1})).status,503);assert.equal(admitted,0);
 const limit=performance.now()+2000;assert.equal((await handle(request(),{signal:controller.signal,deadline:limit})).status,200);assert.equal(saved,1);
});
test('simultaneous requests are bounded and the slot is released after completion',async()=>{
 let release,entered;const started=new Promise(r=>entered=r);
 const handle=createCredentialSaveRequest({admit:async()=>({allowed:true}),origin,maxConcurrent:1,save:async()=>{entered();await new Promise(r=>release=r);return {tenantId,provider:'NAVER',revision:1,status:'SAVED_UNVERIFIED'};}});
 const first=handle(request());await started;
 const denied=await Promise.race([handle(request()),new Promise(r=>setTimeout(()=>r(null),100))]);assert.equal(denied?.status,429);release();assert.equal((await first).status,200);
 const next=handle(request());await new Promise(r=>setImmediate(r));release();assert.equal((await next).status,200);
});
test('aborted stalled body releases the request without starting a write',async()=>{
 const controller=new AbortController();let writes=0;
 const req=new Request(origin+'/api/moaon/credentials',{method:'POST',headers:{origin,'content-type':'application/json',cookie:'harin_dashboard_session=test.signature'},body:new ReadableStream({start(){}}),duplex:'half',signal:controller.signal});
 const handle=createCredentialSaveRequest({admit:async()=>({allowed:true}),origin,save:async()=>{writes++;}}),pending=handle(req);controller.abort();
 const response=await Promise.race([pending,new Promise(r=>setTimeout(()=>r(null),100))]);assert.ok(response,'aborted body must not wait for body deadline');assert.equal(writes,0);
});
test('unknown errors after write starts return an uncertain result rather than a retryable storage failure',async()=>{
 const result=await createCredentialSaveRequest({admit:async()=>({allowed:true}),origin,save:async()=>{throw Error('private database detail');}})(request());
 assert.deepEqual(await result.json(),{ok:false,code:'CREDENTIAL_RESULT_UNKNOWN'});
});
test('valid request saves credentials but projects only safe metadata',async()=>{
 assert.equal(typeof createCredentialSaveRequest,'function');let called=0;
 const handle=createCredentialSaveRequest({admit:async()=>({allowed:true}),origin,save:async(cookie,value)=>{called++;assert.equal(cookie,'test.signature');assert.deepEqual(value,input);return {tenantId,provider:'NAVER',revision:1,status:'SAVED_UNVERIFIED',secret:'never-return'};}});
 const result=await handle(request());assert.equal(result.status,200);assert.equal(result.headers.get('cache-control'),'no-store');assert.deepEqual(await result.json(),{ok:true,tenantId,provider:'NAVER',revision:1,status:'SAVED_UNVERIFIED'});assert.equal(called,1);
});
test('origin cookie body limits and provider fields reject before storage',async()=>{
 assert.equal(typeof createCredentialSaveRequest,'function');let writes=0;const handle=createCredentialSaveRequest({admit:async()=>({allowed:true}),origin,save:async()=>{writes++;}});
 for(const req of [request(input,{origin:'https://evil.example'}),request(input,{origin:''}),request(input,{cookie:''}),request(input,{cookie:'harin_dashboard_session=a.b; harin_dashboard_session=c.d'}),request(input,{'content-type':'text/plain'}),request('{'),request({...input,extra:true}),request({...input,fields:{token:'wrong'}}),request('x'.repeat(17000)),request(input,{'sec-fetch-site':'cross-site'})])assert.ok((await handle(req)).status>=400);
 assert.equal(writes,0);
});
test('unconfigured storage and internal errors never report successful connection or reveal secrets',async()=>{
 assert.equal(typeof createCredentialSaveRequest,'function');assert.equal((await createCredentialSaveRequest({admit:async()=>({allowed:true}),origin})(request())).status,503);
 for(const [code,status] of [['CREDENTIAL_CONFLICT',409],['CREDENTIAL_ACCESS_DENIED',403],['unknown-secret',503]]){
  const result=await createCredentialSaveRequest({admit:async()=>({allowed:true}),origin,save:async()=>{throw Object.assign(Error('secret-test'),{code});}})(request());assert.equal(result.status,status);assert.doesNotMatch(await result.text(),/secret-test|unknown-secret/);
 }
});
