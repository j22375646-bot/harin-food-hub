'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.join(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');

test('13-6 insight, keyword, and product workspaces are real route pages',()=>{
  for(const file of ['app/insights/[workspace]/page.js','app/keywords/[workspace]/page.js','app/products/[workspace]/page.js']){
    const source=read(file);
    assert.match(source,/HUB_WORKSPACES/);
    assert.match(source,/notFound\(\)/);
    assert.match(source,/renderDashboardRoute/);
  }
});

test('13-6 dashboard renders only the selected focused workspace',()=>{
  const client=read('app/dashboard-client.js');
  assert.match(client,/function FocusedWorkspaceNav/);
  assert.match(client,/workspace==='overview'/);
  assert.match(client,/workspace==='search-terms'/);
  assert.match(client,/function KeywordView\(\{naver,workspace='search-terms'\}\)/);
  assert.match(client,/workspace==='diagnosis'/);
  for(const workspace of ['catalog','mappings','costs','profit','offers','ad-targets'])assert.match(client,new RegExp(`workspace==='${workspace}'`));
  assert.match(client,/14-1 · V8 디자인 기반/);
});

test('13-6 product editing remains sellable-only and cross-workspace actions use routes',()=>{
  const client=read('app/dashboard-client.js');
  const operations=read('app/unified-product-operations-center.js');
  assert.match(client,/source\?\.is_sellable===true/);
  assert.match(client,/masterProducts=\{sellableMasterProducts\}/);
  assert.match(client,/masterProducts=\{sellableMasterProducts\} productCosts=\{sellableCosts\}/);
  assert.match(client,/router\.push\('\/products\/mappings'\)/);
  assert.match(operations,/href="\/products\/mappings"/);
});

test('13-6 focused navigation is large, responsive, and horizontally scrollable on mobile',()=>{
  const css=read('app/globals.css');
  assert.match(css,/Phase 13-6: focused routes/);
  assert.match(css,/\.focusedWorkspaceNav>a\{[^}]*min-height:82px/);
  assert.match(css,/@media\(max-width:850px\)\{\.focusedWorkspaceNav/);
  assert.match(css,/overflow-x:auto/);
  assert.match(css,/content-visibility:auto/);
});
