'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');

test('client lazy loads operational dashboards behind page runtime state',()=>{
  const client=read('app/dashboard-client.js');
  assert.match(client,/dynamic\(\(\)=>import\('\.\/_phase28\/orders-dashboard\.js'\),\{loading:LazyWorkbenchFallback\}\)/);
  assert.match(client,/dynamic\(\(\)=>import\('\.\/_phase28\/cs-dashboard\.js'\),\{loading:LazyWorkbenchFallback\}\)/);
  assert.match(client,/phase28ActivePages\.has\('orders'\)&&Boolean\(initialData\.phase28\?\.orders\)/);
  assert.match(client,/phase28ActivePages\.has\('cs'\)&&Boolean\(initialData\.phase28\?\.cs\)/);
});

test('client embeds legacy work centers in Phase 28 and keeps them as fallback',()=>{
  const client=read('app/dashboard-client.js');
  assert.match(client,/phase28OrdersActive\?<Phase28OrdersDashboard/);
  assert.match(client,/<UnifiedOrdersCenter[^>]*embedded/);
  assert.match(client,/:<UnifiedOrdersCenter center=\{initialData\.unifiedOrders\}/);
  assert.match(client,/phase28CsActive\?<Phase28CsDashboard/);
  assert.match(client,/<UnifiedCustomerServiceCenter[^>]*embedded/);
  assert.match(client,/:<UnifiedCustomerServiceCenter center=\{initialData\.customerService\}/);
});

test('embedded centers suppress only duplicate headers and AI regions',()=>{
  const orders=read('app/unified-orders-center.js');
  const cs=read('app/unified-customer-service-center.js');
  assert.match(orders,/embedded=false/);
  assert.match(cs,/embedded=false/);
  assert.match(orders,/!embedded\?<HarinPageHeader/);
  assert.match(cs,/!embedded\?<HarinPageHeader/);
  assert.match(orders,/!embedded\?<HarinPageAiRegion/);
  assert.match(cs,/!embedded\?<HarinPageAiRegion/);
});

test('Phase 28 operational pages own the one visible right rail',()=>{
  const client=read('app/dashboard-client.js');
  assert.match(client,/const phase28OwnsRail=phase28HomeActive\|\|phase28OrdersActive\|\|phase28CsActive/);
  assert.match(client,/!phase28OwnsRail&&<HarinOwnerWorkspace/);
});
