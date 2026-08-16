'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const operations=require('../lib/marketing/keyword-operations.js');
const routes=require('../lib/navigation/hub-routes.js');

const naverCandidate={ncc_keyword_id:'nkw-1',ncc_adgroup_id:'group-1',keyword:'작두콩차',current_bid:320,recommended_bid:290,minimum_owner_bid:270,maximum_owner_bid:350,status:'READY',decision:'LOWER',can_request_approval:true,metrics:{impressions:1000,clicks:43,cost:18200,conversions:1,conversion_revenue:56400,roas:309.9},product_target:{name:'작두콩차 티백'},period_end:'2026-08-15'};
const coupangKeyword={campaign_id:'cp-1',campaign_name:'작두콩 캠페인',advertised_product_name:'작두콩차 티백',keyword:'작두콩차',impressions:800,clicks:20,ad_spend:12000,orders_14d:0,revenue_14d:0,roas_14d:0,date:'2026-08-15'};

test('15-4 keeps Naver and Coupang keyword rows separated by the selected platform',()=>{
  const input={naverBidWorkbench:{candidates:[naverCandidate]},coupang:{adKeywordTop:[],adKeywordWaste:[coupangKeyword]},workspace:'registered'};
  const naver=operations.normalizeKeywordRows({...input,platform:'naver'});
  const coupang=operations.normalizeKeywordRows({...input,platform:'coupang'});
  assert.equal(naver.length,1);assert.equal(naver[0].platform,'NAVER');assert.equal(naver[0].canDraft,true);
  assert.equal(coupang.length,1);assert.equal(coupang[0].platform,'COUPANG');assert.equal(coupang[0].applicationMode,'MANUAL_REQUIRED');
  assert.equal(coupang[0].currentBid,null);
});

test('15-4 filters, sorts and paginates keyword operations without platform writes',()=>{
  const rows=operations.normalizeKeywordRows({naverBidWorkbench:{candidates:[naverCandidate,{...naverCandidate,ncc_keyword_id:'nkw-2',keyword:'레드비트차',metrics:{...naverCandidate.metrics,cost:5000,conversions:0}}]},workspace:'registered',platform:'naver'});
  const filtered=operations.filterKeywordRows(rows,{quickFilter:'NO_ORDER_COST',sort:'COST_DESC'});
  assert.deepEqual(filtered.map(item=>item.keyword),['레드비트차']);
  const page=operations.paginateKeywordRows(rows,1,25);
  assert.equal(page.total,2);assert.equal(page.pageSize,25);
  assert.equal(operations.keywordOperationSummary(rows).ready,2);
});

test('15-4 keyword routes default to Naver, keep actual search terms Naver-only, and include history',()=>{
  assert.equal(routes.parseHubHref('/keywords/registered').platform,'naver');
  assert.equal(routes.parseHubHref('/keywords/search-terms?platform=coupang').platform,'naver');
  assert.equal(routes.parseHubHref('/keywords/registered?platform=coupang').platform,'coupang');
  assert.ok(routes.HUB_WORKSPACES.keyword.some(item=>item.id==='history'&&item.href==='/keywords/history'));
});

test('15-4 renders a responsive table, mobile cards, drafts and a detail panel',()=>{
  const component=fs.readFileSync('app/_analysis/keyword-operations-table.js','utf8');
  const dashboard=fs.readFileSync('app/dashboard-client.js','utf8');
  const css=fs.readFileSync('app/_analysis/harin-analysis-v8.css','utf8');
  assert.match(component,/네이버와 쿠팡은 서로 섞지 않고/);
  assert.match(component,/추천가 채우기/);
  assert.match(component,/변경 전 검토/);
  assert.match(component,/실제 반영은 15-5 승인 단계/);
  assert.doesNotMatch(component,/fetch\(/);
  assert.match(dashboard,/플랫폼별 분리 운영/);
  assert.match(css,/\.keywordOpsTable/);
  assert.match(css,/\.keywordOpsMobileAction/);
  assert.match(css,/content-visibility:auto/);
});
