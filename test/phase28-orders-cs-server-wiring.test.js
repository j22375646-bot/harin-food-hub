'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');

test('server builds the orders model only for an active orders request',()=>{
  const page=read('app/dashboard-route.js');
  assert.match(page,/phase28Runtime\.activePages\.includes\('orders'\)&&initialState\.view==='orders'/);
  assert.match(page,/await loadPhase28Adapter\('orders'\)/);
  assert.match(page,/ordersAdapter\.buildPhase28OrdersModel\(dashboardData\)/);
  assert.match(page,/orders:null,adapter_status:'ERROR'/);
});

test('server builds the cs model only for an active cs request',()=>{
  const page=read('app/dashboard-route.js');
  assert.match(page,/phase28Runtime\.activePages\.includes\('cs'\)&&initialState\.view==='cs'/);
  assert.match(page,/await loadPhase28Adapter\('cs'\)/);
  assert.match(page,/csAdapter\.buildPhase28CsModel\(dashboardData\)/);
  assert.match(page,/cs:null,adapter_status:'ERROR'/);
});

test('operational adapters remain server-owned and client runtime stays serializable',()=>{
  const client=read('app/dashboard-client.js');
  assert.doesNotMatch(client,/buildPhase28(?:Orders|Cs)Model/);
  assert.doesNotMatch(client,/process\.env\.HARIN_PHASE28/);
});
