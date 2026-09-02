'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {buildNaverOwnerInsight}=require('../lib/reports/naver-owner-insight.js');
const insightsAdapter=require('../lib/ui/phase28-adapters/insights.js');

function summary(overrides={}){
  return {
    generated_at:'2026-09-01T22:30:00.000Z',
    period:{start:'2026-08-24',end:'2026-08-30'},
    naver:{
      connected:true,impressions:120000,clicks:2500,ad_spend:420000,purchase_count:92,
      revenue:1680000,roas:400,ctr:2.08,cpc:168,cvr:3.68,cpa:4565,average_order_value:18261,
      confidence:{level:'HIGH',label:'높음'},
      top_campaigns:[
        {id:'c-good',name:'브랜드 캠페인',cost:180000,revenue:990000,conversions:54,roas:550,confidence:{level:'HIGH',label:'높음'}},
        {id:'c-risk',name:'일반 키워드',cost:150000,revenue:210000,conversions:9,roas:140,confidence:{level:'HIGH',label:'높음'}}
      ]
    },
    keywords:{
      period:{period_start:'2026-08-24',period_end:'2026-08-30'},waste_cost:76000,
      growth:[{ncc_keyword_id:'g-1',keyword:'작두콩차',cost:52000,conversion_revenue:390000,conversions:18,roas:750,confidence:{level:'HIGH',label:'높음'}}],
      waste:[{ncc_keyword_id:'w-1',keyword:'건강차',cost:76000,conversion_revenue:0,conversions:0,roas:0,confidence:{level:'HIGH',label:'높음'}}]
    },
    comparison:{naver_roas:{current:400,previous:455,change_rate:-12.1},naver_spend:{current:420000,previous:390000,change_rate:7.7}},
    comparison_guard:{safe:true,message:'같은 기준 비교'},
    data_coverage:{naver_ads:{status:'OK',actual_days:7,expected_days:7}},
    operating_rule:{source:'SAVED',versions:{insight:4},thresholds:{target_roas_percent:300,change_warning_percent:10}},
    financial_trust:{status:'READY'},
    insights:[
      {level:'good',area:'NAVER',title:'목표 ROAS 달성',body:'목표 300%를 넘었습니다.'},
      {level:'warning',area:'KEYWORD',title:'무전환 비용 발견',body:'1개 항목에서 76,000원이 발생했습니다.'}
    ],
    recommendations:[
      {priority:'HIGH',area:'KEYWORD',title:'무전환 키워드 입찰 검토',reason:'전환 없는 광고비가 확인됐습니다.',expected:'낭비 광고비 축소'},
      {priority:'MEDIUM',area:'NAVER',title:'브랜드 캠페인 유지 검토',reason:'목표 ROAS를 넘었습니다.',expected:'검증된 수요 유지'}
    ],
    ...overrides
  };
}

test('Naver weekly snapshot is expanded into an owner decision brief with evidence and safe actions',()=>{
  const brief=buildNaverOwnerInsight(summary());

  assert.equal(brief.snapshotVersion,'NAVER_WEEKLY_OWNER_V2');
  assert.equal(brief.decision.label,'효율 유지·확대 검토');
  assert.equal(brief.decision.automaticWrite,false);
  assert.equal(brief.scorecard.find(item=>item.id==='paidRoas').value,400);
  assert.equal(brief.scorecard.find(item=>item.id==='paidRoas').target,300);
  assert.equal(brief.scorecard.find(item=>item.id==='paidRoas').changeRate,-12.1);
  assert.equal(brief.campaigns[0].decision,'유지·확대 검토');
  assert.equal(brief.campaigns[1].decision,'감액 검토');
  assert.equal(brief.keywords.wasteCost,76000);
  assert.equal(brief.keywords.waste[0].keyword,'건강차');
  assert.equal(brief.actions.now[0].title,'무전환 키워드 입찰 검토');
  assert.match(brief.actions.guardrail,/자동 변경하지 않/);
  assert.equal(brief.evidence.comparisonSafe,true);
  assert.equal(brief.evidence.coverageStatus,'READY');
  assert.equal(brief.evidence.ruleSource,'SAVED');
  assert.equal(brief.confidence.level,'HIGH');
});

test('Naver owner brief never turns missing business evidence into zero or a confident decision',()=>{
  const brief=buildNaverOwnerInsight(summary({
    naver:{connected:false,confidence:{level:'LOW',label:'낮음'}},
    comparison:{},comparison_guard:{safe:false,message:'운영 변경 기간'},
    data_coverage:{naver_ads:{status:'PARTIAL',actual_days:3,expected_days:7}},
    insights:[],recommendations:[],keywords:{period:null,growth:[],waste:[],waste_cost:null}
  }));

  assert.equal(brief.decision.label,'판단 보류');
  assert.equal(brief.scorecard.find(item=>item.id==='adSpend').value,null);
  assert.equal(brief.scorecard.find(item=>item.id==='paidRoas').value,null);
  assert.equal(brief.evidence.comparisonSafe,false);
  assert.equal(brief.evidence.coverageStatus,'CHECK_REQUIRED');
  assert.ok(brief.caveats.some(item=>item.includes('0원으로 대체하지')));
});

