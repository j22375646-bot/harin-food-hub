'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const operations=require('../lib/marketing/keyword-operations.js');

test('24-8 normalizes saved views without admitting Naver-only controls into Coupang',()=>{
  assert.deepEqual(
    operations.normalizeKeywordView('naver',{quickFilter:'READY',sort:'CURRENT_BID_ASC',pageSize:24}),
    {quickFilter:'READY',sort:'CURRENT_BID_ASC',pageSize:24}
  );
  assert.deepEqual(
    operations.normalizeKeywordView('coupang',{quickFilter:'READY',sort:'CURRENT_BID_ASC',pageSize:24}),
    {quickFilter:'ALL',sort:'COST_DESC',pageSize:24}
  );
  assert.deepEqual(
    operations.normalizeKeywordView('naver',{quickFilter:'UNKNOWN',sort:'UNKNOWN',pageSize:500}),
    operations.DEFAULT_KEYWORD_VIEW
  );
});

test('24-8 describes the active operational view and keeps unavailable data out of the count',()=>{
  assert.deepEqual(
    operations.describeKeywordView({
      platform:'naver',query:'작두콩',quickFilter:'READY',sort:'CURRENT_BID_DESC',pageSize:24,
      campaignName:'스마트스토어',adgroupName:'001.작두콩',filteredCount:22
    }),
    {
      activeCount:6,
      filteredCount:22,
      headline:'22개 키워드를 보는 중',
      description:'검색: 작두콩 · 변경 가능한 키워드 · 현재 입찰가 높은 순 · 24개씩 · 스마트스토어 · 001.작두콩'
    }
  );
  assert.deepEqual(
    operations.describeKeywordView({platform:'coupang',filteredCount:null}),
    {activeCount:0,filteredCount:null,headline:'키워드 수 확인 필요',description:'기본 보기'}
  );
});

test('24-8 preserves uncollected Naver bid values as unavailable instead of zero won',()=>{
  const [row]=operations.naverRegisteredRows({candidates:[{
    ncc_keyword_id:'kw-null',keyword:'미수집 입찰가',current_bid:null,recommended_bid:null,
    metrics:{clicks:null,cost:null,conversions:null,roas:null}
  }]});

  assert.equal(row.currentBid,null);
  assert.equal(row.recommendedBid,null);
  assert.equal(row.roas,null);
});

test('24-8 ships one-tap view reset, keyboard row details, mobile polish, and reduced motion',()=>{
  const component=fs.readFileSync('app/_analysis/keyword-operations-table.js','utf8');
  const css=fs.readFileSync('app/_analysis/harin-analysis-v8.css','utf8');

  assert.match(component,/keywordOpsViewState/);
  assert.match(component,/현재 보기 초기화/);
  assert.match(component,/aria-live="polite"/);
  assert.match(component,/event\.key==='Enter'\|\|event\.key===' '/);
  assert.match(component,/normalizeKeywordView/);
  assert.match(css,/\.keywordOpsViewState/);
  assert.match(css,/@media\(prefers-reduced-motion:reduce\)/);
  assert.match(css,/@media\(max-width:430px\)/);
});
