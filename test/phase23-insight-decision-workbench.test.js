'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const workbench=require('../lib/analytics/insight-decision-workbench.js');

const report=(platform,id,summary,periodEnd)=>({id,platform,title:`${platform} ${id}`,period_end:periodEnd,summary_json:summary});

test('23-5 keeps marketplace reports separate and calculates comparable changes',()=>{
  const reports=[
    report('NAVER','N2',{naver:{revenue:120000,roas:360,ad_spend:30000},executive:{today_actions:[{priority:'HIGH',area:'KEYWORD',title:'무전환 키워드 점검',reason:'광고비가 사용됐어요.'}]}},'2026-08-18'),
    report('NAVER','N1',{naver:{revenue:100000,roas:300,ad_spend:25000}},'2026-08-11'),
    report('COUPANG','C9',{coupang:{gross_sales:999999}},'2026-08-19')
  ];
  const result=workbench.buildInsightDecisionWorkbench({reports,platform:'naver',dataHealth:{channels:[{platform:'NAVER',status:'READY'}]},generatedAt:'2026-08-19T00:00:00Z'});
  assert.equal(result.current_report.id,'N2');
  assert.equal(result.previous_report.id,'N1');
  assert.equal(result.metrics[0].change_rate,20);
  assert.equal(result.actions[0].href,'/keywords/diagnosis?platform=naver');
  assert.equal(result.trust.status,'READY');
});

test('23-5 never invents an all-channel report by mixing channel reports',()=>{
  const result=workbench.buildInsightDecisionWorkbench({
    reports:[report('NAVER','N1',{naver:{revenue:100}},'2026-08-18'),report('COUPANG','C1',{coupang:{gross_sales:200}},'2026-08-18')],
    platform:'all',dataHealth:{channels:[{platform:'NAVER',status:'READY'},{platform:'COUPANG',status:'STALE'}]},generatedAt:'2026-08-19T00:00:00Z'
  });
  assert.equal(result.current_report,null);
  assert.equal(result.headline.status,'NO_DATA');
  assert.equal(result.trust.status,'CHECK_REQUIRED');
  assert.match(result.caveats.join(' '),/임의로 합치지 않았습니다/);
});

test('23-5 shows no more than three prioritized actions and preserves caveats',()=>{
  const actions=Array.from({length:5},(_,index)=>({priority:index===0?'HIGH':'MEDIUM',area:'PROFIT',title:`행동 ${index+1}`,reason:'근거'}));
  const result=workbench.buildInsightDecisionWorkbench({
    reports:[report('ALL','A1',{profitability:{net_sales:500000,paid_roas:420,contribution_profit:80000},executive:{today_actions:actions},comparison_guard:{safe:false,message:'행사 기간입니다.'}},'2026-08-18')],
    platform:'all',dataHealth:{channels:[{platform:'NAVER',status:'READY'},{platform:'CAFE24',status:'READY'},{platform:'COUPANG',status:'READY'}]},generatedAt:'2026-08-19T00:00:00Z'
  });
  assert.equal(result.actions.length,3);
  assert.equal(result.actions[0].href,'/insights/profitability');
  assert.match(result.caveats.join(' '),/행사 기간/);
});

test('23-5 renders the owner brief before detailed insight tools',()=>{
  const page=fs.readFileSync('app/dashboard-route.js','utf8');
  const client=fs.readFileSync('app/_analysis/harin-analysis-workbench.js','utf8');
  const css=fs.readFileSync('app/_analysis/harin-analysis-v8.css','utf8');
  assert.match(page,/buildInsightDecisionWorkbench/);
  assert.match(client,/function InsightDecisionBrief/);
  assert.match(client,/InsightDecisionBrief decision=\{data\.insightDecision\}/);
  assert.match(client,/scopeReportPlatform/);
  assert.match(css,/\.insightDecisionBrief/);
  assert.match(css,/@media\(max-width:700px\).*\.insightDecisionBrief/s);
});
