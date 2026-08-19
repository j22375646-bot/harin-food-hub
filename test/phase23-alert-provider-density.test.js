'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const density=require('../lib/ui/density-workbench.js');

const read=file=>fs.readFileSync(file,'utf8');

test('23-4C limits alert and provider rows before rendering',()=>{
  const rows=Array.from({length:60},(_,index)=>({id:index}));
  assert.deepEqual(density.ALERT_PAGE_SIZES,[8,16,24]);
  assert.deepEqual(density.PROVIDER_PAGE_SIZES,[10,20,30]);
  assert.equal(density.paginateDensityRows(rows,1,50).items.length,8);
  assert.equal(density.paginateDensityRows(rows,2,20,density.PROVIDER_PAGE_SIZES).items.length,20);
});

test('23-4C filters providers without turning setup or stale data into ready data',()=>{
  const services=[
    {provider:'NAVER_COMMERCE',label:'네이버 커머스',group:'naver',status:'READY'},
    {provider:'GA4',label:'자사몰 GA4',group:'owned-site',status:'SETUP_REQUIRED'},
    {provider:'TELEGRAM_BOT',label:'Telegram',group:'operations',status:'STALE'}
  ];
  assert.deepEqual(density.filterProviderServices(services,{status:'SETUP'}).map(item=>item.provider),['GA4']);
  assert.deepEqual(density.filterProviderServices(services,{status:'ATTENTION'}).map(item=>item.provider),['TELEGRAM_BOT']);
  assert.deepEqual(density.filterProviderServices(services,{query:'네이버'}).map(item=>item.provider),['NAVER_COMMERCE']);
});

test('23-4C uses compact paged lists and selected detail panels',()=>{
  const dashboard=read('app/dashboard-client.js');
  const provider=read('app/provider-operations-center.js');
  const notificationCss=read('app/_reliability/harin-reliability-v8.css');
  const providerCss=read('app/_reliability/harin-naver-api-center.css');
  assert.match(dashboard,/alertPagination\.items\.map/);
  assert.match(dashboard,/notificationAlertDetail/);
  assert.match(dashboard,/deliveryPagination\.items\.map/);
  assert.match(provider,/pagination\.items\.map/);
  assert.match(provider,/ProviderDetail service=\{detail\}/);
  assert.match(notificationCss,/\.notificationDensityGrid/);
  assert.match(providerCss,/\.providerRuntimeWorkbench/);
});
