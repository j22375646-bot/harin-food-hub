'use strict';
const test=require('node:test'), assert=require('node:assert/strict');
const {readFileSync}=require('node:fs'),{randomUUID,createHash}=require('node:crypto');
const {PGlite}=require('@electric-sql/pglite');
const {createPublicMarketStore}=require('../lib/ai/public-market-store');
const sql=readFileSync(require('node:path').join(__dirname,'../lib/tenancy/sql/public-market-ai.sql'),'utf8');
const tenant='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222';
let db;
async function reserve({t=tenant,id=randomUUID(),account='project-one',fingerprint=createHash('sha256').update(id).digest('hex')}={}) {
 const {rows}=await db.query('select public.moaon_public_market_ai_reserve($1,$2,$3,$4,$5) result',[t,id,account,fingerprint,'verified-actor']);
 return {...rows[0].result,id,fingerprint};
}
async function settle(id,t=tenant,status='UNKNOWN') {
 return (await db.query('select public.moaon_public_market_ai_settle($1,$2,$3,null) result',[t,id,status])).rows[0].result;
}
test.before(async()=>{db=new PGlite();await db.exec('create role anon;create role authenticated;create role service_role bypassrls;create role moaon_control_role;create schema moaon_control;create table moaon_control.tenants(id uuid primary key)');await db.query('insert into moaon_control.tenants values($1),($2)',[tenant,other]);await db.exec(sql);});
test.after(async()=>db.close());
test.beforeEach(async()=>db.exec('reset role;truncate public.public_market_ai_runs,public.public_market_ai_requests,public.public_market_ai_claims'));
test('idempotent schema is service-role only; anonymous, authenticated and control denied',async()=>{
 await db.exec(sql);
 for(const role of ['anon','authenticated','moaon_control_role']) {
  await db.exec(`set role ${role}`);
  for(const table of ['public_market_ai_runs','public_market_ai_requests','public_market_ai_claims']) await assert.rejects(db.query(`select * from public.${table}`),/permission denied/);
  await assert.rejects(reserve(),/permission denied/);
  await assert.rejects(db.query('select public.moaon_public_market_ai_cleanup()'),/permission denied/);
  await assert.rejects(settle(randomUUID()),/permission denied/);
  await db.exec('reset role');
 }
 await db.exec('set role service_role');assert.equal((await reserve()).allowed,true);await db.exec('reset role');
});
test('one active tenant reservation spans projects and replay cannot call twice',async()=>{
 const results=await Promise.all([reserve(),reserve({account:'project-two'})]);
 assert.equal(results.filter(x=>x.allowed).length,1);
 const first=results.find(x=>x.allowed);
 assert.equal((await reserve({id:first.id})).reason,'PENDING');
 assert.equal((await reserve({fingerprint:first.fingerprint})).reason,'PENDING');
 assert.equal((await settle(first.id,other)).settled,false);
 await settle(first.id);assert.equal((await settle(first.id,tenant,'SUCCEEDED')).replayed,true);
 assert.equal((await reserve({fingerprint:first.fingerprint})).reason,'ALREADY_PROCESSED');
 assert.equal((await reserve({t:other,fingerprint:first.fingerprint})).allowed,true);
});
test('hard 20 daily tenant calls survive project rotation, failures and UNKNOWN',async()=>{
 for(let i=0;i<20;i++){const r=await reserve({account:`project-${i}`});assert.equal(r.allowed,true);await settle(r.id,tenant,i%2?'FAILED':'UNKNOWN');}
 assert.equal((await reserve({account:'new-project'})).reason,'QUOTA_BLOCKED');
 await db.exec('update public.public_market_ai_requests set day_kst=day_kst-1');
 assert.equal((await reserve()).allowed,true);
 assert.equal((await db.query("select day_kst=(clock_timestamp() at time zone 'Asia/Seoul')::date correct from public.public_market_ai_requests order by created_at desc limit 1")).rows[0].correct,true);
});
test('shared project quota atomically denies the twenty-first call across tenants',async()=>{
 for(let i=0;i<19;i++){const r=await reserve();await settle(r.id);}
 const results=await Promise.all([reserve(),reserve({t:other})]);
 assert.equal(results.filter(x=>x.allowed).length,1);
 assert.equal(results.find(x=>!x.allowed).reason,'QUOTA_BLOCKED');
 assert.equal((await db.query('select count(*)::int n from public.public_market_ai_requests')).rows[0].n,20);
});
test('cleanup reconciles stale reservations without refund, drops 7-day cache/90-day ledger, retains claims',async()=>{
 const r=await reserve();
 await db.exec("update public.public_market_ai_requests set created_at=clock_timestamp()-interval '3 minutes'");
 await db.query('select public.moaon_public_market_ai_cleanup()');
 assert.equal((await db.query('select status from public.public_market_ai_requests')).rows[0].status,'UNKNOWN');
 assert.equal((await reserve({id:r.id})).reason,'ALREADY_PROCESSED');
 await db.query("insert into public.public_market_ai_runs values($1,$2,$2,$3,'{}',clock_timestamp()-interval '8 days')",[tenant,r.id,r.fingerprint]);
 await db.exec("update public.public_market_ai_requests set created_at=clock_timestamp()-interval '91 days'");
 await db.query('select public.moaon_public_market_ai_cleanup()');
 assert.equal((await db.query('select * from public.public_market_ai_runs')).rows.length,0);
 assert.equal((await db.query('select * from public.public_market_ai_requests')).rows.length,0);
 assert.equal((await reserve({id:r.id})).reason,'ALREADY_PROCESSED');
 assert.equal((await reserve({fingerprint:r.fingerprint})).reason,'ALREADY_PROCESSED');
});
test('store scopes cache reads and strips raw input, secrets and unknown usage before persistence',async()=>{
 const calls=[];let inserted;
 const fingerprint='a'.repeat(64),id=randomUUID();
 const source={tenantId:tenant,runId:id,requestId:id,fingerprint,output:{summary:'validated public summary'},snapshot:{kind:'PUBLIC_SEARCH_TREND'},query:'private',rawPrompt:'private',manualProducts:['private'],internalData:{secret:1},usage:{inputTokens:10,apiKey:'private'}};
 const fake={rpc:async(name,args)=>{calls.push([name,args]);return {data:{allowed:true}};},from(table){const q={select(){return q;},eq(...args){calls.push(args);return q;},gte(...args){calls.push(args);return q;},async maybeSingle(){return {data:table==='public_market_ai_requests'?{fingerprint,status:'RESERVED'}:{run:source}};},async insert(row){inserted=row;return {data:null};}};return q;}};
 const store=createPublicMarketStore({db:fake});
 const cached=await store.findReusable({tenantId:other,fingerprint});assert.ok(calls.some(x=>x[0]==='tenant_id'&&x[1]===other));assert.ok(calls.some(x=>x[0]==='created_at'));
 assert.equal(cached,null);
 await store.saveRun(source);assert.equal(inserted.run.rawPrompt,undefined);assert.equal(inserted.run.manualProducts,undefined);assert.equal(inserted.run.internalData,undefined);assert.deepEqual(inserted.run.usage,{inputTokens:10});
 await store.settle({tenantId:tenant,requestId:id,status:'UNKNOWN',usage:{totalTokens:1,raw:'secret'}});
 assert.deepEqual(calls.at(-1)[1].p_usage,{totalTokens:1});
});
test('separate store instances reuse persisted database cache with tenant and expiry boundaries',async()=>{
 const r=await reserve();const run={tenantId:tenant,runId:r.id,requestId:r.id,fingerprint:r.fingerprint,output:{summary:'public validated output'}};
 await db.query('insert into public.public_market_ai_runs(tenant_id,run_id,request_id,fingerprint,run) values($1,$2,$2,$3,$4)',[tenant,r.id,r.fingerprint,JSON.stringify(run)]);
 const adapter={rpc(){},from(){let t,fp,cutoff;return {select(){return this;},eq(k,v){if(k==='tenant_id')t=v;else fp=v;return this;},gte(k,v){cutoff=v;return this;},async maybeSingle(){return {data:(await db.query('select run from public.public_market_ai_runs where tenant_id=$1 and fingerprint=$2 and created_at >= $3',[t,fp,cutoff])).rows[0]||null};}};}};
 assert.equal((await createPublicMarketStore({db:adapter}).findReusable({tenantId:tenant,fingerprint:r.fingerprint})).output.summary,'public validated output');
 assert.equal(await createPublicMarketStore({db:adapter}).findReusable({tenantId:other,fingerprint:r.fingerprint}),null);
 await db.exec("update public.public_market_ai_runs set created_at=clock_timestamp()-interval '8 days'");
 assert.equal(await createPublicMarketStore({db:adapter}).findReusable({tenantId:tenant,fingerprint:r.fingerprint}),null);
});
