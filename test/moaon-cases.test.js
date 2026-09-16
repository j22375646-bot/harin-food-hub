const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs');
const contract=require('../desktop/assistant-cases-contract.cjs');
test('case commands reject extra scope and malformed identities',()=>{assert.equal(contract.valid({action:'CASE_TICK'},true),true);assert.equal(contract.valid({action:'CASE_TICK'}),false);assert.equal(contract.valid({action:'CASE_READ',userId:'123',chatId:'-456'},true),true);assert.equal(contract.valid({action:'CASE_READ',tenantId:'other'}),false);});
test('case source projects no personal data and missing completion is never resolved',async()=>{
 const db={from:table=>({select:()=>({order:()=>({limit:async()=>({data:table==='coupang_inquiries'?[{inquiry_id:1,answered:null},{inquiry_id:2,answered:true},{inquiry_id:3,answered:false}]:[]})})})})};
 const r=await require('../lib/assistant/cases-source.js').load({db,ordersReader:async()=>({channels:[{platform:'NAVER',status:'READY'}],orders:[{platform:'NAVER',hubOrderId:'abc',stage:'PAID',receiver:{name:'secret'}},{platform:'NAVER',hubOrderId:'done',stage:'SHIPPING'}]})});assert.equal(r.observations.length,4);assert.doesNotMatch(JSON.stringify(r),/secret/);assert.equal(r.observations.find(x=>x.sourceId==='done').state,'RESOLVED');assert.equal(r.observations.some(x=>x.sourceId==='1'),false);
});
test('tracking is idempotent, missing source holds, explicit resolution and snooze produce one event',async()=>{
 const {PGlite}=await import('@electric-sql/pglite'),db=new PGlite(),T='a3452bca-e259-40ed-a93d-b8bcc5c1b9e0';try{
 await db.exec(`create role anon;create role authenticated;create role service_role;create schema moaon_control;create table moaon_control.tenants(id uuid primary key);insert into moaon_control.tenants values('${T}');create table moaon_assistant_bots(tenant_id uuid,slot text,revision integer,settings jsonb,envelope jsonb);create function moaon_assistant_access_command(uuid,uuid,text,jsonb) returns jsonb language plpgsql as $$begin if $3 is distinct from 'owner' then raise exception 'ASSISTANT_AUTH_REQUIRED';end if;return '{}';end$$;create function moaon_assistant_access_verify(text,boolean) returns jsonb language plpgsql as $$begin if $1 is distinct from 'worker' then raise exception 'ASSISTANT_AUTH_REQUIRED';end if;return '{"scopes":["orders","cs"]}';end$$;`);
 await db.exec(fs.readFileSync('supabase/migrations/20260917010000_moaon_case_tracking.sql','utf8'));
 if(fs.existsSync('supabase/migrations/20260917011000_moaon_case_digest.sql'))await db.exec(fs.readFileSync('supabase/migrations/20260917011000_moaon_case_digest.sql','utf8').replace("extract(hour from now() at time zone 'Asia/Seoul') not between 8 and 19",'false'));
 await db.query(`insert into moaon_assistant_bots values($1,'WORK',1,'{"enabled":true,"chatId":"123","allowedUsers":["123"]}','{}')`,[T]);
 const call=async(v,w=false)=>(await db.query('select moaon_assistant_cases(null,null,$1,$2,$3) v',['owner',v,w?'worker':null])).rows[0].v;
 const observe=async rows=>{const l=await call({action:'BEGIN',test:true});return call({action:'APPLY',lease:l.lease,observations:rows,sources:[]});};
 const pending={platform:'NAVER',kind:'ORDER',sourceId:'one',state:'PENDING'};
 await call({action:'CASE_SAVE',revision:0,enabled:true});let r=await observe([pending]);assert.equal(r.cases.length,1);const id=r.cases[0].id;
 r=await observe([pending]);assert.equal(r.events.length,1);
 r=await observe([]);assert.equal(r.cases[0].status,'OPEN');assert.equal(r.cases[0].observed_state,'UNKNOWN');
 r=await observe([{...pending,state:'RESOLVED'}]);assert.equal(r.cases[0].status,'RESOLVED');assert.equal(r.events.length,2);
 r=await observe([pending]);assert.equal(r.cases[0].status,'OPEN');assert.equal(r.events.length,3);
 r=await call({action:'CASE_ACT',id,revision:r.cases[0].revision,verb:'SNOOZE'});assert.equal(r.cases[0].status,'SNOOZED');
 await db.exec("update moaon_cases set snooze_until=now()-interval '1 minute'");r=await observe([pending]);assert.equal(r.cases[0].status,'OPEN');assert.equal(r.events.filter(e=>e.kind==='REMINDER').length,1);
 r=await observe([pending]);assert.equal(r.events.filter(e=>e.kind==='REMINDER').length,1);
 await assert.rejects(call({action:'CASE_ACT',id,revision:0,verb:'TAKE'}),/CONFLICT/);
 await assert.rejects(call({action:'CASE_READ',userId:'999',chatId:'123'},true),/AUTH_REQUIRED/);
 await assert.rejects(call({action:'CASE_SAVE',revision:1,enabled:false},true),/AUTH_REQUIRED/);
 await db.exec('update moaon_assistant_bots set revision=2');await call({action:'DELIVERY'});assert.ok((await call({action:'CASE_READ'})).events.some(e=>e.delivery==='SKIPPED'));
 await db.exec('delete from moaon_case_events;delete from moaon_cases');
 await observe(['NAVER','CAFE24','COUPANG'].map(platform=>({...pending,platform})).concat([{...pending,platform:'COUPANG',kind:'CS'}]));
 const batch=await call({action:'DELIVERY_BATCH'});assert.ok(batch.batchId);assert.equal(batch.groups.reduce((n,g)=>n+g.count,0),4);assert.equal(batch.groups.length,4);
 assert.deepEqual(await call({action:'DELIVERY_BATCH'}),{});
 await call({action:'RESULT_BATCH',id:batch.batchId,status:'SENT'});
 assert.equal((await call({action:'CASE_READ'})).events.filter(e=>e.delivery==='SENT').length,4);
 assert.equal((await db.query("select has_function_privilege('anon','moaon_assistant_cases(uuid,uuid,text,jsonb,text)','execute') v")).rows[0].v,false);
 }finally{await db.close();}
});
test('four updates send one summary and uncertain delivery is recorded once',async()=>{
 const {cipher,TENANT}=require('../lib/integrations/managed-keys.js'),env={MOAON_MANAGED_KEY:Buffer.alloc(32,7).toString('base64')};const bot={revision:1,settings:{chatId:'123'},envelope:cipher(env).seal({tenantId:TENANT,provider:'TELEGRAM_WORK',revision:1},{token:'test-token'})};
 for(const uncertain of [false,true]){const sent=[],results=[];let claimed=false;const db={rpc:async(_,p)=>{const a=p.p_input;if(a.action==='DELIVERY_BATCH'&&!claimed){claimed=true;return {data:{batchId:'test-batch',bot,groups:[{platform:'NAVER',kind:'ORDER',event_kind:'DETECTED',count:3},{platform:'COUPANG',kind:'CS',event_kind:'DETECTED',count:1}]}};}if(a.action==='RESULT_BATCH')results.push(a);return {data:{}};}};
 const args={input:{action:'CASE_TICK'},worker:true,db,env,send:async(_,method,body)=>{sent.push(body);if(uncertain)throw Error('timeout');}};await require('../lib/assistant/cases.js').command(args);await require('../lib/assistant/cases.js').command(args);assert.equal(sent.length,1);assert.match(sent[0].text,/확인할 일 업데이트 4건/);assert.doesNotMatch(sent[0].text,/사건/);assert.equal(sent[0].reply_markup.inline_keyboard[0][0].callback_data,'moa:m:cases');assert.equal(results[0].status,uncertain?'UNKNOWN':'SENT');
 }
});
