'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.resolve(__dirname,'..');
const snapshotModule=require('../lib/navigation/operation-snapshot.js');

test('navigation snapshot uses one shared browser storage key',()=>{
  assert.equal(snapshotModule.NAVIGATION_SNAPSHOT_KEY,'harin-hub:navigation-operation-snapshot');
});

test('navigation snapshot has one validated cookie format for full route loads',()=>{
  assert.equal(snapshotModule.NAVIGATION_SNAPSHOT_COOKIE,'harin_hub_navigation_operation_snapshot');
  const snapshot={
    version:1,source:'MAIN_OPERATION_SUMMARY',generatedAt:new Date().toISOString(),
    badges:{orders:2,cs:1,inventory:3,notifications:4},
    connection:{ready:3,total:3,label:'3개 채널 연결',tone:'ready'}
  };
  const encoded=snapshotModule.serializeNavigationOperationSnapshotCookie(snapshot);
  assert.match(encoded,/^%7B/);
  assert.deepEqual(snapshotModule.parseNavigationOperationSnapshotCookie(encoded),snapshot);
  assert.equal(snapshotModule.parseNavigationOperationSnapshotCookie('%7Bbroken'),null);
});

test('navigation snapshot accepts only the complete main operating summary',()=>{
  const main=snapshotModule.buildNavigationOperationSnapshot({
    loadedView:'main',generatedAt:'2026-08-23T03:00:00.000Z',
    unifiedOrders:{summary:{actionRequired:4}},
    customerService:{summary:{active:3}},
    unifiedInventory:{summary:{action_required:2}},
    alerts:[{status:'OPEN'},{status:'OPEN'}],
    channelConnections:{channels:[
      {platform:'NAVER',status:'READ_READY'},
      {platform:'CAFE24',status:'WRITE_READY'},
      {platform:'COUPANG',status:'READ_READY'}
    ]}
  });
  assert.deepEqual(main.badges,{orders:4,cs:3,inventory:2,notifications:2});
  assert.equal(main.connection.label,'3개 채널 연결');
  assert.equal(main.connection.tone,'ready');
  assert.equal(snapshotModule.buildNavigationOperationSnapshot({loadedView:'orders',unifiedOrders:{summary:{actionRequired:46}}}),null);
});

test('navigation snapshot keeps the newest authoritative value without turning a briefly stale cache into zero',()=>{
  const older={version:1,source:'MAIN_OPERATION_SUMMARY',generatedAt:'2026-08-23T03:00:00.000Z',badges:{orders:4},connection:{}};
  const newer={version:1,source:'MAIN_OPERATION_SUMMARY',generatedAt:'2026-08-23T03:02:00.000Z',badges:{orders:3},connection:{}};
  assert.equal(snapshotModule.selectNavigationOperationSnapshot(older,newer)?.badges.orders,3);
  assert.equal(snapshotModule.parseNavigationOperationSnapshot(JSON.stringify(newer),Date.parse('2026-08-23T03:05:00.000Z'))?.badges.orders,3);
  const cached=snapshotModule.parseNavigationOperationSnapshot(JSON.stringify(newer),Date.parse('2026-08-23T03:20:00.000Z'));
  assert.equal(cached?.badges.orders,3);
  assert.equal(snapshotModule.navigationOperationSnapshotFreshness(cached,Date.parse('2026-08-23T03:20:00.000Z')).stale,true);
  assert.equal(snapshotModule.parseNavigationOperationSnapshot(JSON.stringify(newer),Date.parse('2026-08-24T04:00:00.000Z')),null);
});

test('an incomplete refresh keeps the last complete snapshot instead of replacing known counts with zero or unknown',()=>{
  const now=Date.parse('2026-09-02T07:40:00.000Z');
  const complete={version:1,source:'MAIN_OPERATION_SUMMARY',generatedAt:'2026-09-02T07:30:00.000Z',badges:{orders:2,cs:1,inventory:3,notifications:4},connection:{ready:3,total:3}};
  const partial={version:1,source:'MAIN_OPERATION_SUMMARY',generatedAt:'2026-09-02T07:39:00.000Z',badges:{orders:null,cs:0,inventory:0,notifications:2},connection:{ready:3,total:3}};
  assert.equal(snapshotModule.selectFetchedNavigationOperationSnapshot(complete,partial,{partial:true,now}),complete);
  assert.equal(snapshotModule.selectFetchedNavigationOperationSnapshot(complete,partial,{partial:false,now}),complete);
});

test('an incomplete fresh snapshot is retried and can recover from a better partial refresh',()=>{
  const now=Date.parse('2026-09-02T07:40:00.000Z');
  const incomplete={version:1,source:'MAIN_OPERATION_SUMMARY',generatedAt:'2026-09-02T07:39:30.000Z',badges:{orders:null,cs:null,inventory:0,notifications:null},connection:{ready:null,total:null}};
  const recovering={version:1,source:'MAIN_OPERATION_SUMMARY',generatedAt:'2026-09-02T07:39:50.000Z',badges:{orders:2,cs:0,inventory:0,notifications:3},connection:{ready:null,total:null}};
  assert.equal(snapshotModule.navigationOperationSnapshotFreshness(incomplete,now).stale,false);
  assert.equal(snapshotModule.isNavigationOperationSnapshotComplete(incomplete),false);
  assert.equal(snapshotModule.isNavigationOperationSnapshotComplete(recovering),true);
  assert.equal(snapshotModule.selectFetchedNavigationOperationSnapshot(incomplete,recovering,{partial:true,now}),recovering);
});

test('route hydration never lets a newer incomplete snapshot hide an existing complete sidebar',()=>{
  const complete={version:1,source:'MAIN_OPERATION_SUMMARY',generatedAt:'2026-09-02T07:30:00.000Z',badges:{orders:2,cs:0,inventory:0,notifications:3},connection:{ready:3,total:3}};
  const newerIncomplete={version:1,source:'MAIN_OPERATION_SUMMARY',generatedAt:'2026-09-02T07:39:00.000Z',badges:{orders:null,cs:0,inventory:0,notifications:null},connection:{ready:null,total:null}};
  assert.equal(snapshotModule.selectNavigationOperationSnapshot(complete,newerIncomplete),complete);
});

test('dashboard never replaces sidebar badges with route-scoped page arrays',()=>{
  const client=fs.readFileSync(path.join(root,'app','legacy-dashboard-client.js'),'utf8');
  assert.match(client,/buildNavigationOperationSnapshot\(initialData\)/);
  assert.match(client,/selectNavigationOperationSnapshot/);
  assert.match(client,/navigationSnapshotKnown/);
  assert.doesNotMatch(client,/const operationBadges=\{orders:num\(initialData\.unifiedOrders/);
  assert.doesNotMatch(client,/const connectionChannels=initialData\.channelConnections/);
  assert.doesNotMatch(client,/badge:operationBadges\[item\.id\]\|\|0/);
});
