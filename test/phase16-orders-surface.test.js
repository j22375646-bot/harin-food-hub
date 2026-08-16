'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {navigationContext,normalizeHubState}=require('../lib/navigation/hub-routes.js');

const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');

test('16-3 labels the unified order route as all channels instead of Coupang',()=>{
  assert.equal(normalizeHubState({view:'orders',platform:'coupang'}).platform,'all');
  assert.equal(navigationContext('orders','all').platform,'전체 채널');
  assert.equal(normalizeHubState({view:'inventory'}).platform,'coupang');
});

test('16-3 gives each order workspace a pictogram and pastel visual state',()=>{
  const center=read('app/unified-orders-center.js');
  const css=read('app/_operations/harin-operations-v8.css');
  assert.match(center,/ORDER_WORKSPACE_PRESENTATION/);
  assert.match(center,/className="orderWorkspaceHeadingIcon"/);
  assert.match(center,/data-workspace=\{workspace\.toLowerCase\(\)\}/);
  assert.match(css,/\.orderWorkspaceHeading\{[^}]*var\(--v8-blue-soft\)/);
  for(const workspace of ['epost','register','in_transit','completed','retry']){
    assert.match(css,new RegExp(`data-workspace="${workspace}"`));
  }
});

test('16-3 preserves seller-delivery and postal automation behavior',()=>{
  const center=read('app/unified-orders-center.js');
  assert.match(center,/POSTAL_COURIER_BY_PLATFORM/);
  assert.match(center,/order\.fulfillment!=='ROCKET_GROWTH'/);
  assert.match(center,/issueAndTransfer/);
  assert.match(center,/송장 자동발급 \+ 쇼핑몰 등록/);
});

test('16-11 moves registered invoices through ePost waiting and shipping workspaces',()=>{
  const center=read('app/unified-orders-center.js');
  const route=read('app/api/orders/live-refresh/route.js');
  const css=read('app/_operations/harin-operations-v8.css');
  assert.match(center,/WAITING_FOR_CARRIER:'배송대기중'/);
  assert.match(center,/label:'배송대기중'.*송장등록완료/);
  assert.match(center,/workspace==='IN_TRANSIT'\)return tracking\?\.statusCode==='IN_TRANSIT'/);
  assert.match(center,/onTransfersCompleted=\{handleTransfersCompleted\}/);
  assert.match(center,/router\.refresh\(\)/);
  assert.match(center,/송장 자동등록이 완료됐어요/);
  assert.match(route,/NAVER_COMMERCE_SYNC/);
  assert.match(route,/coupangRequestId/);
  assert.match(route,/naverRequestId/);
  assert.match(css,/\.shippingCompletionNotice/);
});
