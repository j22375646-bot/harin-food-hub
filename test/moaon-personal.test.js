'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {valid}=require('../desktop/assistant-personal-contract.cjs');
const T='a3452bca-e259-40ed-a93d-b8bcc5c1b9e0',U='11111111-1111-4111-8111-111111111111',OTHER='22222222-2222-4222-8222-222222222222',ID='33333333-3333-4333-8333-333333333333',ID2='44444444-4444-4444-8444-444444444444';
test('personal contracts reject wrong audience, arbitrary actor, group and malformed revisions',()=>{
 assert.ok(valid({action:'PERSONAL_BIND',revision:0}));assert.equal(valid({action:'PERSONAL_BIND',revision:0},true),false);
 const v={action:'PERSONAL_PREPARE',userId:'123',chatId:'123',id:ID,revision:1,verb:'COMPLETE'};assert.ok(valid(v,true));
 for(const patch of [{chatId:'-123'},{actorId:U},{revision:0},{verb:'DELETE'},{id:'no'}])assert.equal(valid({...v,...patch},true),false);
});
test('personal SQL enforces bound assignee, confirmation expiry, optimistic concurrency and idempotency',async()=>{
 const {PGlite}=await import('@electric-sql/pglite');const db=new PGlite();try{
 await db.exec(`create role anon;create role authenticated;create role service_role;create schema moaon_control;
 create table moaon_control.tenants(id uuid primary key,status text);insert into moaon_control.tenants values('${T}','ACTIVE');
 create table public.dashboard_users(user_id uuid primary key,display_name text,active boolean,role text,created_at timestamptz default now());insert into dashboard_users values('${U}','나',true,'OWNER'),('${OTHER}','다른 사용자',true,'OWNER');
 create table moaon_control.memberships(tenant_id uuid,user_id uuid,version integer,status text,role text);insert into moaon_control.memberships values('${T}','${U}',1,'ACTIVE','OWNER'),('${T}','${OTHER}',1,'ACTIVE','OWNER');
 create table dashboard_sessions(id uuid,user_id uuid,token_hash text,revoked_at timestamptz,expires_at timestamptz,role text);
 create table moaon_assistant_bots(tenant_id uuid,slot text,revision integer,settings jsonb);insert into moaon_assistant_bots values('${T}','SOLO',1,'{"enabled":true,"chatId":"123","allowedUsers":["123"]}');
 create function moaon_assistant_access_command(uuid,uuid,text,jsonb) returns jsonb language plpgsql as $$begin if $3 is distinct from 'owner' then raise exception 'ASSISTANT_AUTH_REQUIRED';end if;return '{}';end$$;
 create table verify_calls(id integer generated always as identity primary key,consume boolean not null);
 create function moaon_assistant_access_verify(text,boolean) returns jsonb language plpgsql as $$begin if $1 not in ('worker','noscope') then raise exception 'ASSISTANT_AUTH_REQUIRED';end if;insert into public.verify_calls(consume) values($2);return case when $1='worker' then '{"scopes":["tasks"]}'::jsonb else '{}'::jsonb end;end$$;`);
 await db.exec(fs.readFileSync('supabase/migrations/20260912012319_moaon_team_tasks.sql','utf8'));
 await db.exec('alter table moaon_tasks add column deleted_at timestamptz');
 await db.exec(fs.readFileSync('supabase/migrations/20260916160000_moaon_personal_tasks.sql','utf8'));
 await db.exec(fs.readFileSync('supabase/migrations/20260916162000_moaon_personal_accounting.sql','utf8'));
 const consumed=async()=>(await db.query('select consume from verify_calls order by id desc limit 1')).rows[0].consume;
 await db.exec(`insert into moaon_tasks(id,tenant_id,title,notes,due_date,assigned_to,created_by) values('${ID}','${T}','내 업무','내용',current_date,'${U}','${U}'),('${ID2}','${T}','타인 업무','내용',current_date,'${OTHER}','${OTHER}')`);
 const call=async(v,w=false,actor=U,key='worker')=>(await db.query('select moaon_assistant_personal($1,null,$2,$3,$4) v',[actor,'owner',JSON.stringify(v),w?key:null])).rows[0].v;
 const list={action:'PERSONAL_LIST',userId:'123',chatId:'123'},prep={action:'PERSONAL_PREPARE',userId:'123',chatId:'123',id:ID,revision:1,verb:'COMPLETE'};
 await assert.rejects(call(list,true),/AUTH_REQUIRED/);assert.equal((await call({action:'PERSONAL_READ'})).revision,0);
 assert.equal((await call({action:'PERSONAL_BIND',revision:0})).binding.userId,U);
 await assert.rejects(call({action:'PERSONAL_BIND',revision:1},false,OTHER),/AUTH_REQUIRED/);
 assert.deepEqual((await call(list,true)).tasks.map(t=>t.id),[ID]);assert.equal(await consumed(),true);await assert.rejects(call(list,true,U,'invalid-worker'),/AUTH_REQUIRED/);
 await assert.rejects(call(list,true,U,'noscope'),/DISABLED/);await assert.rejects(call({...list,chatId:'-123'},true),/AUTH_REQUIRED/);
 await assert.rejects(call({...prep,id:ID2},true),/CONFLICT/);await assert.rejects(call({...prep,revision:99},true),/CONFLICT/);await assert.rejects(call({...list,userId:'456',chatId:'456'},true),/AUTH_REQUIRED/);
 let p=await call(prep,true);assert.equal(await consumed(),false);await assert.rejects(call(prep,true,U,'invalid-worker'),/AUTH_REQUIRED/);const confirm={action:'PERSONAL_CONFIRM',userId:'123',chatId:'123',confirmationId:p.confirmationId};
 await assert.rejects(call(confirm,true,U,'invalid-worker'),/AUTH_REQUIRED/);
 await db.exec('update moaon_assistant_bots set revision=2');await assert.rejects(call(confirm,true),/AUTH_REQUIRED/);await db.exec('update moaon_assistant_bots set revision=1');
 await db.exec('update moaon_control.memberships set version=2');await assert.rejects(call(confirm,true),/AUTH_REQUIRED/);await db.exec('update moaon_control.memberships set version=1');
 await db.exec(`update moaon_tasks set assigned_to='${OTHER}' where id='${ID}'`);await assert.rejects(call(confirm,true),/CONFLICT/);await db.exec(`update moaon_tasks set assigned_to='${U}' where id='${ID}'`);
 await db.exec(`update moaon_personal_confirmations set expires_at=now()-interval '1 second'`);await assert.rejects(call(confirm,true),/CONFLICT/);
 p=await call({...prep,verb:'TOMORROW'},true);const snooze=await call({...confirm,confirmationId:p.confirmationId},true);assert.equal(await consumed(),false);assert.equal(snooze.status,'OPEN');assert.equal(snooze.revision,2);
 await assert.rejects(call({...prep,verb:'TOMORROW',revision:2},true),/CONFLICT/);
 p=await call({...prep,revision:2},true);const done=await call({...confirm,confirmationId:p.confirmationId},true);assert.equal(await consumed(),false);assert.equal(done.status,'DONE');assert.deepEqual(await call({...confirm,confirmationId:p.confirmationId},true),done);await db.query('update moaon_tasks set deleted_at=now() where id=$1',[ID]);await assert.rejects(call({...confirm,confirmationId:p.confirmationId},true),/CONFLICT/);await db.query('update moaon_tasks set deleted_at=null where id=$1',[ID]);
 assert.equal((await db.query('select count(*)::int n from moaon_task_events')).rows[0].n,2);
 const unbound=await call({action:'PERSONAL_UNBIND',revision:1});assert.equal(unbound.revision,2);assert.equal(unbound.binding,null);await assert.rejects(call(list,true),/AUTH_REQUIRED/);
 await call({action:'PERSONAL_BIND',revision:2});await assert.rejects(call({...confirm,confirmationId:p.confirmationId},true),/AUTH_REQUIRED/);
 await db.query("update moaon_tasks set status='OPEN' where id=$1",[ID]);
 for(let i=0;i<27;i++)await call({...prep,revision:3},true);await assert.rejects(call({...prep,revision:3},true),/RATE_LIMITED/);
 await db.exec('set role anon');await assert.rejects(db.query('select * from moaon_personal_bindings'),/permission denied/);await assert.rejects(db.query('select * from moaon_personal_confirmations'),/permission denied/);await db.exec('reset role');
 }finally{await db.close();}
});


