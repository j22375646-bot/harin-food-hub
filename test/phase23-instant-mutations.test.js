'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');

test('23-3 updates verified Naver bid rows without refreshing the route',()=>{
  const table=read('app/_analysis/keyword-operations-table.js');
  assert.doesNotMatch(table,/useRouter|router\.refresh/);
  assert.match(table,/const \[instantRows,setInstantRows\]=useState\(\{\}\)/);
  assert.match(table,/currentBid:desired,observedBid:desired,canDraft:false,status:'VERIFIED'/);
  assert.match(table,/mutationState==='APPLYING'/);
  assert.match(table,/mutationState==='APPLIED'/);
  assert.match(table,/mutationState==='FAILED'/);
});

test('23-3 reflects saved keyword product links in the affected card only',()=>{
  const dashboard=read('app/dashboard-client.js');
  const saveStart=dashboard.indexOf('async function saveKeywordLink');
  const saveEnd=dashboard.indexOf('async function createAutomationDrafts',saveStart);
  const saveKeywordLink=dashboard.slice(saveStart,saveEnd);
  assert.match(dashboard,/const \[savedLinks,setSavedLinks\]=useState/);
  assert.match(saveKeywordLink,/setSavedLinks\(current=>\(\{\.\.\.current,\[item\.ncc_keyword_id\]:masterProductId\|\|''\}\)\)/);
  assert.doesNotMatch(saveKeywordLink,/window\.location\.reload|router\.refresh/);
  assert.match(saveKeywordLink,/finally\{setWorking\(''\);\}/);
});

test('23-3 keeps the order center mounted after shipment registration refresh',()=>{
  const orders=read('app/unified-orders-center.js');
  const start=orders.indexOf('async function handleTransfersCompleted');
  const end=orders.indexOf('function locateScannedOrder',start);
  const completion=orders.slice(start,end);
  assert.match(completion,/await refreshLiveOrders\(\{afterShipping:true\}\)/);
  assert.doesNotMatch(completion,/router\.refresh|window\.location\.reload/);
  assert.doesNotMatch(orders,/useRouter/);
});

test('23-3 reloads product mapping data inside the workbench instead of the page',()=>{
  const dashboard=read('app/dashboard-client.js');
  const start=dashboard.indexOf('function ProductMappingWorkbench');
  const end=dashboard.indexOf('const shippingPlatforms',start);
  const workbench=dashboard.slice(start,end);
  assert.match(workbench,/const \[currentMapping,setCurrentMapping\]=useState\(mapping\)/);
  assert.match(workbench,/fetch\('\/api\/products\/mappings',\{cache:'no-store'\}\)/);
  assert.match(workbench,/setCurrentMapping\(\{summary:refreshed\.summary,candidates:refreshed\.candidates,links:refreshed\.links\}\)/);
  assert.doesNotMatch(workbench,/window\.location\.reload|router\.refresh/);
  assert.match(workbench,/finally\{setWorking\(''\);\}/);
});
