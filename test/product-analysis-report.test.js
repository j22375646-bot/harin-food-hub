'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const {buildCustomerPurchaseEvidence,buildProductAnalysisSummary,productAnalysisReportType}=require('../lib/analytics/product-analysis-report.js');

test('ratio numerators remain unknown instead of becoming zero',()=>{
  const report=buildProductAnalysisSummary({performance:{revenue:null,orders:3},keywords:[{impressions:100,clicks:null,cost:10,conversion_revenue:null}]});
  assert.equal(report.metrics.order_value,null);
  assert.equal(report.keywords[0].ctr,null);
  assert.equal(report.keywords[0].roas,null);
});

test('empty keywords require explicit channel advertising evidence before reporting measured zero',()=>{
  const performance={revenue:100,orders:1,channels:{NAVER:{impressions:0,clicks:0}}};
  const missing=buildProductAnalysisSummary({performance});
  assert.equal(missing.metrics.search_demand,null);
  assert.equal(missing.sources.search.status,'NO_DATA');
  const measured=buildProductAnalysisSummary({performance:{...performance,channels:{NAVER:{impressions:0,clicks:0,ad_evidence_status:'READY'}}}});
  assert.equal(measured.metrics.search_demand,0);
  assert.equal(measured.sources.search.status,'READY');
});

test('saved legacy analysis keeps historical values and exposes affected calculation assessment',()=>{
  const {normalizeSavedReport}=require('../lib/ui/phase28-adapters/product-analysis.js');
  const stored={summary_json:{metrics:{search_demand:1200},schema_version:'1.1'}};
  const report=normalizeSavedReport(stored);
  assert.equal(report.metrics.search_demand,1200);
  assert.equal(report.calculationAssessment.status,'CHECK_REQUIRED');
  assert.match(report.calculationAssessment.message,/12|누락/);
  assert.equal(stored.summary_json.calculation_version,undefined);
});

test('missing or partially missing impressions remain unknown while measured zero is real',()=>{
  for(const keywords of [[{impressions:null}],[{impressions:100},{impressions:null}]]){
    const report=buildProductAnalysisSummary({keywords});
    assert.equal(report.metrics.search_demand,null);
    assert.notEqual(report.sources.search.status,'READY');
    assert.equal(report.metrics.click_rate,null);
  }
  const zero=buildProductAnalysisSummary({keywords:[{impressions:0,clicks:0}]});
  assert.equal(zero.metrics.search_demand,0);
  assert.equal(zero.sources.search.status,'READY');
});

test('advertising impressions aggregate all keywords before the twelve row display cap',()=>{
  const summary=buildProductAnalysisSummary({keywords:Array.from({length:13},(_,i)=>({keyword:`k${i}`,impressions:100,clicks:10}))});
  assert.equal(summary.metrics.search_demand,1300);
  assert.equal(summary.keywords.length,12);
  assert.equal(summary.metrics.search_clicks,130);
  assert.equal(summary.calculation_version,'PRODUCT_ANALYSIS_V2');
  assert.match(summary.signals[0].title,/광고 노출/);
});

