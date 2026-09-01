'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const {buildPhase28InsightsModel,normalizeInsightReportDetail,PHASE28_AVAILABLE_ADAPTERS}=require('../lib/ui/phase28-adapters/index.js');

function weekly(id,platform,end,revenue,extra={}){
  const key=platform.toLowerCase();
  return {
    id,platform,report_type:'WEEKLY',period_start:'2026-08-24',period_end:end,
    title:`${platform} 주간 보고서`,status:'FINAL',created_at:`${end}T22:30:00.000Z`,
    summary_json:{
      [key]:{revenue,orders:extra.orders??null,ad_spend:extra.adSpend??null,contribution_profit:extra.profit??null},
      insights:extra.insights||[{level:'good',title:`${platform} 실제 원인`,body:'같은 채널 저장 근거'}],
      recommendations:extra.actions||[{title:`${platform} 다음 행동`,reason:'자동 변경 없이 검토'}],
      data_coverage:{orders:'READY'},comparison_guard:{safe:true},financial_trust:{status:'READY'}
    }
  };
}

function monthly(id,platform,end,revenue){
  const key=platform.toLowerCase();
  return {
    id,platform,report_type:'MONTHLY',period_start:'2026-08-01',period_end:end,
    title:`${platform} 월간 보고서`,status:'FINAL',created_at:`${end}T23:00:00.000Z`,
    summary_json:{[key]:{revenue},data_coverage:{orders:'READY'},comparison_guard:{safe:true}}
  };
}

test('insights adapter exposes only Naver weekly evidence during the first automation stage',()=>{
  const model=buildPhase28InsightsModel({
    generatedAt:'2026-08-31T00:10:00.000Z',loadedWorkspace:'overview',
    dataHealth:{channels:[
      {platform:'NAVER',status:'READY',lastSuccessAt:'2026-08-31T00:00:00.000Z'},
      {platform:'COUPANG',status:'STALE',lastSuccessAt:'2026-08-30T12:00:00.000Z'},
      {platform:'CAFE24',status:'READY',lastSuccessAt:'2026-08-31T00:02:00.000Z'}
    ]},
    reports:[
      weekly('nv-now','NAVER','2026-08-30',1078000,{orders:84,profit:596000}),
      weekly('cp-now','COUPANG','2026-08-30',976000,{orders:116}),
      weekly('cf-now','CAFE24','2026-08-30',1031000,{orders:42,profit:214000}),
      weekly('nv-prev','NAVER','2026-08-23',1000000,{orders:71,profit:500000}),
      weekly('cp-prev','COUPANG','2026-08-23',1000000,{orders:122}),
      monthly('nv-month','NAVER','2026-08-31',4010000),
      monthly('cp-month','COUPANG','2026-08-31',3880000),
      weekly('all-now','ALL','2026-08-30',99999999,{profit:99999999}),
      {id:'product-report',platform:'ALL',report_type:'PRODUCT_ANALYSIS_p-1',summary_json:{kind:'PRODUCT_ANALYSIS'}}
    ]
  });

  assert.equal(model.writePolicy,'READ_ONLY');
  assert.deepEqual(model.channels.map(item=>item.platform),['NAVER']);
  assert.equal(model.channels[0].currentReportId,'nv-now');
  assert.equal(model.channels[0].revenue,1078000);
  assert.equal(model.channels[0].changeRate,7.8);
  assert.deepEqual(Object.keys(model.savedReports),['NAVER']);
  assert.equal(model.savedReports.NAVER.length,2);
  assert.ok(model.savedReports.NAVER.every(item=>item.reportType==='WEEKLY'));
  assert.equal(model.channels[0].reportCount,2,'이번 주 비교 카드에는 월간 보고서를 섞으면 안 됩니다.');
  assert.match(model.schedule.label,/주간/);
  assert.doesNotMatch(model.schedule.label,/월간/);
  assert.deepEqual(model.automation.items.map(item=>item.id),['weekly']);
  assert.equal('summary_json' in model.savedReports.NAVER[0],false);
  assert.equal('report' in model.savedReports.NAVER[0],false);
  assert.equal(JSON.stringify(model).includes('99999999'),false,'ALL 보고서를 채널 카드에 섞으면 안 됩니다.');
  assert.equal(JSON.stringify(model).includes('976000'),false,'쿠팡 보고서를 네이버 파일럿 화면에 싣지 않습니다.');
});

test('saved Naver weekly detail exposes the owner brief and provenance, not the raw report',()=>{
  const report=weekly('nv-now','NAVER','2026-08-30',1078000,{profit:596000});
  report.summary_json.naver={
    connected:true,revenue:1078000,ad_spend:300000,roas:359.3,clicks:1200,purchase_count:44,contribution_profit:596000,
    confidence:{level:'HIGH',label:'높음'},top_campaigns:[]
  };
  report.summary_json.keywords={growth:[],waste:[],waste_cost:0};
  report.summary_json.operating_rule={source:'SAVED',thresholds:{target_roas_percent:300,change_warning_percent:10}};
  report.summary_json.data_coverage={naver_ads:{status:'OK',actual_days:7,expected_days:7}};
  report.summary_json.comparison_guard={safe:true};
  const detail=normalizeInsightReportDetail(report);
  assert.equal(detail.id,'nv-now');
  assert.equal(detail.platform,'NAVER');
  assert.equal(detail.flow.cause,'NAVER 실제 원인');
  assert.equal(detail.flow.profit.value,596000);
  assert.equal(detail.flow.action,'NAVER 다음 행동');
  assert.equal(detail.ownerBrief.decision.label,'효율 유지·확대 검토');
  assert.equal(detail.ownerBrief.scorecard.find(item=>item.id==='paidRoas').value,359.3);
  assert.equal(detail.ownerBrief.actions.guardrail.includes('자동 변경하지'),true);
  assert.equal(detail.provenance.channelSeparated,true);
  assert.equal('summary_json' in detail,false);
  assert.equal('raw' in detail,false);
});

test('insights adapter preserves the selected workspace and channel after refresh',()=>{
  const model=buildPhase28InsightsModel({reports:[]},{workspace:'saved',platform:'coupang'});
  assert.equal(model.initialWorkspace,'saved');
  assert.equal(model.initialChannel,'naver');
});

test('insights joins the implemented V106 adapter set',()=>{
  assert.deepEqual(PHASE28_AVAILABLE_ADAPTERS,['main','calendar','orders','cs','inventory','products','settlement','keywords','product-analysis','insights','development','system','notifications','diagnoses','changes','validation','experiments','knowledge']);
});
