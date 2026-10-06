const test=require('node:test'),assert=require('node:assert/strict');
const {createCredentialSaveRequest}=require('../lib/tenancy/credential-request.js');
const origin='https://hub.example',tenantId='11111111-1111-4111-8111-111111111111';
const get=(query=`tenantId=${tenantId}&provider=NAVER`,headers={})=>new Request(`${origin}/api/moaon/credentials?${query}`,{headers:{origin,cookie:'harin_dashboard_session=test.signature',...headers}});
test('GET exact query uses same admission and only safe validated metadata',async()=>{
 let admitted=0,read=0;const handle=createCredentialSaveRequest({origin,admit:async()=>{admitted++;return {allowed:true};},readMetadata:async(credential,input,options)=>{read++;assert.equal(credential,'test.signature');assert.deepEqual(input,{tenantId,provider:'NAVER'});assert.ok(options.signal);assert.ok(Number.isFinite(options.deadline));return {tenantId,provider:'NAVER',revision:0,status:'NOT_SAVED',envelope:'private'};}});
 const response=await handle(get());assert.equal(response.status,200);assert.deepEqual(await response.json(),{ok:true,tenantId,provider:'NAVER',revision:0,status:'NOT_SAVED'});assert.equal(admitted,1);assert.equal(read,1);
 for(const query of ['',`tenantId=${tenantId}`,`tenantId=${tenantId}&provider=NAVER&extra=x`,`tenantId=${tenantId}&provider=NAVER&provider=NAVER`,`tenantId=${tenantId}&provider=INVALID`])assert.equal((await handle(get(query))).status,400);
 assert.equal((await handle(get(undefined,{origin:'https://evil.example'}))).status,403);assert.equal((await handle(get(undefined,{cookie:''}))).status,401);assert.equal(admitted,1);assert.equal(read,1);
});
test('GET never converts errors or malformed success into NOT_SAVED and shares concurrency with POST',async()=>{
 for(const result of [{tenantId,provider:'NAVER',revision:0,status:'SAVED_UNVERIFIED'},{tenantId,provider:'NAVER',revision:1,status:'NOT_SAVED'},{tenantId,provider:'NAVER',revision:-1,status:'NOT_SAVED'},null]){
  const handle=createCredentialSaveRequest({origin,admit:async()=>({allowed:true}),readMetadata:async()=>result});const response=await handle(get());assert.equal(response.status,503);assert.doesNotMatch(await response.text(),/NOT_SAVED/);
 }
 let entered,release;const started=new Promise(r=>entered=r);const handle=createCredentialSaveRequest({origin,maxConcurrent:1,admit:async()=>({allowed:true}),readMetadata:async()=>{entered();await new Promise(r=>release=r);return {tenantId,provider:'NAVER',revision:1,status:'SAVED_UNVERIFIED'};},save:async()=>{throw Error('must not start');}});
 const pending=handle(get());await started;const busy=await handle(new Request(origin+'/api/moaon/credentials',{method:'POST'}));assert.equal(busy.status,429);release();assert.equal((await pending).status,200);
 const denied=createCredentialSaveRequest({origin,admit:async()=>({allowed:false}),readMetadata:async()=>{throw Error('must not read');}});assert.equal((await denied(get())).status,429);
});
test('runtime GET uses fenced OWNER transaction, shares GET/POST quota and returns only revision from isolated SQL',async t=>{
 const {PGlite}=require('@electric-sql/pglite'),fs=require('node:fs/promises'),path=require('node:path');
 const {setupCredentialAuth,sessionId,userId}=require('./helpers/credential-auth-fixture.js');
 const {createCredentialSaveRuntime}=require('../lib/tenancy/credential-save-runtime.js');
 const previous=[process.env.VERCEL,process.env.VERCEL_ENV];process.env.VERCEL='1';process.env.VERCEL_ENV='production';
 t.after(()=>{for(const [i,key] of ['VERCEL','VERCEL_ENV'].entries())if(previous[i]===undefined)delete process.env[key];else process.env[key]=previous[i];});
 const db=new PGlite();t.after(()=>db.close());await setupCredentialAuth(db);
 for(const file of ['control-plane.sql','credential-store.sql','control-role.sql','credential-runtime-role.sql','credential-request-admission.sql'])await db.exec(await fs.readFile(path.join(__dirname,'../lib/tenancy/sql',file),'utf8'));
 await db.query("insert into moaon_control.tenants(id,display_name,status) values($1,'Synthetic','ACTIVE')",[tenantId]);await db.query("insert into moaon_control.memberships(tenant_id,user_id,role,status,version) values($1,$2,'OWNER','ACTIVE',1)",[tenantId,userId]);
 let queries=[],validations=0;
 const identityClient={from(){return {select(){return this;},eq(){return this;},async maybeSingle(){return {data:{user_id:userId,email:'synthetic@example.test',active:true},error:null};}};},auth:{admin:{async getUserById(){return {data:{user:{id:userId,email:'synthetic@example.test',is_anonymous:false}},error:null};}}}};
 const runtime=createCredentialSaveRuntime({env:{MOAON_CREDENTIAL_SAVE_ENABLED:'1',MOAON_CREDENTIAL_SAVE_ORIGIN:origin,MOAON_CREDENTIAL_SAVE_INGRESS:'vercel-direct',MOAON_CREDENTIAL_KEYRING:JSON.stringify({test:Buffer.alloc(32,7).toString('base64')}),MOAON_CREDENTIAL_ACTIVE_KEY_ID:'test',MOAON_CREDENTIAL_ADMISSION_HMAC_KEY:'synthetic'.repeat(8)},createControlDatabase:()=>({transaction:work=>db.transaction(tx=>work({query:(sql,args)=>{queries.push(sql);return tx.query(sql,args);}})),close:async()=>{}}),createIdentityClient:()=>identityClient,validateSession:async(value,options)=>{assert.equal(value,'test.signature');assert.equal(options.touch,false);validations++;return {id:sessionId,userId,expiresAt:'2099-01-01T00:00:00Z'};}});t.after(()=>runtime.close());
 const headers={'x-vercel-forwarded-for':'127.0.0.1','x-forwarded-for':'127.0.0.1'};
 const response=await runtime.handle(get(undefined,headers));assert.equal(response.status,200);assert.deepEqual(await response.json(),{ok:true,tenantId,provider:'NAVER',revision:0,status:'NOT_SAVED'});assert.equal(validations,6);
 const body={tenantId,provider:'NAVER',expectedRevision:0,fields:{clientId:'test',clientSecret:'synthetic-private'}};
 assert.equal((await runtime.handle(new Request(origin+'/api/moaon/credentials',{method:'POST',headers:{...headers,origin,cookie:'harin_dashboard_session=test.signature','content-type':'application/json'},body:JSON.stringify(body)}))).status,200);
 queries=[];const saved=await runtime.handle(get(undefined,headers));assert.deepEqual(await saved.json(),{ok:true,tenantId,provider:'NAVER',revision:1,status:'SAVED_UNVERIFIED'});
 assert.deepEqual(queries.filter(sql=>sql.includes('provider_credentials')),['select revision from moaon_control.provider_credentials where tenant_id=$1 and provider=$2']);
 assert.equal((await runtime.handle(get('tenantId=33333333-3333-4333-8333-333333333333&provider=NAVER',headers))).status,403);
 await db.exec("update moaon_control.memberships set role='VIEWER'");assert.equal((await runtime.handle(get(undefined,headers))).status,403);await db.exec("update moaon_control.memberships set role='OWNER'");
 await db.exec('update dashboard_sessions set revoked_at=clock_timestamp()');assert.equal((await runtime.handle(get(undefined,headers))).status,403);
 assert.deepEqual((await db.query('select scope,used from moaon_control.credential_request_limits order by scope')).rows,[{scope:'GLOBAL',used:6},{scope:'IP',used:6},{scope:'USER',used:6}]);
});
test('GET aborted or expired work cannot return successful metadata',async()=>{
 let entered,release;const started=new Promise(r=>entered=r),controller=new AbortController();
 const handle=createCredentialSaveRequest({origin,admit:async()=>({allowed:true}),readMetadata:async()=>{entered();await new Promise(r=>release=r);return {tenantId,provider:'NAVER',revision:0,status:'NOT_SAVED'};}});
 const pending=handle(get(),{signal:controller.signal});await started;controller.abort();release();assert.equal((await pending).status,503);
 const {performance}=require('node:perf_hooks');assert.equal((await handle(get(),{deadline:performance.now()-1})).status,503);
});
