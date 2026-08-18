'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const selection=require('../lib/ui/bulk-selection.js');

test('22-2 selects the visible page without losing earlier selections',()=>{
  const selected=selection.toggleSelectionScope(['outside'],['page-1','page-2'],true);
  assert.deepEqual(selected,['outside','page-1','page-2']);
  assert.deepEqual(selection.selectionState(selected,['page-1','page-2']),{checked:true,mixed:false,selectedCount:2,totalCount:2});
});

test('22-2 selects and clears the complete filtered result',()=>{
  const selected=selection.toggleSelectionScope([],['a','b','c'],true);
  assert.deepEqual(selection.selectionState(selected,['a','b','c']),{checked:true,mixed:false,selectedCount:3,totalCount:3});
  assert.deepEqual(selection.toggleSelectionScope(selected,['a','b','c'],false),[]);
});

test('22-2 prunes selections that disappeared after live data refresh',()=>{
  assert.deepEqual(selection.reconcileSelection(['kept','deleted','kept'],['kept','new']),['kept']);
  assert.deepEqual(selection.selectionState(['kept'],['kept','new']),{checked:false,mixed:true,selectedCount:1,totalCount:2});
});

test('22-2 exposes one reusable accessible bulk bar and connects the keyword reference screen',()=>{
  const component=fs.readFileSync('app/_design-system/harin-bulk-selection.js','utf8');
  const keyword=fs.readFileSync('app/_analysis/keyword-operations-table.js','utf8');
  const css=fs.readFileSync('app/_design-system/harin-bulk-selection.css','utf8');
  assert.match(component,/export function useHarinBulkSelection/);
  assert.match(component,/aria-checked=\{mixed\?'mixed'/);
  assert.match(component,/검색 결과 \$\{filteredCount\}개 선택/);
  assert.match(keyword,/HarinBulkSelectionBar/);
  assert.match(keyword,/onToggleFiltered=\{checked=>selection\.toggleScope\(filteredIds,checked\)\}/);
  assert.match(css,/\.v8BulkSelectionBar\.active/);
  assert.match(css,/@media\(max-width:700px\)/);
});
