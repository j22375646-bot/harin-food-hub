'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const bots=require('../desktop/assistant-bots-contract.cjs'),menus=require('../desktop/assistant-menu-contract.cjs');
test('specialists accept only one private recipient and own menu catalog',()=>{
 for(const slot of ['SUP','AD']){const s={enabled:true,chatId:'123',allowedUsers:['123'],instructions:'간결하게',notifications:false};assert.equal(bots.settings(s,slot),true);assert.equal(bots.settings({...s,chatId:'-123'},slot),false);assert.equal(bots.settings({...s,allowedUsers:['456']},slot),false);assert.equal(bots.settings({...s,notifications:true},slot),false);}
 assert.equal(menus.valid({action:'MENU_DATA',slot:'SUP',userId:'123',chatId:'123',section:'health'},true),true);
 assert.equal(menus.valid({action:'MENU_DATA',slot:'AD',userId:'123',chatId:'123',section:'health'},true),false);
 assert.equal(menus.items(['health'],'AD'),false);
});
test('specialist migration preserves authorization and health returns no credentials',async()=>{
 const {PGlite}=await import('@electric-sql/pglite');const db=new PGlite();const T='a3452bca-e259-40ed-a93d-b8bcc5c1b9e0';
 try{
 await db.exec(`create role anon;create role authenticated;create role service_role;create schema moaon_control;create table moaon_control.tenants(id uuid primary key);insert into moaon_control.tenants values('${T}');create function moaon_assistant_access_command(uuid,uuid,text,jsonb) returns jsonb language plpgsql as $$begin if $3 is distinct from 'owner' then raise exception 'ASSISTANT_AUTH_REQUIRED';end if;return '{}';end$$;create function moaon_assistant_access_verify(text,boolean) returns jsonb language plpgsql as $$begin if $1 is distinct from 'worker' then raise exception 'ASSISTANT_AUTH_REQUIRED';end if;return '{}';end$$;create table moaon_assistant_settings(tenant_id uuid,worker_seen_at timestamptz);`);
 for(const f of ['20260916110000_moaon_assistant_bots.sql','20260916150000_moaon_study_bot.sql','20260916150300_moaon_bot_report_accounting.sql','20260916161000_moaon_bot_menus.sql','20260916190000_moaon_specialist_bots.sql'])await db.exec(fs.readFileSync('supabase/migrations/'+f,'utf8'));
 const call=async(v,worker=null)=>(await db.query('select moaon_assistant_menu(null,null,$1,$2,$3) v',['owner',JSON.stringify(v),worker])).rows[0].v;
 assert.equal((await call({action:'MENU_READ'})).menus.length,5);
 await db.query(`insert into moaon_assistant_bots(tenant_id,slot,revision,username,envelope,settings) values($1,'SUP',1,'moaon_sup_bot','{"private":"never expose"}','{"enabled":true,"chatId":"123","allowedUsers":["123"]}')`,[T]);
 const v={action:'MENU_DATA',slot:'SUP',userId:'123',chatId:'123',section:'health'};
 const health=await call(v,'worker');assert.equal(health.bots[0].slot,'SUP');assert.doesNotMatch(JSON.stringify(health),/envelope|never expose|allowedUsers/);
 await assert.rejects(call({...v,userId:'456'},'worker'),/AUTH_REQUIRED/);await assert.rejects(call({...v,chatId:'-123'},'worker'),/AUTH_REQUIRED/);await assert.rejects(call(v,'invalid'),/AUTH_REQUIRED/);
 await assert.rejects(call({action:'MENU_SAVE',slot:'AD',revision:0,items:['health']}),/INVALID/);
 const defs=(await db.query("select pg_get_functiondef('moaon_assistant_bot_command(uuid,uuid,text,jsonb,text)'::regprocedure) d")).rows[0].d;assert.match(defs,/a='BOT_CONFIG'/);
 }finally{await db.close();}
});
