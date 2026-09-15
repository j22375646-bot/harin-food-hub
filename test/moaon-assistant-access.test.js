'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),{PGlite}=require('@electric-sql/pglite');
const A='a3452bca-e259-40ed-a93d-b8bcc5c1b9e0',U='11111111-1111-4111-8111-111111111111',S='22222222-2222-4222-8222-222222222222',H='a'.repeat(64);
test('assistant access SQL enforces roles, expiry, scope, revocation, revision and rate limit',async()=>{
 const db=new PGlite();try{
 await db.exec(`create role anon;create role authenticated;create role service_role;create schema moaon_control;create table moaon_control.tenants(id uuid primary key,status text);create table public.dashboard_users(user_id uuid primary key,role text,active boolean);create table public.dashboard_sessions(id uuid,user_id uuid,token_hash text,revoked_at timestamptz,expires_at timestamptz,role text);create table moaon_control.memberships(tenant_id uuid,user_id uuid,version int,status text,role text);insert into moaon_control.tenants values('${A}','ACTIVE');insert into public.dashboard_users values('${U}','OWNER',true);insert into public.dashboard_sessions values('${S}','${U}','sessionhash',null,now()+interval '1 day','OWNER');insert into moaon_control.memberships values('${A}','${U}',1,'ACTIVE','OWNER');`);
 await db.exec(fs.readFileSync('supabase/migrations/20260915171752_moaon_assistant_access.sql','utf8'));
 const command=async v=>(await db.query('select public.moaon_assistant_access_command($1,$2,$3,$4) v',[U,S,'sessionhash',JSON.stringify(v)])).rows[0].v;
 const verify=async consume=>(await db.query('select public.moaon_assistant_access_verify($1,$2) v',[H,consume])).rows[0].v;
 assert.equal((await command({action:'STATUS'})).status,'NOT_ISSUED');
 assert.equal((await command({action:'ISSUE',revision:0,tokenHash:H,scopes:['orders']})).status,'ACTIVE');assert.deepEqual((await verify(true)).scopes,['orders']);
 for(let i=0;i<9;i++)await verify(true);await assert.rejects(verify(true),/RATE_LIMITED/);await verify(false);
 await assert.rejects(command({action:'ISSUE',revision:0,tokenHash:H,scopes:['orders']}),/CONFLICT/);
 await command({action:'REVOKE',revision:1});await assert.rejects(verify(false),/AUTH_REQUIRED/);
 await command({action:'ISSUE',revision:2,tokenHash:H,scopes:['tasks']});await db.exec('update moaon_control.memberships set version=2');await assert.rejects(verify(false),/AUTH_REQUIRED/);
 await assert.rejects(command({action:'ISSUE',revision:3,tokenHash:H,scopes:['shipping.write']}),/INVALID/);
 await command({action:'ISSUE',revision:3,tokenHash:H,scopes:['orders']});await db.exec("update public.moaon_assistant_access set expires_at=now()-interval '1 second'");await assert.rejects(verify(false),/AUTH_REQUIRED/);assert.equal((await command({action:'STATUS'})).status,'EXPIRED');
 await command({action:'ISSUE',revision:4,tokenHash:H,scopes:['orders']});await db.exec('update public.dashboard_users set active=false');await assert.rejects(verify(false),/AUTH_REQUIRED/);await assert.rejects(command({action:'STATUS'}),/AUTH_REQUIRED/);
 await db.exec("set role anon");await assert.rejects(db.query('select public.moaon_assistant_access_verify($1,false)',[H]),/permission denied/);await assert.rejects(db.query('select * from public.moaon_assistant_access'),/permission denied/);
 }finally{await db.close();}
});
const {createRead,hash,valid}=require('../lib/assistant/access.js');
test('external read authenticates before data, projects scopes, rejects revoked response and leaks no token',async()=>{
 const key='moaon_ro_'+'a'.repeat(43),request=()=>new Request('https://hub.example/api/moaon/assistant/read',{headers:{authorization:'Bearer '+key}}),identity={tenantId:A,userId:U,revision:1,scopes:['orders']};let reads=0,calls=0;
 const database=()=>({rpc:async(_,args)=>{assert.equal(args.p_hash,hash(key));calls++;return {data:identity};}});
 const load=async v=>{reads++;assert.deepEqual(v.scopes,['orders']);return {status:'READY',retrievedAt:new Date().toISOString(),sources:{orders:{count:1},tasks:{private:'EXCLUDED'}},caveats:[]};};
 let r=await createRead({database,load})(request());assert.equal(r.status,200);assert.equal(calls,2);assert.doesNotMatch(await r.text(),/EXCLUDED|moaon_ro_/);
 r=await createRead({database,load})(new Request(request().url));assert.equal(r.status,401);assert.equal(reads,1);
 let n=0;r=await createRead({database:()=>({rpc:async()=>++n===1?{data:identity}:{error:{message:'ASSISTANT_AUTH_REQUIRED'}}}),load})(request());assert.equal(r.status,401);assert.doesNotMatch(await r.text(),/count/);
 assert.equal(valid({action:'ISSUE',revision:0,scopes:['orders','orders']}),false);
});
const {createAdmin}=require('../lib/assistant/access.js');
test('admin key issuance requires same-origin owner session and stores only hash',async()=>{let calls=0;const keyCookie=require('../lib/dashboard-auth.js').COOKIE_NAME;const req=(headers={},body={action:'ISSUE',revision:0,scopes:['orders']})=>new Request('https://hub.example/api/moaon/assistant/access',{method:'POST',headers:{origin:'https://hub.example','content-type':'application/json',cookie:keyCookie+'=test',...headers},body:JSON.stringify(body)});const database=()=>({rpc:async(name,v)=>{calls++;assert.match(v.p_input.tokenHash,/^[a-f0-9]{64}$/);assert.doesNotMatch(JSON.stringify(v),/moaon_ro_/);return {data:{revision:1,status:'ACTIVE'}};}});const admin=createAdmin({database,validate:async()=>({role:'OWNER',id:S,userId:U})});assert.equal((await admin(req({origin:'https://evil.example'}))).status,401);assert.equal(calls,0);assert.equal((await createAdmin({database,validate:async()=>({role:'STAFF'})})(req())).status,401);const response=await admin(req());assert.equal(response.status,200);assert.match((await response.json()).key,/^moaon_ro_[A-Za-z0-9_-]{43}$/);assert.equal(calls,1);});
test('unselected data readers never run',async()=>{const {loadWorkspaceAssistant}=require('../lib/dashboard/workspace-assistant-loader.js');let table='';const chain={select(){return this},eq(){return this},is(){return this},lte(){return this},order(){return this},limit(){return Promise.resolve({data:[]})}};const result=await loadWorkspaceAssistant({db:{from(n){table=n;return chain}},context:{tenantId:A,userId:U},scopes:['tasks'],ordersReader(){throw Error('not allowed')},csReader(){throw Error('not allowed')}});assert.equal(table,'moaon_tasks');assert.deepEqual(Object.keys(result.sources),['tasks']);assert.equal(result.sources.tasks.status,'READY');});
