'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),{PGlite}=require('@electric-sql/pglite');
const keys=require('../lib/integrations/managed-keys.js'),transport=require('../desktop/connections-transport.cjs');
test('key contracts reject injected identity, controls and invalid revision',()=>{
 const input={action:'SAVE',provider:'COUPANG',revision:0,fields:{vendorId:'test',accessKey:'sample',secretKey:'sample-secret'},expiresAt:null};
 for(const valid of [keys.validInput,transport.validInput]){assert.equal(valid(input),true);for(const invalid of [{...input,tenantId:'other'},{...input,revision:-1},{...input,fields:{...input.fields,secretKey:'line\nbreak'}},{action:'REVEAL',provider:'SUPABASE'},{action:'LIST',extra:true}])assert.equal(valid(invalid),false);}
});
test('runtime uses encrypted overrides and fails closed instead of silently reverting old keys',async()=>{
 const env={MOAON_MANAGED_KEYS_ENABLED:'1',MOAON_MANAGED_KEY:Buffer.alloc(32,7).toString('base64'),COUPANG_VENDOR_ID:'vendor',COUPANG_ACCESS_KEY:'old',COUPANG_SECRET_KEY:'old-secret'};
 const envelope=keys.cipher(env).seal({tenantId:keys.TENANT,provider:'COUPANG',revision:1},{vendorId:'vendor',accessKey:'new',secretKey:'new-secret'});
 const db=result=>({from:()=>({select:()=>({eq:()=>({eq:()=>({maybeSingle:async()=>result})})})})});
 assert.equal((await keys.environment('COUPANG',env,db({data:{revision:1,envelope}}))).COUPANG_ACCESS_KEY,'new');assert.equal(env.COUPANG_ACCESS_KEY,'old');
 await assert.rejects(keys.environment('COUPANG',env,db({error:{}})),/KEYS_UNAVAILABLE/);
 await assert.rejects(keys.environment('COUPANG',env,db({data:{revision:2,envelope}})),/CREDENTIAL_UNAVAILABLE/);
 assert.equal(await keys.environment('COUPANG',{MOAON_MANAGED_KEYS_ENABLED:'0'}).then(v=>v.MOAON_MANAGED_KEYS_ENABLED),'0');
});
test('partial worker migration retains the web runtime advertising credentials',()=>{
 const env={MOAON_MANAGED_KEY:Buffer.alloc(32,8).toString('base64'),NAVER_API_KEY:'web-ad-key',NAVER_SECRET_KEY:'web-ad-secret',NAVER_CUSTOMER_ID:'web-customer'};
 const row={revision:1,envelope:keys.cipher(env).seal({tenantId:keys.TENANT,provider:'NAVER',revision:1},{clientId:'commerce-client',clientSecret:'commerce-secret'})};
 const decoded=keys.decode('NAVER',row,env);assert.equal(decoded.apiKey,'web-ad-key');assert.equal(decoded.secretKey,'web-ad-secret');assert.equal(decoded.clientSecret,'commerce-secret');
});
test('middleware authentication failures are shown as login required',async()=>{
 const result=await transport.command(async()=>Response.json({ok:false,code:'UNAUTHENTICATED'},{status:401}),{action:'LIST'});
 assert.deepEqual(result,{ok:false,code:'KEYS_AUTH_REQUIRED'});
});
test('isolated key DB requires live owner, denies public access and protects revisions',async()=>{
 const db=new PGlite(),actor='10000000-0000-4000-8000-000000000001',sid='30000000-0000-4000-8000-000000000001';
 try{
 await db.exec(`create role anon;create role authenticated;create role service_role;create schema moaon_control;create table moaon_control.tenants(id uuid primary key,status text);create table moaon_control.memberships(tenant_id uuid,user_id uuid,role text,status text);create table public.dashboard_users(user_id uuid primary key,role text,active boolean);create table public.dashboard_sessions(id uuid primary key,user_id uuid,token_hash text,revoked_at timestamptz,expires_at timestamptz,role text);insert into moaon_control.tenants values('${keys.TENANT}','ACTIVE');insert into public.dashboard_users values('${actor}','OWNER',true);insert into moaon_control.memberships values('${keys.TENANT}','${actor}','OWNER','ACTIVE');insert into public.dashboard_sessions values('${sid}','${actor}','hash',null,now()+interval '1 hour','OWNER');`);
 await db.exec(fs.readFileSync('supabase/migrations/20260912170922_moaon_managed_provider_keys.sql','utf8'));
 const command=async(input,hash='hash')=>(await db.query('select public.moaon_key_command($1,$2,$3,$4) result',[actor,sid,hash,input])).rows[0].result;
 assert.deepEqual(await command({action:'LIST'}),[]);
 const value={action:'SAVE',provider:'COUPANG',revision:0,envelope:{ciphertext:'synthetic'},expiresAt:null};
 assert.equal((await command(value)).revision,1);await assert.rejects(command(value),/KEYS_CONFLICT/);
 const list=await command({action:'LIST'});assert.equal(list[0].revision,1);assert.equal(Object.hasOwn(list[0],'envelope'),false);
 assert.equal((await command({action:'REVEAL',provider:'COUPANG'})).envelope.ciphertext,'synthetic');
 await assert.rejects(command({action:'REVEAL',provider:'COUPANG'},'wrong'),/KEYS_AUTH_REQUIRED/);
 await db.exec(`update moaon_control.memberships set status='INACTIVE'`);await assert.rejects(command({action:'LIST'}),/KEYS_AUTH_REQUIRED/);
 const grants=(await db.query("select has_table_privilege('anon','public.moaon_managed_keys','select') a,has_table_privilege('authenticated','public.moaon_managed_keys','select') b,has_table_privilege('service_role','public.moaon_managed_keys','update') c,has_function_privilege('anon','public.moaon_key_command(uuid,uuid,text,jsonb)','execute') d")).rows[0];assert.deepEqual(grants,{a:false,b:false,c:false,d:false});
 }finally{await db.close();}
});
