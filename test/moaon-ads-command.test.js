const test=require('node:test'),assert=require('node:assert/strict');
const {command}=require('../lib/assistant/ads.js');
test('change job collects two seven-day windows and saves comparison before finishing',async()=>{
 const calls=[],periods=[];const db={rpc:async(name,v)=>{calls.push([name,v]);if(name==='create_report_version')return {data:{id:'report'}};return {data:v.p_input.action==='CLAIM'?{id:'job',dedupe:'change:today',start_date:'2026-09-08',end_date:'2026-09-14',fresh:true,changeSettings:{minClicks:30,minCost:10000,changePercent:30}}:{}};}};
 const collect=async({start,end})=>{periods.push([start,end]);return {status:'OBSERVED',period:{start,end},campaigns:[{id:'a'}],metrics:{clicks:100,cost:20000,cpc:200,roas:200}};};
 assert.equal((await command({input:{action:'ADS_TICK'},worker:true,db,digest:'worker',collect})).processed,true);
 assert.deepEqual(periods,[['2026-09-08','2026-09-14'],['2026-09-01','2026-09-07']]);assert.equal(calls.find(x=>x[0]==='create_report_version')[1].p_summary_json.change.status,'STABLE');
 assert.equal(calls.find(x=>x[1].p_input?.action==='FINISH')[1].p_input.status,'SUCCEEDED');
});
test('external watchdog test authenticates owner before invoking monitoring RPC',async()=>{
 let calls=0;await assert.rejects(command({input:{action:'ADS_WATCHDOG'},worker:false,db:{rpc:async()=>{calls++;return {error:{message:'ASSISTANT_AUTH_REQUIRED'}};}}}),/AUTH_REQUIRED/);assert.equal(calls,1);
});

test('revised report persists comparison from the authorized parent snapshot',async()=>{
 const report={status:'OBSERVED',period:{start:'2026-09-01',end:'2026-09-01'},campaigns:[{id:'a'}],observedRows:1,expectedRows:1,metrics:{cost:100,clicks:10,conversions:1,revenue:100,roas:100}};
 let stored;const db={rpc:async(name,v)=>{if(name==='create_report_version'){stored=v.p_summary_json;return {data:{id:'report'}};}return {data:v.p_input.action==='CLAIM'?{id:'child',parent_id:'parent',start_date:'2026-09-01',end_date:'2026-09-01',fresh:true,campaign_ids:['a'],parentSummary:report}:{}};}};
 await command({input:{action:'ADS_TICK'},worker:true,db,collect:async()=>({...report,metrics:{...report.metrics,cost:120}})});
 assert.equal(stored.parentJobId,'parent');assert.equal(stored.revisionComparison.status,'CHANGED');assert.equal(stored.revisionComparison.rows[0].delta,20);
});