test('personal owner transport accepts only bounded mapping snapshot',async()=>{
 const {command}=require('../desktop/assistant-automation-transport.cjs');
 let value={revision:1,binding:{telegramId:'123',userId:U,displayName:'나',revision:1},me:{userId:U,displayName:'나'}};
 const fetch=async()=>({ok:true,text:async()=>JSON.stringify({ok:true,value})});assert.equal((await command(fetch,{action:'PERSONAL_READ'})).ok,true);
 value.binding.telegramId='-123';assert.equal((await command(fetch,{action:'PERSONAL_READ'})).ok,false);
 value={revision:0,binding:null,me:{userId:U,displayName:'나'}};assert.equal((await command(fetch,{action:'PERSONAL_READ'})).ok,true);
 value.token='secret';assert.equal((await command(fetch,{action:'PERSONAL_READ'})).ok,false);
 assert.equal((await command(fetch,{action:'PERSONAL_LIST',userId:'123',chatId:'123'})).code,'ASSISTANT_INVALID');
});
test('personal worker routes to dedicated RPC and cannot perform owner binding',async()=>{
 const {handler}=require('../lib/assistant/automation.js');let called;
 const h=handler({worker:true,database:()=>({rpc:async(name,args)=>{called={name,args};return {data:{tasks:[]}};}})});
 const request=input=>new Request('https://harin-cafe24-sync.vercel.app/api/moaon/assistant/worker',{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer moaon_ro_'+ 'a'.repeat(43)},body:JSON.stringify(input)});
 assert.equal((await h(request({action:'PERSONAL_LIST',userId:'123',chatId:'123'}))).status,200);assert.equal(called.name,'moaon_assistant_personal');assert.equal(called.args.p_actor,null);
 assert.equal((await h(request({action:'PERSONAL_BIND',revision:0}))).status,400);
});
