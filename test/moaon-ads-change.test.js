const test=require('node:test'),assert=require('node:assert/strict');
const {compare}=require('../lib/assistant/ads-change.js');
const {settings}=require('../desktop/assistant-ads-contract.cjs');
const config={minClicks:30,minCost:10000,changePercent:30};
const report=(start,end,metrics={})=>({status:'OBSERVED',period:{start,end},campaigns:[{id:'a'}],metrics:{clicks:100,cost:20000,cpc:200,roas:200,...metrics}});
const prior=report('2026-09-01','2026-09-07');
test('changes compare matching weekdays and return actionable increases/decreases',()=>{
 const c=compare(report('2026-09-08','2026-09-14',{cost:30000,cpc:300,roas:100}),prior,config);
 assert.equal(c.status,'ALERT');assert.deepEqual(c.signals.map(x=>x.percent),[50,50,-50]);
 assert.equal(compare(report('2026-09-08','2026-09-14'),prior,config).status,'STABLE');
});
test('partial, sparse, different campaigns and mismatched windows hold instead of alarming',()=>{
 const c=report('2026-09-08','2026-09-14');
 for(const r of [{...c,status:'PARTIAL'},{...c,campaigns:[{id:'b'}]},report('2026-09-09','2026-09-14'),report('2026-09-08','2026-09-14',{clicks:0,cost:100})])assert.equal(compare(r,prior,config).status,'HOLD');
 assert.equal(compare(c,{...prior,status:'PARTIAL'},config).status,'HOLD');
});
test('undefined ROAS and zero baseline never yield infinite change alerts',()=>{
 const c=compare(report('2026-09-08','2026-09-14',{roas:null}),{...prior,metrics:{...prior.metrics,roas:0}},config);
 assert.equal(c.signals.length,0);
});
test('settings reject invalid thresholds while retaining old clients',()=>{
 const v={daily:true,weekly:true,time:'09:00',notify:true,failures:true};assert.equal(settings(v),true);
 assert.equal(settings({...v,...config,changes:true,monthly:true,watchdog:true}),true);
 for(const minClicks of [0,-1,1.2,'30',null])assert.equal(settings({...v,minClicks}),false);
 assert.equal(settings({...v,watchdog:'yes'}),false);
});
