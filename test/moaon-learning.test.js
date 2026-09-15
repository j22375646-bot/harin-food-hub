'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {valid}=require('../desktop/assistant-learning-contract.cjs');
const ID='77777777-7777-4777-8777-777777777777',ID2='88888888-8888-4888-8888-888888888888',U='11111111-1111-4111-8111-111111111111',T='a3452bca-e259-40ed-a93d-b8bcc5c1b9e0';
const input={action:'LEARN_SUBMIT',id:ID,title:'시험 제품',body:'자료에서 확인한 내용',source:'시험 자료 · 2026-09-16',targetId:null,baseRevision:0};
test('learning contracts separate owner review from worker submissions',()=>{assert.ok(valid(input,true));assert.equal(valid(input),false);assert.equal(valid({action:'LEARN_APPROVE',id:ID,revision:1},true),false);for(const patch of [{source:''},{body:'a'.repeat(7201)},{targetId:ID,baseRevision:0},{targetId:null,baseRevision:1},{id:'bad'}])assert.equal(valid({...input,...patch},true),false);assert.equal(valid({...input,token:'secret'},true),false);});
test('learning SQL requires review, records edits, refuses stale replacement and duplicate publication',async()=>{
 const {PGlite}=await import('@electric-sql/pglite');const db=new PGlite();try{
 await db.exec(`create role anon;create role authenticated;create role service_role;create schema moaon_control;create table moaon_control.tenants(id uuid primary key);insert into moaon_control.tenants values('${T}');create table public.dashboard_users(user_id uuid primary key);insert into public.dashboard_users values('${U}');create table public.moaon_assistant_settings(tenant_id uuid,settings jsonb);insert into public.moaon_assistant_settings values('${T}','{"knowledge":true}');create table public.moaon_assistant_knowledge(id uuid primary key,tenant_id uuid,revision integer default 1,title text,body text,deleted_at timestamptz,updated_at timestamptz default now());create function public.moaon_assistant_access_command(uuid,uuid,text,jsonb) returns jsonb language plpgsql as $$begin if $3 is distinct from 'owner' then raise exception 'ASSISTANT_AUTH_REQUIRED';end if;return '{}';end$$;create function public.moaon_assistant_access_verify(text,boolean) returns jsonb language plpgsql as $$begin if $1 is distinct from 'worker' then raise exception 'ASSISTANT_AUTH_REQUIRED';end if;return '{"userId":"${U}"}';end$$;`);
 await db.exec(fs.readFileSync('supabase/migrations/20260916150100_moaon_learning.sql','utf8'));
 const call=async(v,worker=false)=>(await db.query('select public.moaon_assistant_learning($1,null,$2,$3,$4) v',[U,'owner',JSON.stringify(v),worker?'worker':null])).rows[0].v;
 assert.equal((await call(input,true)).status,'PENDING');assert.equal((await call(input,true)).id,ID);assert.equal((await call({action:'LEARN_READ'})).knowledge.length,0);
 await assert.rejects(call({...input,title:'changed'},true),/CONFLICT/);await assert.rejects(call({action:'LEARN_APPROVE',id:ID,revision:1},true),/INVALID/);
 await call({action:'LEARN_EDIT',id:ID,revision:1,title:'검토한 제품',body:'수정 본문',source:'원본 문서'});
 await assert.rejects(call({action:'LEARN_APPROVE',id:ID,revision:1}),/CONFLICT/);
 await call({action:'LEARN_APPROVE',id:ID,revision:2});await call({action:'LEARN_APPROVE',id:ID,revision:2});
 const read=await call({action:'LEARN_READ'});assert.equal(read.knowledge.length,1);assert.match(read.knowledge[0].body,/수정 본문.*\n\n출처: 원본 문서/);assert.equal(read.proposals[0].status,'APPROVED');assert.equal((await db.query('select count(*)::int n from moaon_learning_events')).rows[0].n,3);
 await call({...input,id:ID2,targetId:ID,baseRevision:1},true);await db.exec(`update moaon_assistant_knowledge set revision=2 where id='${ID}'`);await assert.rejects(call({action:'LEARN_APPROVE',id:ID2,revision:1}),/CONFLICT/);await call({action:'LEARN_REJECT',id:ID2,revision:1});await call({action:'LEARN_REJECT',id:ID2,revision:1});assert.equal((await call({action:'LEARN_READ'})).knowledge.length,1);
 await db.exec("update moaon_assistant_settings set settings='{}'");await assert.rejects(call({...input,id:'99999999-9999-4999-8999-999999999999'},true),/DISABLED/);
 await db.exec('set role anon');await assert.rejects(db.query('select * from moaon_learning_proposals'),/permission denied/);await db.exec('reset role');
 }finally{await db.close();}
});
