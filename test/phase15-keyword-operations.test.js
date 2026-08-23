'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const operations=require('../lib/marketing/keyword-operations.js');
const wing=require('../lib/marketing/coupang-wing-worklist.js');
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
  const page=operations.paginateKeywordRows(rows,1,12);
  assert.equal(page.total,2);assert.equal(page.pageSize,12);
  assert.equal(operations.keywordOperationSummary(rows).ready,2);
});

test('24-1 builds a single-owner Naver workspace that preserves platform scope across every task',()=>{
  const model=operations.keywordOwnerWorkspace({
    platform:'naver',workspace:'diagnosis',
    naverBidWorkbench:{candidates:[naverCandidate]},
    coupang:{adKeywordTop:[],adKeywordWaste:[coupangKeyword]}
  });

  assert.equal(model.ownerLabel,'사장님 전용 작업대');
  assert.equal(model.headline,'네이버 키워드 1개를 관리해요');
  assert.equal(model.mode.label,'API 직접 운영');
  assert.equal(model.mode.action,'한 번 확인 후 반영·재조회');
  assert.deepEqual(model.platforms.map(item=>[item.id,item.active,item.href]),[
    ['naver',true,'/keywords/diagnosis?platform=naver'],
    ['coupang',false,'/keywords/diagnosis?platform=coupang']
  ]);
  assert.deepEqual(model.workspaces.map(item=>item.href),[
    '/keywords/registered?platform=naver',
    '/keywords/search-terms?platform=naver',
    '/keywords/diagnosis?platform=naver',
    '/keywords/history?platform=naver'
  ]);
  assert.equal(JSON.stringify(model).includes('사용자 관리'),false);
  assert.equal(JSON.stringify(model).includes('승인 대기'),false);
});

test('24-1 keeps Coupang in a separate WING workspace and never links it to Naver-only search terms',()=>{
  const model=operations.keywordOwnerWorkspace({
    platform:'coupang',workspace:'registered',
    naverBidWorkbench:{candidates:[naverCandidate]},
    coupang:{adKeywordTop:[],adKeywordWaste:[coupangKeyword]}
  });

  assert.equal(model.headline,'쿠팡 키워드 1개를 관리해요');
  assert.equal(model.mode.label,'WING 수동 운영');
  assert.equal(model.mode.action,'작업표 확인 후 WING 반영');
  assert.deepEqual(model.workspaces.map(item=>item.id),['registered','diagnosis','history']);
  assert.ok(model.workspaces.every(item=>item.href.endsWith('platform=coupang')));
  assert.equal(model.workspaces.some(item=>item.id==='search-terms'),false);
  assert.deepEqual(model.summary,{total:1,ready:0,noOrderCost:12000,manual:1});
});

test('15-4 keyword routes default to Naver, keep actual search terms Naver-only, and include history',()=>{
  assert.equal(routes.parseHubHref('/keywords/registered').platform,'naver');
  assert.equal(routes.parseHubHref('/keywords/search-terms?platform=coupang').platform,'naver');
  assert.equal(routes.parseHubHref('/keywords/registered?platform=coupang').platform,'coupang');
  assert.ok(routes.HUB_WORKSPACES.keyword.some(item=>item.id==='history'&&item.href==='/keywords/history'));
});

test('15-4 renders a responsive table, mobile cards, drafts and a detail panel',()=>{
  const component=fs.readFileSync('app/_analysis/keyword-operations-table.js','utf8');
  const ownerShell=fs.readFileSync('app/_analysis/keyword-owner-shell.js','utf8');
  const css=fs.readFileSync('app/_analysis/harin-analysis-v8.css','utf8');
  const bulkCss=fs.readFileSync('app/_design-system/harin-bulk-selection.css','utf8');
  assert.match(component,/네이버와 쿠팡은 서로 섞지 않고/);
  assert.match(component,/추천가 채우기/);
  assert.match(component,/변경 전 확인/);
  assert.match(component,/마지막 확인 뒤 네이버 반영과 재조회까지/);
  assert.match(ownerShell,/keywordOwnerWorkspace/);
  assert.match(component,/별도 작업대로 운영/);
  assert.match(css,/\.keywordOpsTable/);
  assert.match(bulkCss,/\.v8BulkSelectionBar\.active/);
  assert.match(css,/content-visibility:auto/);
});

