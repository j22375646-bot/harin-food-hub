'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const operations=require('../lib/marketing/keyword-operations.js');

const rows=[
  {
    id:'NAVER:ready',platform:'NAVER',source:'REGISTERED',keyword:'작두콩차',adCategoryState:'ACTIVE',
    canDraft:true,currentBid:1000,recommendedBid:800,minimumBid:70,maximumBid:1200,cost:5000,orders:2,roas:800
  },
  {
    id:'NAVER:manual-lower',platform:'NAVER',source:'REGISTERED',keyword:'작두콩차티백',adCategoryState:'ACTIVE',
    canDraft:true,manualDecreaseOnly:true,currentBid:700,recommendedBid:null,minimumBid:70,maximumBid:700,cost:3000,orders:0,roas:500
  },
  {
    id:'NAVER:inactive',platform:'NAVER',source:'REGISTERED',keyword:'중지키워드',adCategoryState:'INACTIVE',
    canDraft:false,currentBid:500,recommendedBid:400,minimumBid:70,maximumBid:500,cost:2000,orders:0,roas:200
  },
  {
    id:'COUPANG:manual',platform:'COUPANG',source:'REGISTERED',keyword:'쿠팡작두콩',adCategoryState:'ACTIVE',
    canDraft:true,currentBid:900,recommendedBid:700,minimumBid:70,maximumBid:1200,cost:9000,orders:0,roas:100
  }
];

test('25-3 selects only changeable Naver rows that match the requested condition',()=>{
  assert.deepEqual(
    operations.selectKeywordRowsByCondition(rows,{condition:'CHANGEABLE'}).map(item=>item.id),
    ['NAVER:ready','NAVER:manual-lower']
  );
  assert.deepEqual(
    operations.selectKeywordRowsByCondition(rows,{condition:'RECOMMENDED'}).map(item=>item.id),
    ['NAVER:ready']
  );
  assert.deepEqual(
    operations.selectKeywordRowsByCondition(rows,{condition:'NO_ORDER_COST'}).map(item=>item.id),
    ['NAVER:manual-lower']
  );
  assert.deepEqual(
    operations.selectKeywordRowsByCondition(rows,{condition:'LOW_ROAS'}).map(item=>item.id),
    ['NAVER:manual-lower']
  );
  assert.deepEqual(operations.selectKeywordRowsByCondition(rows,{condition:'UNKNOWN'}),[]);
});

test('25-3 plans percentage decreases from the current draft while keeping 10 won units',()=>{
  const result=operations.planKeywordBulkDrafts(rows,{'NAVER:ready':930},{mode:'PERCENT',value:-15});

  assert.deepEqual(result.drafts,{'NAVER:ready':790,'NAVER:manual-lower':600});
  assert.deepEqual(result.appliedIds,['NAVER:ready','NAVER:manual-lower']);
  assert.deepEqual(result.skippedIds,['NAVER:inactive','COUPANG:manual']);
  assert.deepEqual(result.clampedIds,[]);
});

test('25-3 blocks unsafe increases but still applies them to rows whose server ceiling allows it',()=>{
  const result=operations.planKeywordBulkDrafts(rows,{}, {mode:'AMOUNT',value:200});

  assert.deepEqual(result.drafts,{'NAVER:ready':1200});
  assert.deepEqual(result.appliedIds,['NAVER:ready']);
  assert.deepEqual(result.skippedIds,['NAVER:manual-lower','NAVER:inactive','COUPANG:manual']);
});

test('25-3 supports target and recommended prices with explicit clamp reporting',()=>{
  const target=operations.planKeywordBulkDrafts(rows,{}, {mode:'TARGET',value:1264});
  assert.deepEqual(target.drafts,{'NAVER:ready':1200});
  assert.deepEqual(target.clampedIds,['NAVER:ready']);
  assert.equal(target.skippedIds.includes('NAVER:manual-lower'),true);

  const recommended=operations.planKeywordBulkDrafts(rows,{}, {mode:'RECOMMENDED'});
  assert.deepEqual(recommended.drafts,{'NAVER:ready':800});
  assert.deepEqual(recommended.appliedIds,['NAVER:ready']);
});

test('25-3 ignores an invalid mode or value instead of creating zero won drafts',()=>{
  assert.deepEqual(operations.planKeywordBulkDrafts(rows,{}, {mode:'PERCENT',value:''}).drafts,{});
  assert.deepEqual(operations.planKeywordBulkDrafts(rows,{}, {mode:'OTHER',value:10}).drafts,{});
});
