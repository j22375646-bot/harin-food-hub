'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),{PGlite}=require('@electric-sql/pglite');
const keys=require('../lib/integrations/managed-keys.js'),{createHandler}=require('../lib/integrations/key-request.js'),auth=require('../lib/dashboard-auth.js');
const env={MOAON_MANAGED_KEYS_ENABLED:'1',MOAON_MANAGED_KEY:Buffer.alloc(32,19).toString('base64'),MOAON_ANALYSIS_AI_ENABLED:'true',MOAON_MARKET_AI_ENABLED:'true',OPENAI_ANALYSIS_ENABLED:'true'};
const fields={CLOVA:{apiKey:'synthetic-clova-secret',accountId:'synthetic-account',inputKrwPerMillion:'1250',outputKrwPerMillion:'5000',pricingVersion:'synthetic-pricing-v1',creditExpiresAt:'2099-01-01T00:00:00Z'},GEMINI:{apiKey:'synthetic-gemini-secret',projectId:'sample-project'},OPENAI:{apiKey:'synthetic-openai-secret'}};
const request=body=>new Request('https://example.invalid/api/moaon/connections',{method:'POST',headers:{Origin:'https://example.invalid','Content-Type':'application/json',Cookie:auth.COOKIE_NAME+'=synthetic'},body:JSON.stringify(body)});
test('AI field snapshots reject blanks, injected activation, expiry and invalid project',()=>{
 for(const provider of Object.keys(fields)){
  const input={action:'SAVE',provider,revision:0,fields:fields[provider],expiresAt:null};assert.equal(keys.validInput(input),true);
  for(const bad of [{...input,enabled:true},{...input,expiresAt:'2026-10-01T00:00:00Z'},{...input,fields:{...input.fields,apiKey:' '}},{...input,fields:{...input.fields,enabled:'true'}}])assert.equal(keys.validInput(bad),false);
 }
 assert.equal(keys.validInput({action:'SAVE',provider:'GEMINI',revision:0,fields:{apiKey:'s',projectId:'bad id'},expiresAt:null}),false);
});
test('AI encrypted overrides bind tenant/provider/revision and confirmed saves enable configured AI',async()=>{
 for(const provider of Object.keys(fields)){
  const scope={tenantId:keys.TENANT,provider,revision:2},envelope=keys.cipher(env).seal(scope,{...fields[provider],managedPolicyVersion:require('../lib/integrations/managed-ai-config.js').POLICY_VERSION});
  assert.equal(keys.cipher(env).open(scope,envelope).apiKey,fields[provider].apiKey);assert.ok(!JSON.stringify(envelope).includes(fields[provider].apiKey));
  for(const wrong of [{...scope,revision:1},{...scope,provider:provider==='CLOVA'?'GEMINI':'CLOVA'},{...scope,tenantId:'10000000-0000-4000-8000-000000000001'}])assert.throws(()=>keys.cipher(env).open(wrong,envelope),/CREDENTIAL_UNAVAILABLE/);
  const db={from:()=>({select:()=>({eq:()=>({eq:()=>({maybeSingle:async()=>({data:{revision:2,envelope,updated_at:new Date().toISOString()}})})})})})};
  const flag={CLOVA:'MOAON_ANALYSIS_AI_ENABLED',GEMINI:'MOAON_MARKET_AI_ENABLED',OPENAI:'OPENAI_ANALYSIS_ENABLED'}[provider];
  assert.equal((await keys.environment(provider,{...env,[flag]:'false'},db))[flag],provider==='OPENAI'?'false':'true');
  assert.equal((await keys.environment(provider,{...env,MOAON_ANALYSIS_AI_KILL_SWITCH:'true',MOAON_MARKET_AI_KILL_SWITCH:'true'},db))[flag],'false');
 }
});
test('isolated live-path SQL and handler save initial AI accounts, conflict on stale revisions, hide secrets and fence owners',async()=>{
 const db=new PGlite(),actor='10000000-0000-4000-8000-000000000001',sid='30000000-0000-4000-8000-000000000001';
 try{
 await db.exec(`create role anon;create role authenticated;create role service_role;create schema moaon_control;create table moaon_control.tenants(id uuid primary key,status text);create table moaon_control.memberships(tenant_id uuid,user_id uuid,role text,status text);create table public.dashboard_users(user_id uuid primary key,role text,active boolean);create table public.dashboard_sessions(id uuid primary key,user_id uuid,token_hash text,revoked_at timestamptz,expires_at timestamptz,role text);insert into moaon_control.tenants values('${keys.TENANT}','ACTIVE');insert into public.dashboard_users values('${actor}','OWNER',true);insert into moaon_control.memberships values('${keys.TENANT}','${actor}','OWNER','ACTIVE');insert into public.dashboard_sessions values('${sid}','${actor}','hash',null,now()+interval '1 hour','OWNER');`);
 await db.exec(fs.readFileSync('supabase/migrations/20260912170922_moaon_managed_provider_keys.sql','utf8'));
 await db.exec(fs.readFileSync('supabase/migrations/20260914014505_moaon_managed_ai_keys.sql','utf8'));
 const command=async(input,hash='hash')=>(await db.query('select public.moaon_key_command($1,$2,$3,$4) result',[actor,sid,hash,input])).rows[0].result;
 let rpcs=0;const adapter={rpc:async(name,args)=>{rpcs++;try{return {data:await command(args.p_input)}}catch(error){return {error}}},from:table=>{if(table==='moaon_managed_keys')return {select:()=>({eq:()=>({eq:(_,provider)=>({maybeSingle:async()=>({data:(await db.query('select * from public.moaon_managed_keys where provider=$1',[provider])).rows[0]||null})})})})};assert.equal(table,'moaon_key_checks');return {select:()=>({eq:async()=>({data:[]})})}}};
 const handler=createHandler({database:()=>adapter,validate:async()=>({role:'OWNER',userId:actor,id:sid}),env});
 for(const provider of Object.keys(fields)){
  let response=await handler(request({action:'CHECK',provider}));assert.deepEqual(await response.json(),{ok:true,status:'SETUP_REQUIRED',enabled:false,ready:false,reasonCodes:['KEY_NOT_SAVED'],checkedAt:null});
  const input={action:'SAVE',provider,revision:0,fields:fields[provider],expiresAt:null};
  response=await handler(request(input));assert.equal(response.status,200);const saved=await response.json();assert.equal(saved.revision,1);assert.equal(saved.status,provider==='OPENAI'?'KEY_SAVED_DISABLED':'READY');
  response=await handler(request(input));assert.equal(response.status,409);
  response=await handler(request({...input,revision:1,fields:{...input.fields,...(provider==='CLOVA'?{accountId:'changed-account'}:{})}}));assert.equal(response.status,200);assert.equal((await response.json()).revision,2);
  response=await handler(request({action:'REVEAL',provider}));assert.equal(response.status,400);assert.ok(!(await response.text()).includes(input.fields.apiKey));
  await assert.rejects(command({action:'REVEAL',provider}),/KEYS_INVALID/);
  const check=await command({action:'CHECK',provider});assert.equal(check.status,'SAVED_UNVERIFIED');assert.equal(check.envelope,undefined);
  response=await handler(request({action:'CHECK',provider}));const state=await response.json();assert.equal(state.status,provider==='OPENAI'?'KEY_SAVED_DISABLED':'READY');assert.equal(state.ready,provider!=='OPENAI');
  const row=(await db.query('select * from public.moaon_managed_keys where provider=$1',[provider])).rows[0];assert.ok(!JSON.stringify(row).includes(input.fields.apiKey));assert.equal(keys.decode(provider,row,env).apiKey,input.fields.apiKey);
  await assert.rejects(command({action:'SAVE',provider,revision:2,envelope:row.envelope,expiresAt:null,enabled:true}),/KEYS_INVALID/);
 }
 const listed=await handler(request({action:'LIST'}));assert.equal(listed.status,200);const metadata=await listed.json();assert.equal(metadata.cards.length,4);assert.equal(metadata.aiCards.length,3);assert.ok(metadata.aiCards.every(card=>Array.isArray(card.fields)&&card.identity.length===0));assert.equal(metadata.aiCards.find(c=>c.provider==='GEMINI').check.status,'READY');assert.ok(!JSON.stringify(metadata).includes('synthetic-'));
 const list=await command({action:'LIST'});assert.equal(list.length,3);assert.ok(!JSON.stringify(list).includes('synthetic-'));assert.ok(list.every(row=>!row.envelope));
 await assert.rejects(command({action:'CHECK',provider:'CLOVA'},'bad'),/KEYS_AUTH_REQUIRED/);
 await db.exec('update public.dashboard_sessions set revoked_at=now()');await assert.rejects(command({action:'LIST'}),/KEYS_AUTH_REQUIRED/);
 const denied=createHandler({database:()=>adapter,validate:async()=>null,env});const before=rpcs;assert.equal((await denied(request({action:'SAVE',provider:'OPENAI',revision:0,fields:fields.OPENAI,expiresAt:null}))).status,401);assert.equal(rpcs,before);
 await db.exec("update public.dashboard_sessions set revoked_at=null;update moaon_control.memberships set status='INACTIVE'");await assert.rejects(command({action:'LIST'}),/KEYS_AUTH_REQUIRED/);
 await db.exec("update moaon_control.memberships set status='ACTIVE'");
 await db.query("insert into public.moaon_key_events(actor,tenant_id,provider,action) select $1,$2,'CLOVA','CHECK' from generate_series(1,30)",[actor,keys.TENANT]);await assert.rejects(command({action:'CHECK',provider:'CLOVA'}),/KEYS_RATE_LIMITED/);
 const grants=(await db.query("select has_table_privilege('anon','public.moaon_managed_keys','select') a,has_table_privilege('authenticated','public.moaon_managed_keys','select') b,has_table_privilege('service_role','public.moaon_managed_keys','update') c,has_function_privilege('anon','public.moaon_key_command(uuid,uuid,text,jsonb)','execute') d")).rows[0];assert.deepEqual(grants,{a:false,b:false,c:false,d:false});
 }finally{await db.close();}
});


