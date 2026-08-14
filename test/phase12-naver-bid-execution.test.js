'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const execution = require('../lib/naver/bid-execution.js');

const keyword={
  nccKeywordId:'nkw-a001-01-000000000001',
  nccAdgroupId:'grp-a001',
  bidAmt:1000,
  useGroupBidAmt:false,
  userLock:false,
  status:'ELIGIBLE',
  attr:{}
};

test('Naver bid writer is off unless the server-only switch is explicit', () => {
  const previous=process.env.NAVER_SEARCH_AD_WRITE_ENABLED;
  delete process.env.NAVER_SEARCH_AD_WRITE_ENABLED;
  assert.equal(execution.configuration().write_enabled,false);
  process.env.NAVER_SEARCH_AD_WRITE_ENABLED='true';
  assert.equal(execution.configuration().write_enabled,true);
  if(previous===undefined)delete process.env.NAVER_SEARCH_AD_WRITE_ENABLED;else process.env.NAVER_SEARCH_AD_WRITE_ENABLED=previous;
});

test('Naver bid amounts are constrained to API bounds and ten-won steps', () => {
  assert.equal(execution.integerBid(70),70);
  assert.equal(execution.integerBid(100000),100000);
  assert.throws(()=>execution.integerBid(75),error=>error.code==='INVALID_BID_AMOUNT');
  assert.throws(()=>execution.integerBid(100010),error=>error.code==='INVALID_BID_AMOUNT');
});

test('live preflight blocks stale values, locks, and automatic bid groups', () => {
  assert.throws(()=>execution.assertLiveEligibility({keyword:{...keyword,bidAmt:900},group:{},targetBid:850,expectedBid:1000}),error=>error.code==='NAVER_BID_STALE');
  assert.throws(()=>execution.assertLiveEligibility({keyword:{...keyword,userLock:true},group:{},targetBid:850,expectedBid:1000}),error=>error.code==='KEYWORD_LOCKED');
  assert.throws(()=>execution.assertLiveEligibility({keyword,group:{autobidStrategy:{isAutobidActive:true}},targetBid:850,expectedBid:1000}),error=>error.code==='NAVER_AUTOBID_ACTIVE');
});

test('shopping brand groups retain the current Naver minimum bid rule', () => {
  assert.equal(execution.minimumBidFor({adgroupType:'SHOPPING_BRAND'}),300);
  assert.throws(()=>execution.assertLiveEligibility({keyword,group:{adgroupType:'SHOPPING_BRAND'},targetBid:290,expectedBid:1000}),error=>error.code==='NAVER_MINIMUM_BID');
});

test('approved execution sends the official keyword bid payload and rechecks the result', async () => {
  const previous=process.env.NAVER_SEARCH_AD_WRITE_ENABLED;
  process.env.NAVER_SEARCH_AD_WRITE_ENABLED='true';
  const productId='123e4567-e89b-12d3-a456-426614174000';
  const db={
    from(table){
      if(table==='naver_keyword_product_links')return {select(){return this},eq(){return this},async maybeSingle(){return {data:{master_product_id:productId},error:null}}};
      if(table==='product_ad_targets')return {select(){return this},eq(){return this},async maybeSingle(){return {data:{master_product_id:productId},error:null}}};
      if(table==='financial_change_requests')return {select(){return this},eq(){return this},neq(){return this},gte(){return this},in(){return this},async limit(){return {data:[],error:null}}};
      if(table==='naver_keywords')return {update(){return {async eq(){return {error:null}}}}};
      throw new Error(`unexpected table ${table}`);
    }
  };
  const calls=[];
  let keywordReads=0;
  const api={async request(method,uri,query,body){
    calls.push({method,uri,query,body});
    if(method==='GET'&&uri.startsWith('/ncc/keywords/')){
      keywordReads+=1;
      return {status:200,data:{...keyword,bidAmt:keywordReads===1?1000:850}};
    }
    if(method==='GET'&&uri.startsWith('/ncc/adgroups/'))return {status:200,data:{userLock:false}};
    if(method==='PUT')return {status:200,data:{}};
    throw new Error(`unexpected request ${method} ${uri}`);
  }};
  const request={id:'change-1',target_key:keyword.nccKeywordId,approved_at:new Date().toISOString(),impact_preview:{metadata:{product_target:{master_product_id:productId}}}};
  const result=await execution.applyBid({db,request,targetBid:850,expectedBid:1000,api});
  assert.equal(result.observed_bid,850);
  const put=calls.find(call=>call.method==='PUT');
  assert.deepEqual(put,{method:'PUT',uri:`/ncc/keywords/${keyword.nccKeywordId}`,query:{fields:'bidAmt'},body:{nccKeywordId:keyword.nccKeywordId,nccAdgroupId:keyword.nccAdgroupId,bidAmt:850,useGroupBidAmt:false,attr:{}}});
  if(previous===undefined)delete process.env.NAVER_SEARCH_AD_WRITE_ENABLED;else process.env.NAVER_SEARCH_AD_WRITE_ENABLED=previous;
});
