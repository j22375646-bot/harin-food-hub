'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const build=(...args)=>require('../lib/tenancy/workspace-settlement-summary.js').buildWorkspaceSettlementSummary(...args);
function data(){return {generatedAt:'2026-09-09T09:00:00.000Z',unifiedSettlement:{period_start:'2026-08-10T09:00:00Z',period_end:'2026-09-09T09:00:00Z',channels:[
 {platform:'CAFE24',gross_sales:0,actual_payout:null,expected_payout:0,status:'ESTIMATED',payout_evidence:{private:'DO_NOT_RETURN'},action_href:'https://private.example'},
 {platform:'NAVER',gross_sales:100,actual_payout:50,payout_complete:false,pending_payout:30,status:'ACTUAL'},
 {platform:'COUPANG',actual_payout:20,status:'ACTUAL'},
 {platform:'COUPANG_RG',actual_payout:5,status:'COST_REQUIRED',ledger_status:'FAMILY_REQUIRED'}
 ],waterfall:{actual_payout:75,actual_payout_complete:false,expected_payout:null,variance:-5,comparable_channels:1},schedules:[{platform:'NAVER',date:'2026-09-10',amount:30,status:'정산예정',type:'일별 정산',raw_data:{private:'DO_NOT_RETURN'}}]}};}
test('settlement preserves partial actuals, zero and unknowns without mixing delivery families',()=>{
 const result=build(data());
 assert.deepEqual(result.summary.actual,{value:75,status:'PARTIAL'});
 assert.deepEqual(result.summary.expected,{value:null,status:'BLOCKED'});
 assert.deepEqual(result.channels.map(row=>row.platform),['CAFE24','NAVER','COUPANG','COUPANG_RG']);
 assert.equal(result.channels[0].gross,0);assert.equal(result.channels[0].actual,null);
 assert.equal(result.channels[1].stateCode,'PARTIAL');assert.equal(result.channels[1].pending,30);
 assert.equal(result.channels[3].stateCode,'FAMILY_REQUIRED');
 assert.equal(result.summary.comparableChannels,1);assert.equal(result.summary.variance,-5);
});
test('settlement exposes only approved fields and never raw evidence or navigation URLs',()=>{
 const result=build(data()),serialized=JSON.stringify(result);
 assert.doesNotMatch(serialized,/DO_NOT_RETURN|private.example|actionHref|payout_evidence|raw_data/);
 assert.deepEqual(result.schedules,[{platform:'NAVER',date:'2026-09-10',amount:30,status:'정산예정',type:'일별 정산'}]);
 assert.equal(result.writePolicy,'READ_ONLY');
});
test('requested unavailable period is rejected rather than replaced with 30 days',()=>{
 assert.throws(()=>build(data(),7),/period/i);
 assert.throws(()=>build(data(),'30'),/period/i);
 assert.throws(()=>build(data(),365),/period/i);
});
test('missing channels remain explicit unknowns, not zero or all-clear',()=>{
 const input=data();input.unifiedSettlement.channels=[];input.unifiedSettlement.waterfall={};
 const result=build(input);
 assert.equal(result.channels.length,4);
 assert.ok(result.channels.every(row=>row.actual===null&&row.stateCode==='NO_DATA'));
 assert.deepEqual(result.summary.actual,{value:null,status:'BLOCKED'});
});
test('confirmed zero is retained, duplicate channels are rejected, missing timestamps stay unknown',()=>{
 const input=data();input.unifiedSettlement.waterfall={actual_payout:0,actual_payout_complete:true};input.generatedAt=null;
 assert.deepEqual(build(input).summary.actual,{value:0,status:'READY'});
 assert.equal(build(input).generatedAt,null);
 input.unifiedSettlement.channels.push({...input.unifiedSettlement.channels[0]});
 assert.throws(()=>build(input),/channel/i);
});
test('the real web calculator feeds the app projection without recreating settlement formulas',()=>{
 const {buildUnifiedSettlementCenter}=require('../lib/settlement/unified-center.js');
 const center=buildUnifiedSettlementCenter({now:new Date('2026-09-09T09:00:00Z'),periodDays:30});
 const result=build({generatedAt:'2026-09-09T09:00:00Z',unifiedSettlement:center});
 assert.equal(result.period.days,30);
 assert.equal(result.period.end,'2026-09-09T09:00:00.000Z');
 assert.deepEqual(result.summary.actual,{value:null,status:'BLOCKED'});
 assert.equal(result.channels.find(row=>row.platform==='NAVER').actual,null);
});
