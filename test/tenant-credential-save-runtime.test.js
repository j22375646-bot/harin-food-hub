const test=require('node:test'),assert=require('node:assert/strict');
const {createCredentialSaveRuntime,createCredentialAdmissionRpc}=require('../lib/tenancy/credential-save-runtime.js');
const origin='https://hub.example';
const env=()=>({MOAON_CREDENTIAL_SAVE_ENABLED:'1',MOAON_CREDENTIAL_SAVE_ORIGIN:origin,MOAON_CREDENTIAL_SAVE_INGRESS:'vercel-direct',MOAON_CREDENTIAL_KEYRING:JSON.stringify({test:Buffer.alloc(32,7).toString('base64')}),MOAON_CREDENTIAL_ACTIVE_KEY_ID:'test',MOAON_CREDENTIAL_ADMISSION_HMAC_KEY:'test'.repeat(16)});
const input={tenantId:'11111111-1111-4111-8111-111111111111',provider:'NAVER',expectedRevision:0,fields:{clientId:'test',clientSecret:'private-test'}};
const req=(body=input,headers={})=>new Request(origin+'/api/moaon/credentials',{method:'POST',headers:{origin,'content-type':'application/json',cookie:'harin_dashboard_session=test.signature','x-vercel-forwarded-for':'127.0.0.1','x-forwarded-for':'127.0.0.1',...headers},body:JSON.stringify(body)});
const userId='22222222-2222-4222-8222-222222222222';
const identityClient=()=>({from(){return {select(){return this;},eq(){return this;},async maybeSingle(){return {data:{user_id:userId,email:'synthetic@example.test',active:true},error:null};}};},auth:{admin:{async getUserById(){return {data:{user:{id:userId,email:'synthetic@example.test',is_anonymous:false}},error:null};}}}});
const session=async(value,options)=>{assert.equal(value,'test.signature');assert.equal(options.touch,false);assert.ok(options.signal);assert.ok(Number.isFinite(options.deadline));return {id:'44444444-4444-4444-8444-444444444444',userId,expiresAt:'2099-01-01T00:00:00Z'};};
function vercel(t){const prior=[process.env.VERCEL,process.env.VERCEL_ENV];process.env.VERCEL='1';process.env.VERCEL_ENV='production';t.after(()=>{for(const [i,key] of ['VERCEL','VERCEL_ENV'].entries())if(prior[i]===undefined)delete process.env[key];else process.env[key]=prior[i];});}
test('singleflight initialization, handler concurrency bound, cleanup on failure and idempotent close',async t=>{
 vercel(t);let created=0,closes=0,release;const waiting=new Promise(r=>release=r);
 const runtime=createCredentialSaveRuntime({env:env(),maxConcurrent:2,createControlDatabase:async()=>{created++;await waiting;return {transaction:async work=>work({query:async()=>({rows:[{allowed:false}]})}),close:async()=>{closes++;}};},createIdentityClient:identityClient,validateSession:session});
 const a=runtime.handle(req()),b=runtime.handle(req());await new Promise(r=>setImmediate(r));assert.equal(created,1);assert.equal((await runtime.handle(req())).status,429);release();assert.equal((await a).status,429);assert.equal((await b).status,429);await Promise.all([runtime.close(),runtime.close()]);assert.equal(closes,1);
 let attempts=0;const failing=createCredentialSaveRuntime({env:env(),createControlDatabase:()=>({close:async()=>{closes++;},transaction(){}}),createIdentityClient:()=>{attempts++;throw Error('private-secret');}});
 for(let i=0;i<2;i++)assert.equal((await failing.handle(req())).status,503);assert.equal(attempts,2);assert.equal(closes,3);await failing.close();
});
test('close and deadline while initialization is pending clean the pool and prohibit late quota/store',async t=>{
 vercel(t);
 for(const action of ['close','deadline','abort']){
  let release,entered,queries=0,closes=0;const gate=new Promise(r=>release=r),started=new Promise(r=>entered=r),controller=new AbortController();
  const runtime=createCredentialSaveRuntime({env:env(),admissionTimeoutMs:2000,createControlDatabase:async()=>{entered();await gate;return {transaction(){queries++;},close:async()=>{closes++;}};},createIdentityClient:identityClient,validateSession:session});
  const response=runtime.handle(req(),{signal:controller.signal});await Promise.race([started,response.then(()=>{throw Error('Initialization must enter before testing its cancellation');})]);let closing;
  if(action==='close')closing=runtime.close();if(action==='abort')controller.abort();assert.equal((await response).status,503);release();await (closing||runtime.close());assert.equal(queries,0);assert.equal(closes,1);
 }
});
test('real Request composition uses encrypted store, mandatory session fence, read-only identity and persistent quota',async t=>{
 vercel(t);const {PGlite}=require('@electric-sql/pglite');const fs=require('node:fs/promises'),path=require('node:path');const {setupCredentialAuth}=require('./helpers/credential-auth-fixture.js');
 const db=new PGlite();t.after(()=>db.close());await setupCredentialAuth(db);
 for(const file of ['control-plane.sql','credential-store.sql','control-role.sql','credential-runtime-role.sql','credential-request-admission.sql'])await db.exec(await fs.readFile(path.join(__dirname,'../lib/tenancy/sql',file),'utf8'));
 await db.query("insert into moaon_control.tenants(id,display_name,status) values($1,'Synthetic','ACTIVE')",[input.tenantId]);await db.query("insert into moaon_control.memberships(tenant_id,user_id,role,status,version) values($1,$2,'OWNER','ACTIVE',1)",[input.tenantId,userId]);
 let validations=0;const runtime=createCredentialSaveRuntime({env:env(),createControlDatabase:()=>({transaction:work=>db.transaction(work),close:async()=>{}}),createIdentityClient:identityClient,validateSession:async(...args)=>{validations++;return session(...args);}});t.after(()=>runtime.close());
 const result=await runtime.handle(req());assert.equal(result.status,200);assert.deepEqual(await result.json(),{ok:true,tenantId:input.tenantId,provider:'NAVER',revision:1,status:'SAVED_UNVERIFIED'});assert.equal(validations,6);
 const row=(await db.query('select envelope from moaon_control.provider_credentials')).rows[0];assert.doesNotMatch(JSON.stringify(row),/private-test/);
 assert.equal((await runtime.handle(req())).status,409);
 await db.exec('update dashboard_sessions set revoked_at=clock_timestamp()');assert.equal((await runtime.handle(req({...input,expectedRevision:1}))).status,403);
 assert.equal((await db.query('select revision from moaon_control.provider_credentials')).rows[0].revision,1);
 for(let i=3;i<10;i++)await runtime.handle(req());assert.equal((await runtime.handle(req())).status,429);
 assert.deepEqual((await db.query('select scope,used from moaon_control.credential_request_limits order by scope')).rows,[{scope:'GLOBAL',used:11},{scope:'IP',used:11},{scope:'USER',used:10}]);
});
test('default disabled and malformed config have no dependency side effects',async()=>{
 for(const config of [{},{...env(),MOAON_CREDENTIAL_SAVE_ORIGIN:'http://bad'},{...env(),MOAON_CREDENTIAL_KEYRING:'private-secret'}]){
  let calls=0;const runtime=createCredentialSaveRuntime({env:config,createControlDatabase(){calls++;throw Error('private-secret');}});
  const response=await runtime.handle(req());assert.equal(response.status,503);assert.doesNotMatch(await response.text(),/private-secret/);assert.equal(calls,0);await runtime.close();
 }
 const missing=createCredentialSaveRuntime({env:env()});assert.deepEqual(await (await missing.handle(req())).json(),{ok:false,code:'SETUP_REQUIRED'});await missing.close();
});
test('only exact two RPCs use fixed parameterized SQL and completed individual transactions',async()=>{
 const calls=[];let committed=0;const rpc=createCredentialAdmissionRpc({transaction:async work=>{const r=await work({query:async(...args)=>{calls.push(args);return {rows:[{allowed:false}]};}});committed++;return r;}});
 assert.deepEqual(await rpc.rpc('moaon_consume_credential_network',{p_ip_hash:'a'.repeat(64)}),{data:false,error:null});assert.equal(committed,1);
 assert.deepEqual(await rpc.rpc('moaon_consume_credential_user',{p_user_hash:'b'.repeat(64)}),{data:false,error:null});assert.equal(committed,2);
 assert.deepEqual(calls,[['select public.moaon_consume_credential_network($1) as allowed',['a'.repeat(64)]],['select public.moaon_consume_credential_user($1) as allowed',['b'.repeat(64)]]]);
 for(const [name,args] of [['evil',{}],['moaon_consume_credential_user',{p_user_hash:'x',extra:true}]])await assert.rejects(rpc.rpc(name,args));assert.equal(calls.length,2);
});
test('untrusted runtime and cheap invalid requests never initialize a database',async()=>{
 const old=[process.env.VERCEL,process.env.VERCEL_ENV];process.env.VERCEL='1';process.env.VERCEL_ENV='production';
 try{let calls=0;const runtime=createCredentialSaveRuntime({env:env(),createControlDatabase(){calls++;throw Error('no');}});
  for(const request of [req(input,{origin:'https://evil.example'}),req({...input,extra:true}),req(input,{'x-forwarded-for':'8.8.8.8'}),req(input,{'x-vercel-forwarded-for':'127.0.0.1, 8.8.8.8'})])assert.ok((await runtime.handle(request)).status>=400);
  process.env.VERCEL_ENV='preview';assert.equal((await runtime.handle(req())).status,503);assert.equal(calls,0);await runtime.close();
 }finally{for(const [i,key] of ['VERCEL','VERCEL_ENV'].entries())if(old[i]===undefined)delete process.env[key];else process.env[key]=old[i];}
});
