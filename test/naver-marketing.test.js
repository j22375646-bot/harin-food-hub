'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {buildNaverMarketing,shift}=require('../lib/analytics/naver-marketing.js');
const {projectMarketing}=require('../desktop/marketing-contract.cjs');
const now=new Date('2026-09-12T03:00:00Z');
const row=(date,id='a',raw={impCnt:100,clkCnt:10,salesAmt:1000,ccnt:2,convAmt:4000})=>({date,entity_id:id,entity_type:'CAMPAIGN',raw_data:raw,updated_at:now.toISOString()});
const fixture=()=>buildNaverMarketing({now,statsReady:true,stats:Array.from({length:60},(_,i)=>row(shift('2026-09-11',-i))),campaigns:[{ncc_campaign_id:'a',name:'차 캠페인',campaign_type:'SHOPPING'}]});
test('completed KST windows and weighted ratios use full totals, not averages',()=>{
 const m=fixture(),w=m.windows[0];assert.equal(w.start,'2026-08-31');assert.equal(w.end,'2026-09-06');assert.equal(w.metrics.cost,7000);assert.equal(w.metrics.roas,400);assert.equal(w.metrics.cpa,500);assert.equal(w.metrics.ctr,10);assert.equal(w.status,'OBSERVED');assert.equal(m.windows[2].previousStart,'2026-07-14');
 const weighted=buildNaverMarketing({now,statsReady:true,stats:[row('2026-09-11'),row('2026-09-11','b',{impCnt:1000,clkCnt:1,salesAmt:9000,ccnt:1,convAmt:1000})]}).windows[1];assert.equal(weighted.metrics.roas,50);assert.equal(weighted.metrics.cpa,10000/3);
});
test('missing raw values, boolean, and missing days stay unknown; actual zero stays zero',()=>{
 for(const bad of [undefined,null,true,'',-1,'bad']){const raw={impCnt:0,clkCnt:0,salesAmt:bad,ccnt:0,convAmt:0};const w=buildNaverMarketing({now,statsReady:true,stats:[{...row('2026-09-11','a',raw),cost:999}]}).windows[1];assert.equal(w.metrics.cost,null);assert.equal(w.metrics.revenue,0);assert.equal(w.metrics.cpa,null);assert.equal(w.series[0].cost,null);assert.equal(w.status,'PARTIAL');}
 assert.equal(buildNaverMarketing({now}).windows[0].status,'UNAVAILABLE');assert.equal(buildNaverMarketing({now,statsReady:true}).windows[0].status,'NO_DATA');
});
test('duplicates and other platforms cannot inflate campaign totals',()=>{const r=row('2026-09-11');const w=buildNaverMarketing({now,statsReady:true,stats:[r,r,{...r,entity_type:'KEYWORD'}]}).windows[1];assert.equal(w.metrics.cost,1000);assert.equal(w.campaignCount,1);});
test('keyword snapshots retain their own period and are not merged into campaign totals',()=>{const m=buildNaverMarketing({now,statsReady:true,keywordsReady:true,stats:[row('2026-09-11')],keywords:[{period_start:'2026-08-01',period_end:'2026-08-31',keyword:'차',cost:999999}]});assert.equal(m.windows[1].metrics.cost,1000);assert.equal(m.keywords.start,'2026-08-01');assert.equal(m.keywords.rows[0].clicks,null);});
test('desktop contract strips unknown data and rejects nonfinite or forged metrics',()=>{
 const m=fixture();m.privateSecret='hidden';m.windows[0].campaigns[0].raw_data={secret:'hidden'};const output=projectMarketing(m);assert.doesNotMatch(JSON.stringify(output),/hidden|privateSecret|raw_data/);assert.equal(projectMarketing(null),null);
 for(const bad of [true,NaN,Infinity,-1,'10']){const changed=structuredClone(m);changed.windows[0].metrics.cost=bad;assert.throws(()=>projectMarketing(changed));}
});
test('loader follows stable inclusive pages beyond Supabase first 1000 rows',async()=>{
 const {loadNaverMarketing}=require('../lib/dashboard/naver-marketing-loader.js');const ranges=[];
 const db={from(table){const q={};for(const method of ['select','eq','gte','lte','order','limit'])q[method]=()=>q;q.range=(a,b)=>{ranges.push([a,b]);q.page=a;return q;};q.then=(ok,fail)=>Promise.resolve({data:table==='naver_stats_daily'?Array.from({length:q.page===0?1000:1},(_,i)=>row('2026-09-11',String((q.page||0)+i))):[],error:null}).then(ok,fail);return q;}};
 const m=await loadNaverMarketing({db,now,scope:{ready:true,campaigns:Array.from({length:1001},(_,i)=>({ncc_campaign_id:String(i)})),groups:[],keywords:[]}});assert.deepEqual(ranges,[[0,999],[1000,1999]]);assert.equal(m.windows[1].metrics.cost,1001000);assert.equal(m.windows[1].campaigns.length,50);assert.equal(m.windows[1].campaignCount,1001);
});
test('a failed later page discards partial sums instead of presenting an understated total',async()=>{
 const {loadNaverMarketing}=require('../lib/dashboard/naver-marketing-loader.js');const db={from(table){const q={};for(const method of ['select','eq','gte','lte','order','limit'])q[method]=()=>q;q.range=a=>{q.page=a;return q;};q.then=(ok,fail)=>Promise.resolve({data:table==='naver_stats_daily'?Array.from({length:1000},()=>row('2026-09-11')):[],error:q.page?{message:'private'}:null}).then(ok,fail);return q;}};const m=await loadNaverMarketing({db,now,scope:{ready:true,campaigns:Array.from({length:1001},(_,i)=>({ncc_campaign_id:String(i)})),groups:[],keywords:[]}});assert.equal(m.windows[1].metrics.cost,null);assert.equal(m.windows[1].status,'UNAVAILABLE');
});
test('daily automation has KST dedupe, fresh collection and report reuse without external notifications',async()=>{
 const {runNaverMarketing}=require('../lib/automation/naver-marketing-job.js');let job,options,days;
 const db={from:()=>({select:()=>({order:()=>({limit:async()=>({data:[{ncc_campaign_id:'a'}]})})})})};
 const run=await runNaverMarketing({db,now,runner:async config=>{job=config;return config.work();},syncStats:async(_,ids,n)=>{assert.deepEqual(ids,[{nccCampaignId:'a'}]);days=n;return 61;},load:async()=>fixture(),generateReport:async o=>{options=o;return {created:false,report:{id:'r'}};}});
 assert.equal(job.idempotencyKey,'NAVER_MARKETING_DAILY:2026-09-12');assert.equal(days,61);assert.equal(options.deduplicate,true);assert.equal(options.notify,false);assert.equal(run.status,'SUCCESS');assert.equal(run.created,false);
 const partial=await runNaverMarketing({db,now,runner:c=>c.work(),syncStats:async()=>61,load:async()=>buildNaverMarketing({now}),generateReport:()=>{throw Error('Must not generate on missing evidence');}});assert.equal(partial.status,'PARTIAL');
 await assert.rejects(runNaverMarketing({db,now,runner:c=>c.work(),syncStats:async()=>0}),/No fresh/);
});
