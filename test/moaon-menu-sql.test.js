'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const T='a3452bca-e259-40ed-a93d-b8bcc5c1b9e0',U='11111111-1111-4111-8111-111111111111';
test('menu SQL applies defaults, validates optimistic edits and respects allowed private/group recipients',async()=>{
const {PGlite}=await import('@electric-sql/pglite');const db=new PGlite();try{
await db.exec(`create role anon;create role authenticated;create role service_role;create schema moaon_control;create table moaon_control.tenants(id uuid primary key);insert into moaon_control.tenants values('${T}');create table moaon_assistant_bots(tenant_id uuid,slot text,settings jsonb);insert into moaon_assistant_bots values('${T}','WORK','{"enabled":true,"chatId":"-123","allowedUsers":["123"]}'),('${T}','SOLO','{"enabled":true,"chatId":"123","allowedUsers":["123"]}');create function moaon_assistant_access_command(uuid,uuid,text,jsonb) returns jsonb language plpgsql as $$begin if $3 is distinct from 'owner' then raise exception 'ASSISTANT_AUTH_REQUIRED';end if;return '{}';end$$;create function moaon_assistant_access_verify(text,boolean) returns jsonb language plpgsql as $$begin if $1 is distinct from 'worker' then raise exception 'ASSISTANT_AUTH_REQUIRED';end if;return '{}';end$$;`);
await db.exec(`alter table moaon_assistant_bots add column revision integer not null default 1;
insert into moaon_assistant_bots values('${T}','STUDY','{"enabled":true,"chatId":"123","allowedUsers":["123"]}',1);
create table public.moaon_briefing_cards(id uuid primary key,tenant_id uuid not null,slot text not null,event_id text not null,bot_revision integer not null,chat_id text not null,message_id text,body text not null,created_at timestamptz not null default now());
create table public.moaon_briefing_actions(id uuid primary key,card_id uuid not null references moaon_briefing_cards(id),kind text not null,user_id text not null,due_at timestamptz,status text not null,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),unique(card_id,kind));
create table public.moaon_assistant_settings(tenant_id uuid primary key,settings jsonb not null);
create table public.moaon_learning_proposals(id uuid primary key,tenant_id uuid not null,title text not null,source text not null,status text not null,created_at timestamptz not null default now());
create table public.moaon_assistant_knowledge(id uuid primary key,tenant_id uuid not null,title text,body text,deleted_at timestamptz);
insert into moaon_assistant_settings values('${T}','{"knowledge":true}');
insert into moaon_learning_proposals values('11111111-0000-4000-8000-000000000001','${T}','검토 자료','출처','PENDING',now()),('11111111-0000-4000-8000-000000000002','${T}','승인된 자료','출처','APPROVED',now()),('11111111-0000-4000-8000-000000000003','11111111-0000-4000-8000-000000000099','다른 회사','출처','PENDING',now());
insert into moaon_assistant_knowledge values('11111111-0000-4000-8000-000000000004','${T}','지식','내용',null),('11111111-0000-4000-8000-000000000005','${T}','삭제 지식','내용',now()),('11111111-0000-4000-8000-000000000006','11111111-0000-4000-8000-000000000099','다른 회사','내용',null);
`);
await db.exec(fs.readFileSync('supabase/migrations/20260916161000_moaon_bot_menus.sql','utf8'));
const call=async(v,w=false)=>(await db.query('select moaon_assistant_menu($1,null,$2,$3,$4) v',[U,'owner',JSON.stringify(v),w?'worker':null])).rows[0].v;
const defaults=await call({action:'MENU_READ'});assert.equal(defaults.menus.length,3);assert.equal(defaults.menus.find(m=>m.slot==='STUDY').items.length,6);
const save={action:'MENU_SAVE',slot:'WORK',revision:0,items:['cs','orders']};assert.deepEqual((await call(save)).menus.find(m=>m.slot==='WORK').items,['cs','orders']);await assert.rejects(call(save),/CONFLICT/);await assert.rejects(call({...save,revision:1,items:[]}),/INVALID/);await assert.rejects(call({...save,revision:1,items:['cs','cs']}),/INVALID/);await assert.rejects(call({...save,revision:1,items:['register']}),/INVALID/);await assert.rejects(call(save,true),/INVALID/);
const open={action:'MENU_OPEN',slot:'WORK',userId:'123',chatId:'-123'};assert.deepEqual((await call(open,true)).items,['cs','orders']);await assert.rejects(call({...open,userId:'456'},true),/AUTH_REQUIRED/);await assert.rejects(call({...open,chatId:'-456'},true),/AUTH_REQUIRED/);await assert.rejects(call({...open,slot:'SOLO'},true),/AUTH_REQUIRED/);assert.equal((await call({...open,slot:'SOLO',chatId:'123'},true)).items[0],'tasks');
for(const [i,slot,user,chat,rev] of [[1,'SOLO','123','123',1],[2,'SOLO','456','123',1],[3,'WORK','123','123',1],[4,'SOLO','123','456',1],[5,'SOLO','123','123',2]]){
const id='22222222-0000-4000-8000-00000000000'+i;
await db.query('insert into moaon_briefing_cards(id,tenant_id,slot,event_id,bot_revision,chat_id,body) values($1,$2,$3,$4,$5,$6,$7)',[id,T,slot,'test:'+i,rev,chat,'시험']);
await db.query("insert into moaon_briefing_actions(id,card_id,kind,user_id,due_at,status) values($1,$1,'SNOOZE',$2,now()+interval '1 hour','PENDING')",[id,user]);}
const reminder={action:'MENU_DATA',slot:'SOLO',section:'reminders',userId:'123',chatId:'123'};
const reminders=(await call(reminder,true)).reminders;assert.equal(reminders.length,1);assert.equal(reminders[0].id,'22222222-0000-4000-8000-000000000001');assert.ok(reminders[0].dueAt);
await assert.rejects(call({...reminder,userId:'456'},true),/AUTH_REQUIRED/);
const study={action:'MENU_DATA',slot:'STUDY',section:'pending',userId:'123',chatId:'123'};const knowledge=await call(study,true);assert.equal(knowledge.pending.length,1);assert.equal(knowledge.pending[0].title,'검토 자료');assert.equal(knowledge.approvedCount,1);assert.equal((await call({...study,section:'settings'},true)).approvedCount,1);
await db.exec("update moaon_assistant_settings set settings='{\"knowledge\":false}'");await assert.rejects(call(study,true),/DISABLED/);await assert.rejects(call({...reminder,slot:'WORK'},true),/AUTH_REQUIRED|INVALID/);
await db.exec("update moaon_assistant_bots set settings=settings||'{\"enabled\":false}'");await assert.rejects(call(open,true),/AUTH_REQUIRED/);
await db.exec('set role anon');await assert.rejects(db.query('select * from moaon_bot_menus'),/permission denied/);await db.exec('reset role');
}finally{await db.close();}});
