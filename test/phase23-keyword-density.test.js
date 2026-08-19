'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const operations=require('../lib/marketing/keyword-operations.js');

const read=file=>fs.readFileSync(file,'utf8');

test('23-4B keeps keyword pages below the high-density input threshold',()=>{
  const rows=Array.from({length:100},(_,index)=>({id:`keyword-${index}`}));
  assert.deepEqual(operations.KEYWORD_PAGE_SIZES,[12,24,36]);
  assert.equal(operations.paginateKeywordRows(rows,1).items.length,12);
  assert.equal(operations.paginateKeywordRows(rows,1,100).pageSize,12);
  assert.equal(operations.paginateKeywordRows(rows,1,36).items.length,36);
});

test('23-4B edits one selected Naver bid instead of rendering an input per table row',()=>{
  const component=read('app/_analysis/keyword-operations-table.js');
  assert.match(component,/keyword-operations-view-\$\{platform\}/);
  assert.match(component,/className="keywordOpsDetailBid"/);
  assert.match(component,/setDetailDraft\(detail,event\.target\.value\)/);
  assert.match(component,/선택해 입력/);
  assert.doesNotMatch(component,/className="keywordOpsDraft"[^\n]*<input/);
});

test('23-4B paginates the Coupang WING editor while exporting the complete selection',()=>{
  const component=read('app/_analysis/keyword-operations-table.js');
  const css=read('app/_analysis/harin-analysis-v8.css');
  assert.match(component,/wingPagination\.items\.map/);
  assert.match(component,/전체 작업표 복사/);
  assert.match(component,/전체 CSV 내려받기/);
  assert.match(css,/\.keywordOpsWingPager/);
  assert.match(css,/\.keywordOpsDetailBid input/);
});
