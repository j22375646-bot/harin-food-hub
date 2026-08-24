'use strict';

const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const test=require('node:test');
const trend=require('../lib/naver/bid-keyword-trend-view.js');

const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');

test('24-13 selects the requested recent window and summarizes real Naver rank and bid movement',()=>{
  const analysis={
    scope:{platform:'NAVER',keyword_id:'kw-1',keyword:'작두콩차',current_bid:1200},
    rank:{target:2},
    windows:{'3':{average_rank:2.4,available_days:3}},
    daily:[
      {date:'2026-08-18',average_rank:6,bid:700},{date:'2026-08-19',average_rank:5,bid:800},
      {date:'2026-08-20',average_rank:4.5,bid:850},{date:'2026-08-21',average_rank:4,bid:900},
      {date:'2026-08-22',average_rank:4,bid:1000},{date:'2026-08-23',average_rank:3,bid:1100},
      {date:'2026-08-24',average_rank:2,bid:1200}
    ]
  };

  const view=trend.buildBidKeywordTrendView({analysis,days:3});
  assert.equal(view.platform,'NAVER');
  assert.equal(view.status,'READY');
  assert.deepEqual(view.daily.map(item=>item.date),['2026-08-22','2026-08-23','2026-08-24']);
  assert.equal(view.summary.average_rank,2.4);
  assert.equal(view.summary.latest_rank,2);
  assert.equal(view.summary.rank_improvement,2);
  assert.equal(view.summary.latest_bid,1200);
  assert.equal(view.summary.bid_change,200);
  assert.equal(view.summary.target_rank,2);
});

test('24-13 keeps missing rank and bid evidence unknown instead of turning it into zero',()=>{
  const view=trend.buildBidKeywordTrendView({analysis:{scope:{platform:'NAVER',keyword_id:'kw-empty'},rank:{target:null},windows:{'7':{average_rank:null,available_days:0}},daily:[
    {date:'2026-08-23',average_rank:null,bid:null},{date:'2026-08-24',average_rank:null,bid:null}
  ]},days:7});

  assert.equal(view.status,'NO_DATA');
  assert.equal(view.summary.average_rank,null);
  assert.equal(view.summary.latest_rank,null);
  assert.equal(view.summary.rank_improvement,null);
  assert.equal(view.summary.latest_bid,null);
  assert.equal(view.summary.bid_change,null);
});

test('24-13 does not claim an unchanged bid when every day only repeats the current fallback value',()=>{
  const view=trend.buildBidKeywordTrendView({analysis:{scope:{platform:'NAVER',keyword_id:'kw-1',current_bid:1200},rank:{target:null},windows:{'3':{average_rank:null,available_days:0}},daily:[
    {date:'2026-08-22',average_rank:null,bid:1200},{date:'2026-08-23',average_rank:null,bid:1200},{date:'2026-08-24',average_rank:null,bid:1200}
  ]},days:3});

  assert.equal(view.status,'PARTIAL');
  assert.equal(view.summary.latest_bid,1200);
  assert.equal(view.summary.bid_change,null);
});

test('24-13 refuses a non-Naver analysis and never builds its request',()=>{
  const view=trend.buildBidKeywordTrendView({analysis:{scope:{platform:'COUPANG'},daily:[{date:'2026-08-24',average_rank:1,bid:10}]},days:7});
  assert.equal(view.status,'PLATFORM_MISMATCH');
  assert.deepEqual(view.daily,[]);
  assert.equal(trend.buildBidKeywordTrendRequest({open:true,platform:'COUPANG',keywordId:'kw-1'}),null);
});

test('24-13 only creates the Naver performance request after the owner opens the inline trend',()=>{
  assert.equal(trend.buildBidKeywordTrendRequest({open:false,platform:'NAVER',keywordId:'kw-1'}),null);
  assert.equal(trend.buildBidKeywordTrendRequest({open:true,platform:'NAVER',keywordId:''}),null);
  assert.equal(trend.buildBidKeywordTrendRequest({open:true,platform:'NAVER',keywordId:'kw 1'}),'/api/naver/bid-performance-analysis?keywordId=kw%201');

  const table=read('app/_analysis/keyword-operations-table.js');
  const panel=read('app/_analysis/keyword-bid-inline-trend.js');
  assert.match(table,/KeywordBidInlineTrend/);
  assert.match(table,/detail\.platform==='NAVER'/);
  assert.match(panel,/RANGES=\[1,3,7\]/);
  assert.match(panel,/\{days\}일/);
  assert.match(panel,/RankBidChart/);
  assert.doesNotMatch(panel,/COUPANG|쿠팡/);
});
