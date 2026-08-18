'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const loaders=require('../lib/dashboard/page-loader-profiles.js');

const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');

test('23-2 gives orders and Rocket Growth inventory independent table profiles',()=>{
  const orders=loaders.profileForState({view:'orders',workspace:null,platform:'all'});
  const inventory=loaders.profileForState({view:'inventory',workspace:null,platform:'coupang'});
  assert.ok(orders.tables.includes('cafe24_orders'));
  assert.ok(orders.tables.includes('naver_commerce_orders'));
  assert.ok(orders.tables.includes('coupang_orders'));
  assert.equal(inventory.tables.includes('coupang_rg_inventory'),true);
  assert.equal(inventory.tables.includes('cafe24_products'),false);
  assert.equal(inventory.tables.includes('naver_commerce_orders'),false);
  assert.equal(inventory.target_ms,2500);
});

test('23-2 never mixes Naver and Coupang keyword provider queries',()=>{
  const naver=loaders.profileForState({view:'keyword',workspace:'registered',platform:'naver'});
  const coupang=loaders.profileForState({view:'keyword',workspace:'registered',platform:'coupang'});
  assert.ok(naver.tables.includes('naver_keywords'));
  assert.equal(naver.tables.some(table=>table.startsWith('coupang_')),false);
  assert.ok(coupang.tables.includes('coupang_ad_keyword_summary'));
  assert.equal(coupang.tables.some(table=>table.startsWith('naver_')),false);
  assert.equal(naver.target_ms,4000);
});

test('23-2 scopes insight and product workspaces to the data they render',()=>{
  const overview=loaders.profileForState({view:'insight',workspace:'overview',platform:'all'});
  const profit=loaders.profileForState({view:'insight',workspace:'profitability',platform:'all'});
  const costs=loaders.profileForState({view:'product',workspace:'costs',platform:'all'});
  assert.deepEqual(overview.tables,['reports','platform_events','alerts','ai_analysis_results']);
  assert.ok(profit.tables.includes('product_costs'));
  assert.ok(profit.tables.includes('coupang_settlements'));
  assert.ok(costs.tables.includes('product_costs'));
  assert.equal(costs.tables.includes('coupang_orders'),false);
});

test('23-2 records real, skipped and target loader telemetry',()=>{
  const session=loaders.createLoaderSession({view:'inventory',platform:'coupang'});
  session.mark('coupang_rg_inventory',true);
  session.mark('cafe24_orders',false);
  const snapshot=session.snapshot();
  assert.equal(snapshot.profile,'inventory:default:coupang');
  assert.equal(snapshot.remote_query_count,1);
  assert.deepEqual(snapshot.remote_tables,['coupang_rg_inventory']);
  assert.equal(snapshot.skipped_query_count,1);
  assert.equal(snapshot.within_target,true);
});

test('23-2 dashboard uses the focused profile and exposes loader timing',()=>{
  const page=read('app/page.js');
  const dashboard=read('app/dashboard-client.js');
  assert.match(page,/pageLoaderProfilesModule\.createLoaderSession/);
  assert.match(page,/loaderPerformance:loaderSession\.snapshot\(\)/);
  assert.match(page,/databaseForLoaderState\(db, view, workspace, platform='all', loaderSession=null\)/);
  assert.match(dashboard,/data-loader-profile=\{initialData\.loaderPerformance\?\.profile/);
  assert.match(dashboard,/data-loader-ms=\{initialData\.loaderPerformance\?\.duration_ms/);
});
