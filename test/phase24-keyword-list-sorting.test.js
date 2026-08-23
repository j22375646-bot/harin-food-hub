'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const operations=require('../lib/marketing/keyword-operations.js');

const row=(id,keyword,values={})=>({
  id,keyword,platform:'NAVER',campaign:'테스트 캠페인',product:'테스트 상품',
  currentBid:null,recommendedBid:null,clicks:0,cost:0,orders:0,roas:null,
  ...values
});

test('24-7 sorts every operational number high-to-low and low-to-high',()=>{
  const rows=[
    row('a','가 키워드',{currentBid:300,recommendedBid:330,clicks:20,cost:9000,orders:2,roas:450}),
    row('b','나 키워드',{currentBid:100,recommendedBid:120,clicks:5,cost:1200,orders:0,roas:120}),
    row('c','다 키워드',{currentBid:500,recommendedBid:470,clicks:40,cost:15000,orders:4,roas:820})
  ];

  assert.deepEqual(operations.filterKeywordRows(rows,{sort:'COST_DESC'}).map(item=>item.id),['c','a','b']);
  assert.deepEqual(operations.filterKeywordRows(rows,{sort:'COST_ASC'}).map(item=>item.id),['b','a','c']);
  assert.deepEqual(operations.filterKeywordRows(rows,{sort:'CURRENT_BID_DESC'}).map(item=>item.id),['c','a','b']);
  assert.deepEqual(operations.filterKeywordRows(rows,{sort:'CURRENT_BID_ASC'}).map(item=>item.id),['b','a','c']);
  assert.deepEqual(operations.filterKeywordRows(rows,{sort:'RECOMMENDED_BID_DESC'}).map(item=>item.id),['c','a','b']);
  assert.deepEqual(operations.filterKeywordRows(rows,{sort:'CLICKS_ASC'}).map(item=>item.id),['b','a','c']);
  assert.deepEqual(operations.filterKeywordRows(rows,{sort:'ORDERS_DESC'}).map(item=>item.id),['c','a','b']);
  assert.deepEqual(operations.filterKeywordRows(rows,{sort:'ROAS_ASC'}).map(item=>item.id),['b','a','c']);
  assert.deepEqual(operations.filterKeywordRows(rows,{sort:'KEYWORD_DESC'}).map(item=>item.id),['c','b','a']);
});

test('24-7 keeps unavailable bid and ROAS values last without converting them to zero',()=>{
  const rows=[
    row('missing','확인 필요'),
    row('zero','실제 0',{currentBid:0,recommendedBid:0,roas:0}),
    row('known','값 있음',{currentBid:200,recommendedBid:180,roas:300})
  ];

  assert.deepEqual(operations.filterKeywordRows(rows,{sort:'CURRENT_BID_ASC'}).map(item=>item.id),['zero','known','missing']);
  assert.deepEqual(operations.filterKeywordRows(rows,{sort:'CURRENT_BID_DESC'}).map(item=>item.id),['known','zero','missing']);
  assert.deepEqual(operations.filterKeywordRows(rows,{sort:'RECOMMENDED_BID_ASC'}).map(item=>item.id),['zero','known','missing']);
  assert.deepEqual(operations.filterKeywordRows(rows,{sort:'ROAS_DESC'}).map(item=>item.id),['known','zero','missing']);
});

test('24-7 toggles sortable headers predictably and stabilizes tied rows',()=>{
  assert.equal(operations.nextKeywordSort('COST_DESC','COST'),'COST_ASC');
  assert.equal(operations.nextKeywordSort('COST_ASC','COST'),'COST_DESC');
  assert.equal(operations.nextKeywordSort('ROAS_DESC','ORDERS'),'ORDERS_DESC');
  assert.equal(operations.nextKeywordSort('COST_DESC','KEYWORD'),'KEYWORD_ASC');
  assert.equal(operations.nextKeywordSort('KEYWORD_ASC','KEYWORD'),'KEYWORD_DESC');

  const tied=[row('b','같은 이름',{cost:100}),row('a','같은 이름',{cost:100})];
  assert.deepEqual(operations.filterKeywordRows(tied,{sort:'COST_DESC'}).map(item=>item.id),['a','b']);
});

test('24-7 exposes explicit sort controls while preserving separate platform preferences',()=>{
  const component=fs.readFileSync('app/_analysis/keyword-operations-table.js','utf8');
  const operationsSource=fs.readFileSync('lib/marketing/keyword-operations.js','utf8');
  assert.match(component,/keyword-operations-view-\$\{platform\}/);
  assert.match(component,/keywordOpsSortButton/);
  assert.match(component,/aria-sort/);
  assert.match(operationsSource,/광고비 낮은 순/);
  assert.match(operationsSource,/현재 입찰가 높은 순/);
  assert.match(operationsSource,/주문 적은 순/);
});
