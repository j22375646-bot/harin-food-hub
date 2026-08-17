'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const trends=require('../lib/market-intelligence/naver-trends.js');

const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');

test('18-2 builds reusable product keywords without fixing the hub to one product',()=>{
  assert.equal(trends.productKeyword('하린식품 해썹인증 레드비트차 45g(30TB)'),'하린식품 레드비트차');
  assert.deepEqual(trends.normalizeKeywords(['레드비트차','레드비트차','비트차','차']),['레드비트차','비트차','차']);
  assert.throws(()=>trends.normalizeKeywords([]),/검색어/);
  const client=read('app/market-intelligence/[projectId]/market/naver-trend-client.js');
  assert.doesNotMatch(client,/작수차/);
  assert.match(client,/productName/);
});

test('18-2 validates owner-selected period, unit and shopping category',()=>{
  const profile=trends.normalizeProfile({topic_name:'레드비트 수요',keywords:['레드비트차'],shopping_category_code:'50000006',shopping_category_name:'식품',period_days:90,time_unit:'week',owner_confirmed:true},{productName:'레드비트차'});
  assert.equal(profile.shopping_category_code,'50000006');
  assert.equal(profile.owner_confirmed,true);
  assert.throws(()=>trends.normalizeProfile({keywords:['차'],shopping_category_code:'123'},{productName:'차'}),/8자리/);
  assert.throws(()=>trends.normalizeProfile({keywords:['차'],period_days:40},{productName:'차'}),/기간/);
});

test('18-2 normalizes only returned periods and never fabricates missing zeroes',()=>{
  const series=trends.normalizeSeries({results:[{title:'레드비트차',keywords:['레드비트차'],data:[{period:'2026-08-01',ratio:42.5},{period:'2026-08-03',ratio:80}]}]},['레드비트차']);
  assert.deepEqual(series[0].points,[{period:'2026-08-01',ratio:42.5},{period:'2026-08-03',ratio:80}]);
  assert.equal(series[0].points.some(point=>point.period==='2026-08-02'),false);
  const summary=trends.summarizeSeries(series,['레드비트차','비트차']);
  assert.equal(summary.data_status,'PARTIAL');
  assert.deepEqual(summary.summary.missing_keywords,['비트차']);
  assert.equal(trends.summarizeSeries([],['차']).data_status,'NO_DATA');
});

test('18-2 uses official Search Trend and Shopping Insight endpoints with separate requests',()=>{
  const client=read('lib/naver-api-hub/client.js');
  assert.match(client,/\/search-trend\/v1\/search/);
  assert.match(client,/\/shopping\/v1\/category\/keywords/);
  assert.match(client,/fetchSearchTrend/);
  assert.match(client,/fetchShoppingKeywordTrend/);
  const service=read('lib/market-intelligence/naver-trends.js');
  assert.match(service,/Promise\.allSettled/);
  assert.match(service,/SEARCH_TREND/);
  assert.match(service,/SHOPPING_KEYWORD/);
  assert.match(service,/RELATIVE_RATIO|상대지수/);
});

test('18-2 database isolates profiles and snapshots by both project and product',()=>{
  const sql=read('supabase/migrations/20260817180000_add_market_naver_trends.sql');
  for(const table of ['market_naver_trend_profiles','market_naver_trend_snapshots']){
    assert.match(sql,new RegExp(`create table if not exists public\\.${table}`));
    assert.match(sql,new RegExp(`alter table public\\.${table} enable row level security`));
  }
  assert.match(sql,/master_product_id uuid not null/);
  assert.match(sql,/market NAVER trend product does not match project/);
  assert.match(sql,/security invoker/);
  assert.match(sql,/revoke all on table public\.market_naver_trend_profiles from public, anon, authenticated/);
  assert.match(sql,/revoke all on table public\.market_naver_trend_snapshots from public, anon, authenticated/);
  assert.match(sql,/Missing periods are never stored as zero/);
});

test('18-2 route is owner-session protected and page AI remains separate',()=>{
  const route=read('app/api/market-intelligence/projects/[projectId]/naver-trends/route.js');
  assert.match(route,/apiSafety\.isAuthorized\(request,authModule\)/);
  assert.match(route,/readJson/);
  const workspace=read('app/market-intelligence/[projectId]/workspace-page.js');
  assert.match(workspace,/MarketNaverTrend/);
  assert.match(workspace,/MarketProfileWorkbench/);
  assert.match(workspace,/MarketPageAi/);
  const client=read('app/market-intelligence/[projectId]/market/naver-trend-client.js');
  assert.match(client,/실제 검색량이 아니라/);
  assert.match(client,/다른 상품 자료와 섞지 않고/);
  assert.match(client,/광고·상품·입찰가는 변경하지 않아요/);
});

test('18-2 uses readable V8 pastel panels and mobile 48px controls',()=>{
  const css=read('app/_analysis/harin-market-intelligence.css');
  assert.match(css,/Phase 18-2/);
  assert.match(css,/\.marketNaverTrendWorkbench/);
  assert.match(css,/\.marketTrendCharts/);
  assert.match(css,/@media\(max-width:700px\)/);
  assert.match(css,/marketNaverTrendWorkbench button[^}]+min-height:48px/);
});