test('22-1 confirms and executes Naver changes directly while keeping Coupang out of the writer',()=>{
  const component=fs.readFileSync('app/_analysis/keyword-operations-table.js','utf8');
  const writer=fs.readFileSync('lib/naver/bid-execution.js','utf8');
  assert.match(component,/platform!==['"]naver['"]/);
  assert.match(component,/fetch\(['"]\/api\/naver\/bid-proposals['"]/);
  assert.match(component,/CONFIRM_EXECUTE/);
  assert.match(component,/변경값 확인/);
  assert.match(component,/결과 재조회/);
  assert.match(component,/쿠팡 항목은 이 흐름에 들어오지 않으며 WING 수동 적용/);
  assert.match(component,/\/api\/financial-changes\/\$\{/);
  assert.doesNotMatch(component,/\/api\/coupang\//);
  assert.match(writer,/await fetchKeyword\(request\.target_key, api\)/);
  assert.match(writer,/const observed = await fetchKeyword\(live\.nccKeywordId, api\)/);
  assert.match(writer,/NAVER_BID_VERIFY_FAILED/);
});

test('15-5 history uses financial change requests and preserves live verification results',()=>{
  const change={id:'change-1',change_type:'NAVER_BID',platform:'NAVER',target_key:'nkw-1',status:'VERIFIED',before_value:{values:{bid_amount:320}},proposed_value:{values:{bid_amount:290}},impact_preview:{metadata:{keyword:'작두콩차',product_target:{name:'작두콩차 티백'}}},verification_result:{actual:{values:{bid_amount:290}}},created_at:'2026-08-16T00:00:00Z',verified_at:'2026-08-16T00:10:00Z'};
  const naver=operations.normalizeKeywordRows({financialChanges:[change],workspace:'history',platform:'naver'});
  const coupang=operations.normalizeKeywordRows({financialChanges:[change],workspace:'history',platform:'coupang'});
  assert.equal(naver.length,1);
  assert.equal(naver[0].currentBid,320);
  assert.equal(naver[0].recommendedBid,290);
  assert.equal(naver[0].observedBid,290);
  assert.equal(naver[0].status,'VERIFIED');
  assert.equal(coupang.length,0);
  const page=fs.readFileSync('app/page.js','utf8');
  assert.match(page,/before_value,proposed_value,impact_preview/);
  assert.match(page,/verification_result/);
});

test('15-6 builds a Coupang-only WING worklist and never mixes Naver rows',()=>{
  const rows=[
    {...operations.coupangKeywordRows({adKeywordWaste:[coupangKeyword]})[0]},
    {...operations.naverRegisteredRows({candidates:[naverCandidate]})[0]}
  ];
  const coupangId=rows[0].id;
  const items=wing.buildCoupangWingWorklist(rows,{[coupangId]:{action:'LOWER',currentBid:'320',targetBid:'290',memo:'무주문 감액'}});
  assert.equal(items.length,1);
  assert.equal(items[0].platform,'COUPANG');
  assert.equal(items[0].keyword,'작두콩차');
  assert.equal(items[0].currentBid,320);
  assert.equal(items[0].targetBid,290);
  assert.equal(items[0].status,'READY_FOR_WING');
});

test('15-6 keeps unknown Coupang bids blank instead of converting them to zero',()=>{
  const rows=operations.coupangKeywordRows({adKeywordWaste:[coupangKeyword]});
  const items=wing.buildCoupangWingWorklist(rows,{});
  assert.equal(items[0].currentBid,null);
  assert.equal(items[0].targetBid,null);
  assert.equal(items[0].status,'WING_BID_REQUIRED');
  const csv=wing.coupangWingCsv(items);
  assert.match(csv,/WING 입찰가 확인 필요/);
  assert.doesNotMatch(csv,/네이버/);
});

test('15-6 CSV escapes spreadsheet formulas and capability truthfully locks public bid writes',()=>{
  const items=wing.buildCoupangWingWorklist([{...operations.coupangKeywordRows({adKeywordWaste:[coupangKeyword]})[0],keyword:'=CMD()'}],{});
  const csv=wing.coupangWingCsv(items);
  assert.match(csv,/"'=CMD\(\)"/);
  assert.equal(wing.COUPANG_AD_CAPABILITY.publicBidWriteEndpointDocumented,false);
  assert.equal(wing.COUPANG_AD_CAPABILITY.bidWrite,'MANUAL_REQUIRED');
});

test('15-6 exposes only a WING worklist UI for Coupang and no Coupang writer request',()=>{
  const component=fs.readFileSync('app/_analysis/keyword-operations-table.js','utf8');
  const css=fs.readFileSync('app/_analysis/harin-analysis-v8.css','utf8');
  assert.match(component,/WING 작업표 열기/);
  assert.match(component,/쿠팡에서 직접 반영할 작업만 정리했어요/);
  assert.match(component,/CSV 내려받기/);
  assert.match(component,/공개 Seller Open API 문서에서 광고 키워드 입찰 쓰기를 확인하지 못했습니다/);
  assert.doesNotMatch(component,/fetch\(['"]\/api\/coupang\//);
  assert.match(css,/\.keywordOpsWingList/);
  assert.match(css,/\.keywordOpsCapability/);
});
