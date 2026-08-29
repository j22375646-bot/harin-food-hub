'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const {buildPhase28KeywordsModel,PHASE28_AVAILABLE_ADAPTERS}=require('../lib/ui/phase28-adapters/index.js');

const candidate=(overrides={})=>({
  ncc_keyword_id:'kw-1',keyword:'작두콩차',ncc_campaign_id:'camp-1',campaign_name:'작두콩 쇼핑검색',
  ncc_adgroup_id:'group-1',adgroup_name:'목관리',current_bid:560,recommended_bid:500,
  minimum_owner_bid:70,maximum_owner_bid:100000,decision:'LOWER',status:'READY',
  can_request_approval:true,recommendation_ready:true,period_end:'2026-08-29',
  product_target:{name:'작두콩수세미차 30티백'},
  metrics:{impressions:1200,clicks:43,cost:48200,conversions:0,conversion_revenue:0,roas:0},
  reasons:[{message:'광고비를 사용했지만 주문이 없어요.'}],snapshot_token:'signed-snapshot',
  ...overrides
});

test('keyword adapter keeps channel and write boundaries while exposing editable Naver bids',()=>{
  const model=buildPhase28KeywordsModel({
    generatedAt:'2026-08-29T01:42:00.000Z',loadedWorkspace:'registered',
    naverBidWorkbench:{candidates:[candidate(),candidate({ncc_keyword_id:'kw-2',keyword:'목에좋은차',current_bid:420,recommended_bid:null,can_request_approval:false,decision:'BLOCKED',snapshot_token:null})]},
    coupang:{adKeywordTop:[],adKeywordWaste:[]},financialChanges:[]
  },{platform:'naver',workspace:'registered'});

  assert.equal(model.platform,'naver');
  assert.equal(model.workspace,'registered');
  assert.equal(model.writePolicy,'GUARDED');
  assert.equal(model.rows.length,2);
  assert.equal(model.rows[0].channel,'NAVER');
  assert.equal(model.rows[0].canDraft,true);
  assert.equal(model.rows[0].snapshotToken,'signed-snapshot');
  assert.equal(model.rows[1].recommendedBid,null);
  assert.equal(model.rows[1].statusLabel,'판단 보류');
  assert.equal(model.summary.noOrderSpend,96400);
  assert.equal(model.channels.find(item=>item.id==='coupang').writeMode,'WING_MANUAL');
});

test('keyword adapter keeps missing Coupang bid evidence explicit and never enables API writes',()=>{
  const model=buildPhase28KeywordsModel({
    generatedAt:'2026-08-29T01:42:00.000Z',loadedWorkspace:'registered',naverBidWorkbench:{candidates:[]},
    coupang:{adKeywordTop:[{campaign_id:'cp-1',advertised_option_id:'op-1',keyword:'작두콩차',campaign_name:'쿠팡 상품광고',advertised_product_name:'작두콩수세미차 30티백',clicks:28,ad_spend:41000,orders_14d:0,revenue_14d:0,date:'2026-08-29'}],adKeywordWaste:[]},financialChanges:[]
  },{platform:'coupang',workspace:'registered'});

  assert.equal(model.rows.length,1);
  assert.equal(model.rows[0].channel,'COUPANG');
  assert.equal(model.rows[0].currentBid,null);
  assert.equal(model.rows[0].recommendedBid,null);
  assert.equal(model.rows[0].canDraft,false);
  assert.equal(model.rows[0].applicationMode,'WING_MANUAL');
  assert.equal(model.summary.noOrderSpend,41000);
});

test('keywords joins the implemented V106 adapter set',()=>{
  assert.deepEqual(PHASE28_AVAILABLE_ADAPTERS,['main','orders','cs','inventory','products','settlement','keywords','product-analysis','insights','development','system']);
});
