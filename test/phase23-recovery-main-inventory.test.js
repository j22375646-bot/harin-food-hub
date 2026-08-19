'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const inventory=require('../lib/coupang/operational-inventory.js');
const loaders=require('../lib/dashboard/page-loader-profiles.js');

const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');

test('23-R1 keeps only recently selling active Rocket Growth SKUs',()=>{
  const rows=[
    {vendor_item_id:'ACTIVE',sales_last_30_days:92,total_orderable_quantity:103,stock_status:'HEALTHY',productItem:{status:'APPROVED',item_name:'작두콩차'}},
    {vendor_item_id:'OLD',sales_last_30_days:0,total_orderable_quantity:0,stock_status:'OUT_OF_STOCK',productItem:{status:'APPROVED',item_name:'과거 상품'}},
    {vendor_item_id:'STOP',sales_last_30_days:12,total_orderable_quantity:4,stock_status:'LOW',productItem:{status:'SUSPENDED',item_name:'판매중지 상품'}},
    {vendor_item_id:'SOLDOUT',sales_last_30_days:8,total_orderable_quantity:0,stock_status:'OUT_OF_STOCK',productItem:{status:'APPROVED',item_name:'최근 판매 품절'}}
  ];
  const result=inventory.splitOperationalInventory(rows);
  assert.deepEqual(result.active.map(item=>item.vendor_item_id),['ACTIVE']);
  assert.equal(result.excluded.find(item=>item.vendor_item_id==='OLD').operational_exclusion_reason,'NO_RECENT_SALES');
  assert.equal(result.excluded.find(item=>item.vendor_item_id==='STOP').operational_exclusion_reason,'INACTIVE_PRODUCT');
  assert.equal(result.excluded.find(item=>item.vendor_item_id==='SOLDOUT').operational_exclusion_reason,'NO_ORDERABLE_STOCK');
  const center=inventory.buildOperationalInventoryCenter(result.active);
  assert.equal(center.summary.products,1);
  assert.equal(center.summary.action_required,0);
});

test('23-R1 gives Main a bounded dedicated loader instead of the generic dashboard profile',()=>{
  const profile=loaders.profileForState({view:'main',workspace:'default',platform:'all'});
  assert.equal(profile.target_ms,2500);
  assert.deepEqual(profile.tables,[
    'cafe24_orders','cafe24_order_items','naver_commerce_orders','naver_commerce_order_items',
    'coupang_orders','coupang_order_items','coupang_rg_orders','coupang_returns',
    'coupang_rg_inventory','business_targets','customer_service_items'
  ]);
  const page=read('app/page.js');
  assert.match(page,/focusedEarlyReturn=view==='main'/);
  assert.match(page,/if\(view==='main'\)\{[\s\S]*?return buildMainDashboardData/);
  assert.match(page,/view==='collection'\?SHELL_TABLES:LIGHT_SHELL_TABLES/);
  const mainScope=page.match(/const MAIN_OVERVIEW_TABLES = \[([\s\S]*?)\n\];/)?.[1]||'';
  assert.match(mainScope,/cafe24_order_items|naver_commerce_order_items|coupang_order_items|coupang_returns/);
  assert.doesNotMatch(mainScope,/reports|actions|naver_stats_daily|coupang_ad_daily_summary|product_costs/);
});

test('23-R1 applies one Rocket Growth policy to focused inventory and the legacy fallback path',()=>{
  const page=read('app/page.js');
  assert.match(page,/buildInventoryDashboardData[\s\S]*?splitOperationalInventory\(inventoryBase\)/);
  assert.match(page,/splitOperationalInventory\(coupangInventoryBase\)/);
  assert.match(page,/rgInventoryExcludedCount/);
  assert.match(page,/buildOperationalInventoryCenter\(rgInventory\)/);
  assert.match(page,/gt\('total_orderable_quantity',0\)\.gt\('sales_last_30_days',0\)/);
});

test('23-R1 keeps first-render time labels deterministic across server and browser',()=>{
  const dashboard=read('app/dashboard-client.js');
  const inventoryCenter=read('app/unified-inventory-operations-center.js');
  const ordersCenter=read('app/unified-orders-center.js');
  const collectionCenter=read('app/unified-collection-operations-center.js');
  const reliability=read('app/_reliability/harin-reliability-workbench.js');
  assert.match(dashboard,/hourCycle:'h23'/);
  assert.match(inventoryCenter,/hourCycle:'h23'/);
  assert.match(ordersCenter,/hourCycle:'h23'/);
  assert.match(collectionCenter,/hourCycle:'h23'/);
  assert.match(reliability,/hourCycle:'h23'/);
  assert.doesNotMatch(ordersCenter,/hour:'numeric'/);
  assert.doesNotMatch(collectionCenter,/hour:'numeric'/);
  assert.doesNotMatch(reliability,/hour:'numeric'/);
  assert.match(reliability,/const \[clock,setClock\]=useState\(null\)/);
  assert.match(reliability,/clock==null\|\|Number\.isNaN\(generated\)\?null/);
});
