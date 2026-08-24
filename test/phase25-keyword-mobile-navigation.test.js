'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const contract=require('../lib/marketing/keyword-workbench-contract.js');

test('25-8 follows an opened keyword detail on compact screens without moving desktop users',()=>{
  assert.deepEqual(
    contract.keywordDetailOpenPlan({detailId:'NAVER:keyword-1',viewportWidth:390}),
    {active:true,followDetail:true,focusTarget:'DETAIL_CLOSE'}
  );
  assert.deepEqual(
    contract.keywordDetailOpenPlan({detailId:'NAVER:keyword-1',viewportWidth:430}),
    {active:true,followDetail:true,focusTarget:'DETAIL_CLOSE'}
  );
  assert.deepEqual(
    contract.keywordDetailOpenPlan({detailId:'NAVER:keyword-1',viewportWidth:1280}),
    {active:true,followDetail:false,focusTarget:'ROW'}
  );
});

test('25-8 closes keyword detail with Escape and restores the originating row focus',()=>{
  assert.deepEqual(
    contract.keywordDetailKeyPlan({detailId:'NAVER:keyword-1',key:'Escape',overlayOpen:false}),
    {action:'CLOSE',restoreRowId:'NAVER:keyword-1'}
  );
  assert.deepEqual(
    contract.keywordDetailKeyPlan({detailId:'NAVER:keyword-1',key:'Escape',overlayOpen:true}),
    {action:'NONE',restoreRowId:''}
  );
  assert.deepEqual(
    contract.keywordDetailKeyPlan({detailId:'',key:'Escape',overlayOpen:false}),
    {action:'NONE',restoreRowId:''}
  );
});