test('managed readiness explains expired credit, emergency stops and old unconfirmed snapshots',()=>{
 const config=require('../lib/integrations/managed-ai-config.js'),now=Date.now();
 const row=(provider,value,updatedAt=new Date(now).toISOString())=>({revision:1,updatedAt,envelope:keys.cipher(env).seal({tenantId:keys.TENANT,provider,revision:1},{...value,managedPolicyVersion:config.POLICY_VERSION})});
 const clova=row('CLOVA',{...fields.CLOVA,creditExpiresAt:'2020-01-01T00:00:00Z'});
 assert.ok(keys.aiMetadata('CLOVA',clova,env).reasonCodes.includes('CREDIT_EXPIRED'));assert.equal(keys.aiMetadata('CLOVA',clova,env).status,'SETUP_REQUIRED');
 const ready=row('CLOVA',fields.CLOVA);const stop=keys.aiMetadata('CLOVA',ready,{...env,MOAON_ANALYSIS_AI_KILL_SWITCH:'true'});assert.equal(stop.status,'DISABLED');assert.ok(stop.reasonCodes.includes('EMERGENCY_STOP'));
 const old=row('GEMINI',fields.GEMINI,new Date(now-31*86400000).toISOString());assert.ok(keys.aiMetadata('GEMINI',old,env).reasonCodes.includes('FREE_CONFIRMATION_EXPIRED'));
 const legacy={revision:1,updatedAt:new Date(now).toISOString(),envelope:keys.cipher(env).seal({tenantId:keys.TENANT,provider:'GEMINI',revision:1},fields.GEMINI)};assert.ok(keys.aiMetadata('GEMINI',legacy,env).reasonCodes.includes('ACTIVATION_CONFIRMATION_REQUIRED'));
});

test('disabled managed storage never claims ready and OpenAI scoped overrides remain unused',async()=>{
 const provider='GEMINI',row={revision:1,updatedAt:new Date().toISOString(),envelope:keys.cipher(env).seal({tenantId:keys.TENANT,provider,revision:1},{...fields.GEMINI,managedPolicyVersion:require('../lib/integrations/managed-ai-config.js').POLICY_VERSION})};
 assert.deepEqual(keys.aiMetadata(provider,row,{...env,MOAON_MANAGED_KEYS_ENABLED:'0'}),{status:'DISABLED',enabled:false,ready:false,reasonCodes:['MANAGED_KEYS_DISABLED'],checkedAt:null});
 const scoped=await keys.withEnvironment('OPENAI',{OPENAI_ANALYSIS_ENABLED:'true'},()=>keys.environment('OPENAI',env));assert.equal(scoped.OPENAI_ANALYSIS_ENABLED,'false');
});
