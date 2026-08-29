'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.resolve(__dirname,'..');
const snapshotModule=require('../lib/navigation/operation-snapshot.js');

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

test('dashboard never replaces sidebar badges with route-scoped page arrays',()=>{
  const client=fs.readFileSync(path.join(root,'app','legacy-dashboard-client.js'),'utf8');
  assert.match(client,/buildNavigationOperationSnapshot\(initialData\)/);
  assert.match(client,/selectNavigationOperationSnapshot/);
  assert.match(client,/navigationSnapshotKnown/);
  assert.doesNotMatch(client,/const operationBadges=\{orders:num\(initialData\.unifiedOrders/);
  assert.doesNotMatch(client,/const connectionChannels=initialData\.channelConnections/);
  assert.doesNotMatch(client,/badge:operationBadges\[item\.id\]\|\|0/);
});
