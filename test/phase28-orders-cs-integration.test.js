'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');

test('legacy operational dashboards remain isolated inside the rollback root',()=>{
  const legacy=read('app/legacy-dashboard-client.js');
  assert.match(legacy,/dynamic\(\(\)=>import\('\.\/_phase28\/orders-dashboard\.js'\),\{loading:LazyWorkbenchFallback\}\)/);
  assert.match(legacy,/dynamic\(\(\)=>import\('\.\/_phase28\/cs-dashboard\.js'\),\{loading:LazyWorkbenchFallback\}\)/);
  assert.match(legacy,/phase28ActivePages\.has\('orders'\)&&Boolean\(initialData\.phase28\?\.orders\)/);
  assert.match(legacy,/phase28ActivePages\.has\('cs'\)&&Boolean\(initialData\.phase28\?\.cs\)/);
});

test('V106 application root never embeds a legacy work center',()=>{
  const entry=read('app/dashboard-client.js');
  const app=read('app/_phase28/phase28-app.js');
  assert.doesNotMatch(entry,/UnifiedOrdersCenter|UnifiedCustomerServiceCenter|Phase28OrdersDashboard|Phase28CsDashboard/);
  assert.doesNotMatch(app,/UnifiedOrdersCenter|UnifiedCustomerServiceCenter|Phase28OrdersDashboard|Phase28CsDashboard/);
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

test('V106 root does not inherit the legacy owner-workspace rail',()=>{
  const app=read('app/_phase28/phase28-app.js');
  assert.doesNotMatch(app,/HarinOwnerWorkspace|phase28OwnsRail/);
});
