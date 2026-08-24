'use strict';

const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const test=require('node:test');
const history=require('../lib/naver/bid-keyword-history.js');

const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');

test('24-12 builds a newest-first history for one Naver keyword only',()=>{
  const result=history.buildNaverBidKeywordHistory({keywordId:'kw-1',adgroupId:'group-1',runs:[
    {id:'old',platform:'NAVER',ncc_adgroup_id:'group-1',mode:'OBSERVE',status:'OBSERVED',started_at:'2026-08-23T01:00:00Z',finished_at:'2026-08-23T01:01:00Z',details:{actions:[{ncc_keyword_id:'kw-1',keyword:'작두콩차',action:'RAISE',current_bid:100,proposed_bid:110,target_rank:3}] }},
    {id:'new',platform:'NAVER',ncc_adgroup_id:'group-1',mode:'ACTIVE',status:'COMPLETED',started_at:'2026-08-24T01:00:00Z',finished_at:'2026-08-24T01:01:00Z',details:{actions:[{ncc_keyword_id:'kw-1',keyword:'작두콩차',action:'LOWER',current_bid:110,proposed_bid:100,target_rank:3},{ncc_keyword_id:'kw-2',keyword:'다른 키워드',action:'RAISE',current_bid:70,proposed_bid:80}],results:[{ok:true,ncc_keyword_id:'kw-1',request_id:'request-1',proposed_bid:100,verified:true}]}},
    {id:'coupang',platform:'COUPANG',ncc_adgroup_id:'group-1',mode:'ACTIVE',status:'COMPLETED',started_at:'2026-08-24T02:00:00Z',details:{actions:[{ncc_keyword_id:'kw-1',keyword:'섞이면 안 됨',current_bid:1,proposed_bid:2}]}}
  ]});

  assert.equal(result.platform,'NAVER');
  assert.equal(result.status,'READY');
  assert.equal(result.entries.length,2);
  assert.equal(result.entries[0].run_id,'new');
  assert.equal(result.entries[0].status,'VERIFIED');
  assert.equal(result.entries[0].before_bid,110);
  assert.equal(result.entries[0].after_bid,100);
  assert.equal(result.entries[0].delta_bid,-10);
  assert.equal(result.entries[1].status,'OBSERVED');
  assert.equal(result.entries.some(item=>item.keyword==='섞이면 안 됨'),false);
  assert.deepEqual(result.summary,{total:2,applied:1,observed:1,blocked:0,latest_activity_at:'2026-08-24T01:01:00Z'});
});

test('24-12 keeps failed and blocked outcomes visible without claiming an applied change',()=>{
  const result=history.buildNaverBidKeywordHistory({keywordId:'kw-1',adgroupId:'group-1',runs:[
    {id:'failed',ncc_adgroup_id:'group-1',mode:'ACTIVE',status:'PARTIAL',started_at:'2026-08-24T03:00:00Z',error_message:'일부 확인 필요',details:{actions:[{ncc_keyword_id:'kw-1',keyword:'작두콩차',current_bid:100,proposed_bid:120}],results:[{ok:false,ncc_keyword_id:'kw-1',code:'VERIFY_FAILED',error:'재조회 값 불일치'}]}},
    {id:'blocked',ncc_adgroup_id:'group-1',mode:'ACTIVE',status:'COMPLETED',started_at:'2026-08-24T02:00:00Z',details:{blocked:[{ncc_keyword_id:'kw-1',keyword:'작두콩차',code:'STALE_DATA',reason:'자료가 오래되었습니다.'}]}}
  ]});

  assert.equal(result.entries[0].status,'FAILED');
  assert.equal(result.entries[0].verified,false);
  assert.match(result.entries[0].reason,/재조회 값 불일치/);
  assert.equal(result.entries[1].status,'BLOCKED');
  assert.equal(result.entries[1].after_bid,null);
  assert.equal(result.summary.applied,0);
  assert.equal(result.summary.blocked,2);
});

test('24-12 returns an honest no-data state for a keyword with no run history',()=>{
  const result=history.buildNaverBidKeywordHistory({keywordId:'kw-empty',adgroupId:'group-1',runs:[]});
  assert.equal(result.status,'NO_DATA');
  assert.equal(result.entries.length,0);
  assert.equal(result.summary.latest_activity_at,null);
});

test('24-12 preserves missing bid values as unknown instead of turning them into zero',()=>{
  const result=history.buildNaverBidKeywordHistory({keywordId:'kw-1',adgroupId:'group-1',runs:[
    {id:'missing-bid',platform:'NAVER',ncc_adgroup_id:'group-1',mode:'OBSERVE',status:'OBSERVED',started_at:'2026-08-24T04:00:00Z',details:{actions:[{ncc_keyword_id:'kw-1',keyword:'작두콩차',current_bid:null,proposed_bid:undefined}]}}
  ]});

  assert.equal(result.entries[0].before_bid,null);
  assert.equal(result.entries[0].after_bid,null);
  assert.equal(result.entries[0].delta_bid,null);
});

test('24-12 exposes an owner-only keyword history API and mounts the log only for Naver details',()=>{
  const route=read('app/api/naver/bid-schedules/route.js');
  const table=read('app/_analysis/keyword-operations-table.js');
  const panel=read('app/_analysis/keyword-bid-history-panel.js');
  assert.match(route,/historyRequested/);
  assert.match(route,/listNaverBidRuns/);
  assert.match(route,/buildNaverBidKeywordHistory/);
  assert.match(route,/ncc_keyword_id/);
  assert.match(table,/KeywordBidHistoryPanel/);
  assert.match(table,/detail\.platform==='NAVER'/);
  assert.match(panel,/\/api\/naver\/bid-schedules\?history=1/);
  assert.match(panel,/자동입찰 기록/);
  assert.match(panel,/아직 자동입찰 실행 기록이 없어요/);
  assert.doesNotMatch(panel,/COUPANG|쿠팡/);
});