test('product analysis summary calculates only connected evidence and leaves external market data unavailable',()=>{
  const summary=buildProductAnalysisSummary({
    product:{id:'p-1',name:'보리차 50티백',sku:'923003'},periodDays:30,periodStart:'2026-07-31',periodEnd:'2026-08-29',generatedAt:'2026-08-29T01:42:00Z',
    performance:{revenue:328000,orders:41,units:70,contribution_profit:126000,contribution_margin_rate:44.2,roas:512,cost_status:'CALCULATED',channels:{CAFE24:{revenue:118000,orders:15,units:24},NAVER:{revenue:126000,orders:14,units:14,impressions:27800,clicks:482,ad_spend:24600},COUPANG:{revenue:84000,orders:12,units:32,ad_spend:18000}}},
    keywords:[{keyword:'보리차',impressions:27800,clicks:482,cost:24600,conversions:14,conversion_revenue:126000}]
  });

  assert.equal(summary.kind,'PRODUCT_ANALYSIS');
  assert.equal(summary.schema_version,'1.1');
  assert.equal(summary.metrics.revenue,328000);
  assert.equal(summary.metrics.search_demand,27800);
  assert.equal(summary.metrics.click_rate,Number((482/27800*100).toFixed(2)));
  assert.equal(summary.metrics.order_value,8000);
  assert.equal(summary.sources.sales.status,'READY');
  assert.equal(summary.sources.sales.href,'/products/mappings?product=p-1');
  assert.equal(summary.sources.profit.status,'CALCULATED');
  assert.equal(summary.sources.search.href,'/keywords/registered?platform=naver&product=p-1');
  assert.equal(summary.sources.competition.status,'SETUP_REQUIRED');
  assert.equal(summary.sources.competition.href,'/market-intelligence?master_product_id=p-1');
  assert.equal(summary.sources.audience.status,'SETUP_REQUIRED');
  assert.equal(summary.sources.audience.href,'/market-intelligence?master_product_id=p-1');
  assert.equal(summary.sources.reviews.href,'/market-intelligence?master_product_id=p-1');
  assert.equal(summary.keywords[0].keyword,'보리차');
});

test('product analysis report type is stable and safe per product',()=>{
  assert.equal(productAnalysisReportType('P-1_한글'),'PRODUCT_ANALYSIS_P-1_');
  assert.equal(productAnalysisReportType('../../'),'PRODUCT_ANALYSIS_PRODUCT');
});

test('customer purchase evidence connects only product orders and never exposes customer ids',()=>{
  const evidence=buildCustomerPurchaseEvidence({
    orders:[
      {order_id:'o-1',customer_id:'customer-a'},
      {order_id:'o-2',customer_id:'customer-a'},
      {order_id:'o-3',customer_id:'customer-b'},
      {order_id:'o-4',customer_id:'customer-c'}
    ],
    productOrderIds:['o-1','o-2','o-3']
  });

  assert.deepEqual(evidence,{order_count:3,identified_customers:2,repeat_customers:1});
  assert.doesNotMatch(JSON.stringify(evidence),/customer-[abc]/);
});

test('product analysis summary promotes connected customer and verified market evidence',()=>{
  const summary=buildProductAnalysisSummary({
    product:{id:'p-1',name:'작두콩차'},generatedAt:'2026-08-31T01:00:00Z',
    performance:{revenue:120000,orders:10,cost_status:'CHECK_REQUIRED',channels:{}},
    customerEvidence:{order_count:7,identified_customers:5,repeat_customers:1},
    marketEvidence:{
      project_id:'project-1',
      verified_competitors:3,
      competitor_price_samples:2,
      verified_personas:1,
      verified_review_sets:2,
      review_sample_size:84,
      as_of:'2026-08-31T00:30:00Z'
    }
  });

  assert.equal(summary.sources.audience.status,'READY');
  assert.match(summary.sources.audience.detail,/Cafe24 구매고객 5명/);
  assert.equal(summary.sources.competition.status,'READY');
  assert.match(summary.sources.competition.detail,/가격 표본 2개/);
  assert.equal(summary.sources.reviews.status,'READY');
  assert.match(summary.sources.reviews.detail,/표본 84건/);
  assert.equal(summary.sources.profit.href,'/products/costs?master_product_id=p-1');
  assert.equal(summary.sources.competition.href,'/market-intelligence/project-1/competition');
  assert.equal(summary.sources.audience.href,'/market-intelligence/project-1/market');
  assert.equal(summary.sources.reviews.href,'/market-intelligence/project-1/competition');
  assert.deepEqual(summary.customer,{order_count:7,identified_customers:5,repeat_customers:1});
  assert.equal(summary.market.project_id,'project-1');
  assert.doesNotMatch(JSON.stringify(summary),/customer-a|customer-b/);
});
