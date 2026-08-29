'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const {buildPhase28ProductAnalysisModel,PHASE28_AVAILABLE_ADAPTERS}=require('../lib/ui/phase28-adapters/index.js');
const loaders=require('../lib/dashboard/page-loader-profiles.js');

const performance={
  master_product_id:'p-1',name:'보리차 50티백',revenue:328000,orders:41,units:70,
  contribution_profit:126000,contribution_margin_rate:44.2,roas:512,cost_status:'CALCULATED',
  channels:{
    CAFE24:{revenue:118000,orders:15,units:24,impressions:0,clicks:0,ad_spend:0},
    NAVER:{revenue:126000,orders:14,units:14,impressions:27800,clicks:482,ad_spend:24600},
    COUPANG:{revenue:84000,orders:12,units:32,impressions:0,clicks:0,ad_spend:18000}
  }
};

test('product analysis adapter exposes real product evidence and keeps missing market inputs explicit',()=>{
  const model=buildPhase28ProductAnalysisModel({
    generatedAt:'2026-08-29T01:42:00.000Z',
    masterProducts:[{id:'p-1',name:'보리차 50티백',selling_price:8900}],
    productOperations:{items:[{master_product_id:'p-1',name:'보리차 50티백',channels:{CAFE24:{state:'ACTIVE'},NAVER:{state:'ACTIVE'},COUPANG:{state:'ACTIVE'}}}]},
    unifiedProductPerformance:{period_start:'2026-07-31',period_end:'2026-08-29',items:[performance]},
    reports:[]
  });

  assert.equal(model.writePolicy,'READ_ONLY');
  assert.equal(model.defaultPeriod,30);
  assert.equal(model.products.length,1);
  assert.equal(model.products[0].name,'보리차 50티백');
  assert.equal(model.products[0].metrics.revenue,328000);
  assert.equal(model.products[0].metrics.searchDemand,27800);
  assert.equal(model.products[0].sources.sales.status,'READY');
  assert.equal(model.products[0].sources.competition.status,'SETUP_REQUIRED');
  assert.equal(model.products[0].sources.audience.status,'SETUP_REQUIRED');
  assert.equal(model.history.length,0);
  assert.equal('inventory' in model.products[0],false);
});

test('product analysis adapter restores only saved product-analysis reports without mixing weekly channel reports',()=>{
  const model=buildPhase28ProductAnalysisModel({
    generatedAt:'2026-08-29T01:42:00.000Z',masterProducts:[],productOperations:{items:[]},unifiedProductPerformance:{items:[]},
    reports:[
      {id:'pa-1',report_type:'PRODUCT_ANALYSIS_p-1',period_start:'2026-07-31',period_end:'2026-08-29',created_at:'2026-08-29T01:40:00.000Z',summary_json:{kind:'PRODUCT_ANALYSIS',product:{id:'p-1',name:'보리차 50티백'},period_days:30,metrics:{revenue:328000},sources:{sales:{status:'READY'}}}},
      {id:'weekly-1',report_type:'WEEKLY',period_start:'2026-08-22',period_end:'2026-08-29',summary_json:{score:80}}
    ]
  });

  assert.equal(model.history.length,1);
  assert.equal(model.history[0].id,'pa-1');
  assert.equal(model.history[0].product.name,'보리차 50티백');
  assert.equal(model.history[0].periodDays,30);
});

test('product analysis joins the implemented V106 adapter set',()=>{
  assert.deepEqual(PHASE28_AVAILABLE_ADAPTERS,['main','orders','cs','inventory','products','settlement','keywords','product-analysis','insights','development']);
});

test('product analysis loads only its calculation inputs and saved reports',()=>{
  const profile=loaders.profileForState({view:'product-analysis',workspace:null,platform:'all'});
  assert.ok(profile.tables.includes('master_products'));
  assert.ok(profile.tables.includes('cafe24_orders'));
  assert.ok(profile.tables.includes('naver_keyword_stats'));
  assert.ok(profile.tables.includes('coupang_ad_keyword_daily'));
  assert.ok(profile.tables.includes('reports'));
  assert.equal(profile.tables.includes('customer_service_items'),false);
  assert.equal(profile.tables.includes('automation_runs'),false);
  assert.equal(profile.tables.includes('coupang_settlements'),false);
});
