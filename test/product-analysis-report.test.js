'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const {buildProductAnalysisSummary,productAnalysisReportType}=require('../lib/analytics/product-analysis-report.js');

test('product analysis summary calculates only connected evidence and leaves external market data unavailable',()=>{
  const summary=buildProductAnalysisSummary({
    product:{id:'p-1',name:'보리차 50티백',sku:'923003'},periodDays:30,periodStart:'2026-07-31',periodEnd:'2026-08-29',generatedAt:'2026-08-29T01:42:00Z',
    performance:{revenue:328000,orders:41,units:70,contribution_profit:126000,contribution_margin_rate:44.2,roas:512,cost_status:'CALCULATED',channels:{CAFE24:{revenue:118000,orders:15,units:24},NAVER:{revenue:126000,orders:14,units:14,impressions:27800,clicks:482,ad_spend:24600},COUPANG:{revenue:84000,orders:12,units:32,ad_spend:18000}}},
    keywords:[{keyword:'보리차',impressions:27800,clicks:482,cost:24600,conversions:14,conversion_revenue:126000}]
  });

  assert.equal(summary.kind,'PRODUCT_ANALYSIS');
  assert.equal(summary.metrics.revenue,328000);
  assert.equal(summary.metrics.search_demand,27800);
  assert.equal(summary.metrics.click_rate,Number((482/27800*100).toFixed(2)));
  assert.equal(summary.metrics.order_value,8000);
  assert.equal(summary.sources.sales.status,'READY');
  assert.equal(summary.sources.profit.status,'CALCULATED');
  assert.equal(summary.sources.competition.status,'SETUP_REQUIRED');
  assert.equal(summary.sources.audience.status,'SETUP_REQUIRED');
  assert.equal(summary.keywords[0].keyword,'보리차');
});

test('product analysis report type is stable and safe per product',()=>{
  assert.equal(productAnalysisReportType('P-1_한글'),'PRODUCT_ANALYSIS_P-1_');
  assert.equal(productAnalysisReportType('../../'),'PRODUCT_ANALYSIS_PRODUCT');
});
