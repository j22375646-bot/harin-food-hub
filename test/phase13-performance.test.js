'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {HUB_NAV}=require('../lib/navigation/hub-routes.js');

const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');

test('13-1 canonical menu addresses are real App Router pages',()=>{
  for(const item of HUB_NAV.filter(entry=>entry.href!=='/')){
    const page=path.join(root,'app',item.href.slice(1),'page.js');
    assert.equal(fs.existsSync(page),true,`${item.href} page is missing`);
    assert.match(fs.readFileSync(page,'utf8'),new RegExp(`renderDashboardRoute\\('${item.id}'`));
  }
  assert.match(read('app/page.js'),/export async function renderDashboardRoute/);
  assert.doesNotMatch(read('next.config.js'),/async rewrites\s*\(/);
});

test('13-1 limits heavy route payloads and long client lists',()=>{
  const server=read('app/page.js');
  assert.match(server,/rowLimit\('orders',10000\)/);
  assert.match(server,/rowLimit\('items',10000\)/);
  assert.match(server,/needsPacing/);
  assert.match(read('app/unified-product-operations-center.js'),/filtered\.slice\(0,visibleCount\)/);
  assert.match(read('app/unified-inventory-operations-center.js'),/filtered\.slice\(0,visibleCount\)/);
  assert.match(read('app/dashboard-client.js'),/open\?<CatalogCards items=\{items\}\/\>:null/);
  assert.match(read('app/dashboard-client.js'),/items\.slice\(0,visibleCount\)/);
});

test('13-1 isolates route errors and disables live test APIs in production',()=>{
  for(const file of ['app/loading.js','app/error.js','app/global-error.js','app/not-found.js']){
    assert.equal(fs.existsSync(path.join(root,file)),true,`${file} is missing`);
  }
  assert.match(read('app/api/epost/test-issue/route.js'),/NODE_ENV === 'production'/);
  assert.match(read('app/api/cafe24/test/route.js'),/NODE_ENV === 'production'/);
});
