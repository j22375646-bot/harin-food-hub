'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const {randomUUID,createHash}=require('node:crypto');
const {PGlite}=require('@electric-sql/pglite');
const sql=readFileSync(require('node:path').join(__dirname,'../lib/tenancy/sql/ai-insight-runs.sql'),'utf8');
const tenant='11111111-1111-4111-8111-111111111111';
const other='22222222-2222-4222-8222-222222222222';
let db;
async function reserve({t=tenant,id=randomUUID(),fingerprint=createHash('sha256').update(id).digest('hex'),cost=600,account='pilot'}={}) {
 const result=await db.query('select public.moaon_ai_reserve($1,$2,$3,$4,$5,$6,$7,$8) as result',[t,id,'CLOVA',account,'verified-actor',fingerprint,cost,'price-v1']);
 return {...result.rows[0].result,id,fingerprint};
}
async function settle(id,status='UNKNOWN',cost=null,t=tenant) {
 return (await db.query('select public.moaon_ai_settle($1,$2,$3,$4,null) as result',[t,id,status,cost])).rows[0].result;
}
test.before(async()=>{
 db=new PGlite();
 await db.exec('create role anon; create role authenticated; create role service_role bypassrls; create schema moaon_control; create table moaon_control.tenants(id uuid primary key)');
 await db.query('insert into moaon_control.tenants values($1),($2)',[tenant,other]);
 await db.exec(sql);
});
test.after(async()=>{await db.close();});
test.beforeEach(async()=>{await db.exec('reset role; truncate public.ai_insight_runs,public.ai_usage_reservations,public.ai_insight_tenant_budgets,public.ai_insight_budget_accounts');});
test('repeatable SQL and explicit service-only permissions',async()=>{
 await db.exec(sql);
 for(const role of ['anon','authenticated']) {
  await db.exec(`set role ${role}`);
  await assert.rejects(db.query('select * from public.ai_insight_runs'),/permission denied/);
  await assert.rejects(reserve(),/permission denied/);
  await db.exec('reset role');
 }
 await db.exec('set role service_role'); assert.equal((await reserve()).allowed,true); await db.exec('reset role');
});
test('concurrent requests serialize shared account cap and per-tenant active claim',async()=>{
 await db.query("insert into public.ai_insight_budget_accounts values('pilot',29000)");
 const results=await Promise.all([reserve(),reserve({t:other})]);
 assert.equal(results.filter(r=>r.allowed).length,1);
 const winner=results.find(r=>r.allowed);
 await settle(winner.id,'UNKNOWN',null,results[0].allowed?tenant:other);
 assert.equal(Number((await db.query('select charged_krw from public.ai_insight_budget_accounts')).rows[0].charged_krw),29600);
 const results2=await Promise.all([reserve({cost:1,account:'second'}),reserve({cost:1,account:'third'})]);
 assert.equal(results2.filter(r=>r.allowed).length,1);
});
test('request replay, fingerprint claim, unknown cost and settlement replay never refund twice',async()=>{
 const first=await reserve();
 assert.equal((await reserve({id:first.id})).reason,'PENDING');
 assert.equal((await reserve({fingerprint:first.fingerprint})).reason,'PENDING');
 await settle(first.id,'UNKNOWN',0);
 assert.equal((await reserve({fingerprint:first.fingerprint})).reason,'ALREADY_PROCESSED');
 await settle(first.id,'SUCCEEDED',0);
 assert.equal(Number((await db.query('select charged_krw from public.ai_insight_budget_accounts')).rows[0].charged_krw),600);
 const second=await reserve(); await settle(second.id,'SUCCEEDED',100); await settle(second.id,'SUCCEEDED',0);
 assert.equal(Number((await db.query('select charged_krw from public.ai_insight_budget_accounts')).rows[0].charged_krw),700);
});
test('wrong tenant cannot settle and daily quota resets only on KST date change',async()=>{
 const first=await reserve(); assert.equal((await settle(first.id,'SUCCEEDED',0,other)).settled,false);
 await settle(first.id,'SUCCEEDED',1);
 await db.exec('update public.ai_insight_tenant_budgets set daily_count=50');
 assert.equal((await reserve()).reason,'QUOTA_BLOCKED');
 await db.exec("update public.ai_insight_tenant_budgets set day_kst=day_kst-1");
 assert.equal((await reserve()).allowed,true);
 assert.equal((await db.query('select daily_count from public.ai_insight_tenant_budgets')).rows[0].daily_count,1);
});
test('90/180 day cleanup and result deletion preserve cumulative spend',async()=>{
 const first=await reserve(); await settle(first.id);
 await db.query("insert into public.ai_insight_runs values($1,$2,$2,$3,'{}',clock_timestamp()-interval '91 days')",[tenant,first.id,first.fingerprint]);
 await db.query("update public.ai_usage_reservations set created_at=clock_timestamp()-interval '181 days'");
 await db.query('select public.moaon_ai_cleanup()');
 assert.equal((await db.query('select * from public.ai_insight_runs')).rows.length,0);
 assert.equal((await db.query('select * from public.ai_usage_reservations')).rows.length,0);
 assert.equal(Number((await db.query('select charged_krw from public.ai_insight_budget_accounts')).rows[0].charged_krw),600);
});
test('expired pilot denies reservations before creating any account or claim',async()=>{
 // Only the clock boundary literal changes in this isolated test, not the guard.
 await db.exec(sql.replace("2026-11-30 00:00:00+09","2000-01-01 00:00:00+09"));
 assert.equal((await reserve()).reason,'BUDGET_BLOCKED');
 assert.equal((await db.query('select * from public.ai_insight_budget_accounts')).rows.length,0);
 await db.exec(sql);
});
test('crashed stale reservation keeps charge and fingerprint while freeing unrelated work',async()=>{
 const first=await reserve();
 await db.query("update public.ai_usage_reservations set created_at=clock_timestamp()-interval '121 seconds' where request_id=$1",[first.id]);
 const second=await reserve(); assert.equal(second.allowed,true);
 const old=(await db.query('select status,actual_cost_krw from public.ai_usage_reservations where request_id=$1',[first.id])).rows[0];
 assert.equal(old.status,'UNKNOWN'); assert.equal(old.actual_cost_krw,null);
 assert.equal((await reserve({fingerprint:first.fingerprint})).reason,'ALREADY_PROCESSED');
 assert.equal(Number((await db.query('select charged_krw from public.ai_insight_budget_accounts')).rows[0].charged_krw),1200);
 await settle(first.id,'SUCCEEDED',0);
 assert.equal(Number((await db.query('select charged_krw from public.ai_insight_budget_accounts')).rows[0].charged_krw),1200);
});
test('store scopes result reads and deletion to tenant, leaving usage intact',async()=>{
 const {createInsightStore}=require('../lib/ai/insight-store');
 const bridge={rpc:()=>{},from(table){
  let remove=false; const conditions=[]; const params=[];
  const query={select(){return query;},delete(){remove=true;return query;},eq(key,value){params.push(value);conditions.push(`${key}=$${params.length}`);return query;},
   gte(key,value){params.push(value);conditions.push(`${key}>=$${params.length}`);return query;},
   async maybeSingle(){const {data,error}=await query;return {data:data?.[0]||null,error};},
   async then(resolve,reject){try {const result=await db.query(`${remove?'delete from':'select * from'} public.${table} where ${conditions.join(' and ')}${remove?' returning *':''}`,params);return resolve({data:result.rows,error:null});}catch(error){return reject(error);}}
  };return query;
 }};
 const store=createInsightStore({db:bridge}); const first=await reserve(); await settle(first.id);
 await db.query('insert into public.ai_insight_runs(tenant_id,run_id,request_id,fingerprint,run) values($1,$2,$2,$3,$4)',[tenant,first.id,first.fingerprint,JSON.stringify({runId:first.id,tenantId:tenant})]);
 assert.equal(await store.getRun({tenantId:other,runId:first.id}),null);
 assert.equal((await store.deleteRun({tenantId:other,runId:first.id})).deleted,false);
 assert.equal((await store.getRun({tenantId:tenant,runId:first.id})).runId,first.id);
 assert.equal((await store.deleteRun({tenantId:tenant,runId:first.id})).deleted,true);
 assert.equal((await db.query('select * from public.ai_usage_reservations')).rows.length,1);
});
