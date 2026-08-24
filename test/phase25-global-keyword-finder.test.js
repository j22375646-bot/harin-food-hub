'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const operations=require('../lib/marketing/keyword-operations.js');

const rows=[
  {
    id:'NAVER:exact',platform:'NAVER',keyword:'작두콩차',campaignId:'cmp-2',campaignName:'건강차 캠페인',
    adgroupId:'grp-2',adgroupName:'티백 광고그룹',product:'작두콩차 30티백',adCategoryState:'ACTIVE',cost:2000
  },
  {
    id:'NAVER:campaign',platform:'NAVER',keyword:'국산차',campaignId:'cmp-1',campaignName:'작두콩 여름 캠페인',
    adgroupId:'grp-1',adgroupName:'모바일',product:'국산차 티백',adCategoryState:'ACTIVE',cost:5000
  },
  {
    id:'NAVER:inactive',platform:'NAVER',keyword:'작두콩차 선물',campaignId:'cmp-3',campaignName:'중지 캠페인',
    adgroupId:'grp-3',adgroupName:'선물세트',product:'작두콩차 선물',adCategoryState:'INACTIVE',cost:9000
  },
  {
    id:'COUPANG:same',platform:'COUPANG',keyword:'작두콩차',campaign:'쿠팡 작두콩',product:'로켓그로스 작두콩차',cost:8000
  }
];

test('25-2 searches the full platform dataset instead of only the selected campaign scope',()=>{
  const scopedRows=rows.filter(item=>item.campaignId==='cmp-1');
  assert.equal(scopedRows.some(item=>item.id==='NAVER:exact'),false);

  const results=operations.findGlobalKeywordRows(rows,{query:'작두콩',platform:'naver'});

  assert.deepEqual(results.map(item=>item.id),['NAVER:exact','NAVER:inactive','NAVER:campaign']);
  assert.equal(results.some(item=>item.platform==='COUPANG'),false);
});

test('25-2 searches campaign adgroup and product labels while ranking an exact keyword first',()=>{
  assert.deepEqual(
    operations.findGlobalKeywordRows(rows,{query:'여름',platform:'naver'}).map(item=>item.id),
    ['NAVER:campaign']
  );
  assert.deepEqual(
    operations.findGlobalKeywordRows(rows,{query:'모바일',platform:'naver'}).map(item=>item.id),
    ['NAVER:campaign']
  );
  assert.equal(operations.findGlobalKeywordRows(rows,{query:'작두콩차',platform:'naver'})[0].id,'NAVER:exact');
});

test('25-2 builds a deterministic scope page and detail jump without crossing platforms',()=>{
  assert.deepEqual(
    operations.globalKeywordJump(rows[0],{platform:'naver'}),
    {
      id:'NAVER:exact',query:'작두콩차',campaignId:'cmp-2',adgroupId:'grp-2',
      page:1,quickFilter:'ALL',platform:'NAVER'
    }
  );
  assert.equal(operations.globalKeywordJump(rows[3],{platform:'naver'}),null);
  assert.deepEqual(
    operations.globalKeywordJump(rows[3],{platform:'coupang'}),
    {
      id:'COUPANG:same',query:'작두콩차',campaignId:'ALL',adgroupId:'ALL',
      page:1,quickFilter:'ALL',platform:'COUPANG'
    }
  );
});

test('25-2 does not open a noisy result menu for an empty query and enforces the result limit',()=>{
  assert.deepEqual(operations.findGlobalKeywordRows(rows,{query:' ',platform:'naver'}),[]);
  assert.equal(operations.findGlobalKeywordRows(rows,{query:'작두콩',platform:'naver',limit:1}).length,1);
});
