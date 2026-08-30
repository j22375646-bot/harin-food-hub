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

test('insights adapter keeps Naver, Coupang, and Cafe24 weekly evidence separate',()=>{
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
      weekly('all-now','ALL','2026-08-30',99999999,{profit:99999999}),
      {id:'product-report',platform:'ALL',report_type:'PRODUCT_ANALYSIS_p-1',summary_json:{kind:'PRODUCT_ANALYSIS'}}
    ]
  });

  assert.equal(model.writePolicy,'READ_ONLY');
  assert.deepEqual(model.channels.map(item=>item.platform),['NAVER','COUPANG','CAFE24']);
  assert.equal(model.channels[0].currentReportId,'nv-now');
  assert.equal(model.channels[0].revenue,1078000);
  assert.equal(model.channels[0].changeRate,7.8);
  assert.equal(model.channels[1].currentReportId,'cp-now');
  assert.equal(model.channels[1].changeRate,-2.4);
  assert.equal(model.channels[1].profit,null,'전 채널 공헌이익을 쿠팡 값으로 재사용하면 안 됩니다.');
  assert.equal(model.channels[1].profitState,'CHECK_REQUIRED');
  assert.equal(model.channels[1].trust.status,'CHECK_REQUIRED');
  assert.equal(model.channels[2].changeRate,null,'같은 Cafe24 이전 보고서가 없으면 증감을 만들면 안 됩니다.');
  assert.equal(model.savedReports.NAVER.length,2);
  assert.equal(model.savedReports.COUPANG.length,2);
  assert.equal(model.savedReports.CAFE24.length,1);
  assert.equal('summary_json' in model.savedReports.NAVER[0],false);
  assert.equal('report' in model.savedReports.NAVER[0],false);
  assert.equal(JSON.stringify(model).includes('99999999'),false,'ALL 보고서를 채널 카드에 섞으면 안 됩니다.');
});

test('saved insight detail exposes only the decision flow and provenance, not the raw report',()=>{
  const detail=normalizeInsightReportDetail(weekly('nv-now','NAVER','2026-08-30',1078000,{profit:596000}));
  assert.equal(detail.id,'nv-now');
  assert.equal(detail.platform,'NAVER');
  assert.equal(detail.flow.cause,'NAVER 실제 원인');
  assert.equal(detail.flow.profit.value,596000);
  assert.equal(detail.flow.action,'NAVER 다음 행동');
  assert.equal(detail.provenance.channelSeparated,true);
  assert.equal('summary_json' in detail,false);
  assert.equal('raw' in detail,false);
});

test('insights joins the implemented V106 adapter set',()=>{
  assert.deepEqual(PHASE28_AVAILABLE_ADAPTERS,['main','orders','cs','inventory','products','settlement','keywords','product-analysis','insights','development','system','notifications','diagnoses','changes','validation','experiments','knowledge']);
});
