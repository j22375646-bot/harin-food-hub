'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {valid}=require('../desktop/assistant-learning-contract.cjs');
const ID='77777777-7777-4777-8777-777777777777',ID2='88888888-8888-4888-8888-888888888888',U='11111111-1111-4111-8111-111111111111',T='a3452bca-e259-40ed-a93d-b8bcc5c1b9e0';
const input={action:'LEARN_SUBMIT',id:ID,title:'시험 제품',body:'자료에서 확인한 내용',source:'시험 자료 · 2026-09-16',targetId:null,baseRevision:0};

test('direct knowledge publication is atomic, idempotent and rejects stale replacement',async()=>{
 const {PGlite}=await import('@electric-sql/pglite');const db=new PGlite();try{
 await db.exec(`create role anon;create role authenticated;create role service_role;create schema moaon_control;create table moaon_control.tenants(id uuid primary key);insert into moaon_control.tenants values('${T}');create table public.dashboard_users(user_id uuid primary key);insert into public.dashboard_users values('${U}');create table public.moaon_assistant_settings(tenant_id uuid,settings jsonb);insert into public.moaon_assistant_settings values('${T}','{"knowledge":true}');create table public.moaon_assistant_knowledge(id uuid primary key,tenant_id uuid,revision integer default 1,title text,body text,deleted_at timestamptz,updated_at timestamptz default now());create function public.moaon_assistant_access_command(uuid,uuid,text,jsonb) returns jsonb language plpgsql as $$begin if $3 is distinct from 'owner' then raise exception 'ASSISTANT_AUTH_REQUIRED';end if;return '{}';end$$;create function public.moaon_assistant_access_verify(text,boolean) returns jsonb language plpgsql as $$begin if $1 is distinct from 'worker' then raise exception 'ASSISTANT_AUTH_REQUIRED';end if;return '{"userId":"${U}"}';end$$;`);
 await db.exec(fs.readFileSync('supabase/migrations/20260916150100_moaon_learning.sql','utf8'));
 const migration=fs.readFileSync('supabase/migrations/20260919193623_assistant_live_knowledge_order_delivery.sql','utf8');await db.exec(migration.slice(migration.indexOf('create or replace function')));
 const call=async(v)=>(await db.query('select public.moaon_assistant_learning(null,null,null,$1,$2) v',[JSON.stringify(v),'worker'])).rows[0].v;
 assert.equal((await call(input)).status,'APPROVED');assert.equal((await call(input)).status,'APPROVED');assert.equal((await db.query('select count(*)::int n from moaon_assistant_knowledge')).rows[0].n,1);await assert.rejects(call({...input,title:'different'}),/CONFLICT/);
 await call({...input,id:ID2,targetId:ID,baseRevision:1,body:'updated'});assert.equal((await db.query('select revision from moaon_assistant_knowledge where id=$1',[ID])).rows[0].revision,2);await assert.rejects(call({...input,id:'99999999-9999-4999-8999-999999999999',targetId:ID,baseRevision:1}),/CONFLICT/);assert.equal((await db.query("select count(*)::int n from moaon_learning_proposals where status='PENDING'")).rows[0].n,0);
 }finally{await db.close();}
});

test('new order timing patch preserves authorization and sends second batch outside old window',async()=>{
 const {fixture,ids,T}=require('./moaon-personal-preferences-sql.test.js');const {db,call}=await fixture(true);
 try{
  const migration=fs.readFileSync('supabase/migrations/20260919193623_assistant_live_knowledge_order_delivery.sql','utf8');await db.exec(migration.slice(0,migration.indexOf('create or replace function')));
  let fn=(await db.query("select pg_get_functiondef('public.moaon_assistant_preferences(uuid,uuid,text,jsonb,text)'::regprocedure) s")).rows[0].s;assert.ok(!fn.includes('extract(hour from ts)'));fn=fn.replace("ts timestamp:=now() at time zone 'Asia/Seoul'","ts timestamp:=(now() at time zone 'Asia/Seoul')::date+interval '21 hours'");await db.exec(fn);
  await db.exec("update moaon_personal_preferences set notify_since=now()-interval '1 day'");
  const cases=async v=>(await db.query('select public.moaon_assistant_cases(null,null,null,$1,$2) r',[JSON.stringify(v),'worker'])).rows[0].r;
  let obs=[];
  for(const amount of [2,3]){
   await db.exec("update moaon_case_settings set checked_at=now()-interval '3 minutes'");let lease=(await cases({action:'BEGIN'})).lease;assert.ok(lease);
   obs=Array.from({length:amount},(_,i)=>({platform:'CAFE24',kind:'ORDER',state:'PENDING',sourceId:'new-'+i,orderedAt:new Date().toISOString()}));await cases({action:'APPLY',lease,observations:obs,sources:[]});
   const jobs=(await call(0,{action:'PREF_DUE'},true)).jobs.filter(j=>j.kind==='NEW_ORDER');assert.equal(jobs.length,1);const d=await call(0,{...jobs[0],action:'PREF_CLAIM'},true);assert.equal(d.groups[0].count,amount===2?2:1);assert.equal((await call(0,{...jobs[0],action:'PREF_CLAIM'},true)).claimed,false);
  }
 }finally{await db.close();}
});
