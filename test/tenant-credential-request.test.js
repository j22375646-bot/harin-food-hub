const test=require('node:test'),assert=require('node:assert/strict');
let createCredentialSaveRequest;try{({createCredentialSaveRequest}=require('../lib/tenancy/credential-request.js'));}catch(e){if(e.code!=='MODULE_NOT_FOUND')throw e;}
const origin='https://hub.example',tenantId='11111111-1111-4111-8111-111111111111';
const input={tenantId,provider:'NAVER',expectedRevision:0,fields:{clientId:'test',clientSecret:'secret-test'}};
const request=(body=input,headers={})=>new Request(origin+'/api/moaon/credentials',{method:'POST',headers:{origin,'content-type':'application/json',cookie:'harin_dashboard_session=test.signature',...headers},body:typeof body==='string'?body:JSON.stringify(body)});
test('valid request saves credentials but projects only safe metadata',async()=>{
 assert.equal(typeof createCredentialSaveRequest,'function');let called=0;
 const handle=createCredentialSaveRequest({origin,save:async(cookie,value)=>{called++;assert.equal(cookie,'test.signature');assert.deepEqual(value,input);return {tenantId,provider:'NAVER',revision:1,status:'SAVED_UNVERIFIED',secret:'never-return'};}});
 const result=await handle(request());assert.equal(result.status,200);assert.equal(result.headers.get('cache-control'),'no-store');assert.deepEqual(await result.json(),{ok:true,tenantId,provider:'NAVER',revision:1,status:'SAVED_UNVERIFIED'});assert.equal(called,1);
});
test('origin cookie body limits and provider fields reject before storage',async()=>{
 assert.equal(typeof createCredentialSaveRequest,'function');let writes=0;const handle=createCredentialSaveRequest({origin,save:async()=>{writes++;}});
 for(const req of [request(input,{origin:'https://evil.example'}),request(input,{origin:''}),request(input,{cookie:''}),request(input,{cookie:'harin_dashboard_session=a.b; harin_dashboard_session=c.d'}),request(input,{'content-type':'text/plain'}),request('{'),request({...input,extra:true}),request({...input,fields:{token:'wrong'}}),request('x'.repeat(17000)),request(input,{'sec-fetch-site':'cross-site'})])assert.ok((await handle(req)).status>=400);
 assert.equal(writes,0);
});
test('unconfigured storage and internal errors never report successful connection or reveal secrets',async()=>{
 assert.equal(typeof createCredentialSaveRequest,'function');assert.equal((await createCredentialSaveRequest({origin})(request())).status,503);
 for(const [code,status] of [['CREDENTIAL_CONFLICT',409],['CREDENTIAL_ACCESS_DENIED',403],['unknown-secret',503]]){
  const result=await createCredentialSaveRequest({origin,save:async()=>{throw Object.assign(Error('secret-test'),{code});}})(request());assert.equal(result.status,status);assert.doesNotMatch(await result.text(),/secret-test|unknown-secret/);
 }
});
