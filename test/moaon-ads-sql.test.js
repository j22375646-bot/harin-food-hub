const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs');
test('advertising queue deduplicates, binds recipients, claims once and never retries uncertain jobs',async()=>{
 const {PGlite}=await import('@electric-sql/pglite');const db=new PGlite(),T='a3452bca-e259-40ed-a93d-b8bcc5c1b9e0';
 try{await db.exec(`create role anon;create role authenticated;create role service_role;create schema moaon_control;create table moaon_control.tenants(id uuid primary key);insert into moaon_control.tenants values('${T}');create function moaon_assistant_access_command(uuid,uuid,text,jsonb) returns jsonb language plpgsql as $$begin if $3 is distinct from 'owner' then raise exception 'ASSISTANT_AUTH_REQUIRED';end if;return '{}';end$$;create function moaon_assistant_access_verify(text,boolean) returns jsonb language plpgsql as $$begin if $1 is distinct from 'worker' then raise exception 'ASSISTANT_AUTH_REQUIRED';end if;return '{"scopes":["reports"]}';end$$;create table moaon_assistant_settings(tenant_id uuid,worker_seen_at timestamptz);create table moaon_bot_automations(tenant_id uuid,worker_seen_at timestamptz);`);
 for(const f of ['20260916110000_moaon_assistant_bots.sql','20260916150000_moaon_study_bot.sql','20260916150300_moaon_bot_report_accounting.sql','20260916161000_moaon_bot_menus.sql','20260916190000_moaon_specialist_bots.sql','20260916200000_moaon_advertising_jobs.sql','20260916210000_moaon_ads_monitoring.sql','20260916211000_moaon_watchdog_current_pulse.sql','20260916212000_moaon_management_current_pulse.sql','20260916220000_moaon_ads_scope_revisions.sql','20260916230000_moaon_ads_revision_compare.sql'])await db.exec(fs.readFileSync('supabase/migrations/'+f,'utf8'));
 await db.query(`insert into moaon_assistant_bots(tenant_id,slot,revision,username,envelope,settings) values($1,'AD',1,'moaon_ad_bot','{}','{"enabled":true,"chatId":"123","allowedUsers":["123"]}')`,[T]);
 const call=async(v,w=false)=>(await db.query('select moaon_assistant_ads(null,null,$1,$2,$3) v',['owner',v,w?'worker':null])).rows[0].v;
 const yesterday=new Date(Date.now()+9*3600000-86400000).toISOString().slice(0,10),v={action:'ADS_REQUEST',start:yesterday,end:yesterday,fresh:true};assert.equal((await call(v)).jobs.length,1);assert.equal((await call(v)).jobs.length,1);
 await assert.rejects(call(v,true),/AUTH_REQUIRED/);await assert.rejects(call({...v,userId:'456',chatId:'456'},true),/AUTH_REQUIRED/);
 const j=await call({action:'CLAIM'},true);assert.ok(j.id);assert.deepEqual(await call({action:'CLAIM'},true),{});
 await db.exec("update moaon_ads_jobs set started_at=now()-interval '11 minutes'");assert.deepEqual(await call({action:'CLAIM'},true),{});assert.equal((await call({action:'ADS_READ'})).jobs[0].status,'UNKNOWN');
 await call({action:'ADS_SAVE',revision:0,settings:{daily:true,weekly:true,time:'00:00',notify:false,failures:false}});await assert.rejects(call({action:'ADS_SAVE',revision:0,settings:{}}),/CONFLICT/);
 const scoped=await call({action:'ADS_READ',userId:'123',chatId:'123'},true);assert.equal(scoped.settings.daily,true);assert.equal((await db.query("select has_function_privilege('anon','moaon_assistant_ads(uuid,uuid,text,jsonb,text)','EXECUTE') v")).rows[0].v,false);

 const settings={...(await call({action:'ADS_READ'})).settings,daily:false,weekly:false,monthly:true,changes:true,watchdog:true,time:'00:00'};
 await call({action:'ADS_SAVE',revision:1,settings});
 // Freeze only the scheduling function in the isolated database to a month boundary.
 const def=(await db.query("select pg_get_functiondef('moaon_assistant_ads(uuid,uuid,text,jsonb,text)'::regprocedure) v")).rows[0].v;
 await db.exec(def.replaceAll('now()',"timestamptz '2026-10-02 03:00:00+00'"));
 const first=await call({action:'CLAIM'},true);const monthly=(await db.query("select to_jsonb(j) v from moaon_ads_jobs j where dedupe like 'monthly:%'")).rows[0].v;assert.equal(monthly.start_date,'2026-09-01');assert.equal(monthly.end_date,'2026-09-30');await db.exec("update moaon_ads_jobs set status='PENDING',started_at=null where status='RUNNING'");await db.query("update moaon_ads_jobs set status='RUNNING' where id=$1",[monthly.id]);
 await call({action:'FINISH',id:monthly.id,status:'SUCCEEDED',reportId:null,summary:{metrics:{}},error:null},true);
 const change=await call({action:'CLAIM'},true);assert.match(change.dedupe,/change:/);assert.equal(change.start_date,'2026-09-25');assert.equal(change.changeSettings.minClicks,30);
 await call({action:'FINISH',id:change.id,status:'SUCCEEDED',reportId:null,summary:{change:{status:'HOLD'}},error:null},true);
 await db.exec("update moaon_ads_jobs set delivery='SKIPPED' where dedupe not like 'change:%'");assert.deepEqual(await call({action:'DELIVERY'},true),{});assert.equal((await db.query("select delivery from moaon_ads_jobs where dedupe like 'change:%'")).rows[0].delivery,'SKIPPED');
 assert.deepEqual(await call({action:'CLAIM'},true),{});
 await db.query(`insert into moaon_assistant_bots(tenant_id,slot,revision,username,envelope,settings) values($1,'SUP',1,'moaon_sup_bot','{}','{"enabled":true,"chatId":"123","allowedUsers":["123"]}')`,[T]);
 await db.query("insert into moaon_bot_automations values($1,now()-interval '20 minutes')",[T]);
 const watch=async()=>(await db.query('select moaon_assistant_watchdog() v')).rows[0].v;
 assert.equal((await watch()).status,'STALE');assert.equal((await watch()).bot,undefined);
 await db.exec('update moaon_bot_automations set worker_seen_at=now()');assert.ok((await watch()).bot);assert.equal((await watch()).bot,undefined);
 assert.equal((await db.query("select has_function_privilege('anon','moaon_assistant_watchdog(text)','EXECUTE') v")).rows[0].v,false);

 // Return to real clock, preserving source function, then verify frozen scope and revision dedupe.
 await db.exec(def);
 let current=await call({action:'ADS_READ'});await call({action:'ADS_SAVE',revision:current.revision,settings:{...current.settings,daily:false,weekly:false,monthly:false,changes:false,campaignIds:['campaign-a']}});
 const scopedJobs=await call(v);const scopedJob=scopedJobs.jobs.find(x=>x.campaign_ids?.includes('campaign-a'));assert.ok(scopedJob);
 await db.query("update moaon_ads_jobs set status='SUCCEEDED' where id=$1",[scopedJob.id]);
 current=await call({action:'ADS_READ'});await call({action:'ADS_SAVE',revision:current.revision,settings:{...current.settings,campaignIds:['campaign-b']}});
 const revision=await call({action:'ADS_REVISE',id:scopedJob.id});const child=revision.jobs.find(x=>x.parent_id===scopedJob.id);assert.deepEqual(child.campaign_ids,['campaign-a']);assert.equal(child.fresh,true);
 assert.equal((await call({action:'ADS_REVISE',id:scopedJob.id})).jobs.filter(x=>x.parent_id===scopedJob.id).length,1);
 await assert.rejects(call({action:'ADS_REVISE',id:scopedJob.id,userId:'999',chatId:'999'},true),/AUTH_REQUIRED/);

 await db.query("update moaon_ads_jobs set summary=$2 where id=$1",[scopedJob.id,{metrics:{cost:123},period:{start:yesterday,end:yesterday}}]);
 const revisionClaim=await call({action:'CLAIM'},true);assert.equal(revisionClaim.parent_id,scopedJob.id);assert.equal(revisionClaim.parentSummary.metrics.cost,123);
 }finally{await db.close();}
});
