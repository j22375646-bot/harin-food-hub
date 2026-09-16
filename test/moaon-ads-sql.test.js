const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs');
test('advertising queue deduplicates, binds recipients, claims once and never retries uncertain jobs',async()=>{
 const {PGlite}=await import('@electric-sql/pglite');const db=new PGlite(),T='a3452bca-e259-40ed-a93d-b8bcc5c1b9e0';
 try{await db.exec(`create role anon;create role authenticated;create role service_role;create schema moaon_control;create table moaon_control.tenants(id uuid primary key);insert into moaon_control.tenants values('${T}');create function moaon_assistant_access_command(uuid,uuid,text,jsonb) returns jsonb language plpgsql as $$begin if $3 is distinct from 'owner' then raise exception 'ASSISTANT_AUTH_REQUIRED';end if;return '{}';end$$;create function moaon_assistant_access_verify(text,boolean) returns jsonb language plpgsql as $$begin if $1 is distinct from 'worker' then raise exception 'ASSISTANT_AUTH_REQUIRED';end if;return '{"scopes":["reports"]}';end$$;create table moaon_assistant_settings(tenant_id uuid,worker_seen_at timestamptz);`);
 for(const f of ['20260916110000_moaon_assistant_bots.sql','20260916150000_moaon_study_bot.sql','20260916150300_moaon_bot_report_accounting.sql','20260916161000_moaon_bot_menus.sql','20260916190000_moaon_specialist_bots.sql','20260916200000_moaon_advertising_jobs.sql'])await db.exec(fs.readFileSync('supabase/migrations/'+f,'utf8'));
 await db.query(`insert into moaon_assistant_bots(tenant_id,slot,revision,username,envelope,settings) values($1,'AD',1,'moaon_ad_bot','{}','{"enabled":true,"chatId":"123","allowedUsers":["123"]}')`,[T]);
 const call=async(v,w=false)=>(await db.query('select moaon_assistant_ads(null,null,$1,$2,$3) v',['owner',v,w?'worker':null])).rows[0].v;
 const yesterday=new Date(Date.now()+9*3600000-86400000).toISOString().slice(0,10),v={action:'ADS_REQUEST',start:yesterday,end:yesterday,fresh:true};assert.equal((await call(v)).jobs.length,1);assert.equal((await call(v)).jobs.length,1);
 await assert.rejects(call(v,true),/AUTH_REQUIRED/);await assert.rejects(call({...v,userId:'456',chatId:'456'},true),/AUTH_REQUIRED/);
 const j=await call({action:'CLAIM'},true);assert.ok(j.id);assert.deepEqual(await call({action:'CLAIM'},true),{});
 await db.exec("update moaon_ads_jobs set started_at=now()-interval '11 minutes'");assert.deepEqual(await call({action:'CLAIM'},true),{});assert.equal((await call({action:'ADS_READ'})).jobs[0].status,'UNKNOWN');
 await call({action:'ADS_SAVE',revision:0,settings:{daily:true,weekly:true,time:'00:00',notify:false,failures:false}});await assert.rejects(call({action:'ADS_SAVE',revision:0,settings:{}}),/CONFLICT/);
 const scoped=await call({action:'ADS_READ',userId:'123',chatId:'123'},true);assert.equal(scoped.settings.daily,true);assert.equal((await db.query("select has_function_privilege('anon','moaon_assistant_ads(uuid,uuid,text,jsonb,text)','EXECUTE') v")).rows[0].v,false);
 }finally{await db.close();}
});