test('the weekly report pipeline persists the owner brief only for Naver weekly snapshots',()=>{
  const source=fs.readFileSync(path.join(__dirname,'../lib/reports/weekly.js'),'utf8');
  assert.match(source,/platform==='NAVER'&&reportType==='WEEKLY'.*summary\.owner_brief=naverOwnerInsightModule\.buildNaverOwnerInsight\(summary\)/);
});

test('owner V2 translates the ROAS 700 standard into three levers, a seven-stage bottleneck, and separated money evidence',()=>{
  const input=summary({
    naver:{
      connected:true,impressions:100000,clicks:2000,ad_spend:600000,purchase_count:40,
      revenue:1200000,roas:200,ctr:2,cpc:300,cvr:2,cpa:15000,average_order_value:30000,
      confidence:{level:'HIGH',label:'높음'},top_campaigns:[]
    },
    comparison:{
      naver_average_order_value:{current:30000,previous:28000,change_rate:7.1},
      naver_cvr:{current:2,previous:2.5,change_rate:-20},
      naver_cpc:{current:300,previous:250,change_rate:20},
      naver_impressions:{current:100000,previous:95000,change_rate:5.3},
      naver_clicks:{current:2000,previous:2100,change_rate:-4.8},
      naver_ctr:{current:2,previous:2.21,change_rate:-9.5}
    },
    operating_rule:{source:'SAVED',versions:{insight:5},thresholds:{target_roas_percent:700,change_warning_percent:10}},
    business_context:{
      store:{netRevenue:2100000,orders:70,averageOrderValue:30000,customers:{status:'PARTIAL',returningRate:18}},
      profitability:{contributionProfit:420000,costCoverageRate:96},
      attribution:{settlementRevenue:null,orderLinkStatus:'CHECK_REQUIRED'}
    },
    financial_trust:{status:'READY'}
  });
  const brief=buildNaverOwnerInsight(input);

  assert.equal(brief.snapshotVersion,'NAVER_WEEKLY_OWNER_V2');
  assert.equal(brief.evidence.standardVersion,'HARIN-NAVER-ROAS-700-V1.0');
  assert.deepEqual(brief.levers.map(item=>item.id),['aov','cvr','cpc']);
  assert.equal(Math.round(brief.levers.find(item=>item.id==='cpc').target),86);
  assert.equal(brief.levers.find(item=>item.id==='cvr').target,7);
  assert.equal(brief.bottleneck.length,7);
  assert.deepEqual(brief.bottleneck.map(item=>item.id),['exposure','click','intent','detail','purchase','profit','repeat']);
  assert.equal(brief.economics.find(item=>item.id==='attributedRevenue').value,1200000);
  assert.equal(brief.economics.find(item=>item.id==='storeNetRevenue').value,2100000);
  assert.equal(brief.economics.find(item=>item.id==='settlementRoas').value,null);
  assert.equal(brief.economics.find(item=>item.id==='contributionProfit').value,420000);
  assert.ok(brief.verification.some(item=>item.id==='orderAttribution'&&item.state==='CHECK_REQUIRED'));
  assert.ok(brief.actions.now.every(item=>item.successMetric&&item.reviewWindow));
});

test('legacy saved owner briefs are rebuilt as V2 while missing financial evidence still blocks expansion',()=>{
  const reportSummary=summary({
    owner_brief:{snapshotVersion:'NAVER_WEEKLY_OWNER_V1',headline:'old snapshot'},
    financial_trust:{status:'CHECK_REQUIRED'}
  });
  const model=insightsAdapter.buildPhase28InsightsModel({
    generatedAt:'2026-09-03T00:00:00.000Z',
    reports:[{id:'weekly-1',platform:'NAVER',report_type:'WEEKLY',period_start:'2026-08-24',period_end:'2026-08-30',created_at:'2026-08-31T00:00:00.000Z',summary_json:reportSummary}],
    dataHealth:{channels:[{platform:'NAVER',status:'READY'}]}
  });

  assert.equal(model.channels[0].ownerBrief.snapshotVersion,'NAVER_WEEKLY_OWNER_V2');
  assert.match(model.channels[0].ownerBrief.decision.label,/증액 보류|판단 보류/);
});

test('weekly automation stores the owner standard metadata and the comparison inputs required by V2',()=>{
  const source=fs.readFileSync(path.join(__dirname,'../lib/reports/weekly.js'),'utf8');
  assert.match(source,/naver_average_order_value/);
  assert.match(source,/naver_impressions/);
  assert.match(source,/business_context/);
  assert.match(source,/HARIN-NAVER-ROAS-700-V1\.0/);
});
