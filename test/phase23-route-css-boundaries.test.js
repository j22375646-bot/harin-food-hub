'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');

test('23 hardening keeps route-only workbench CSS out of the global entry bundle',()=>{
  const globalCss=read('app/globals.css');
  for(const marker of [
    'Phase 11-3: packing and shipping workbench',
    'Phase 11-4 · unified customer service and claims',
    'Phase 11-8 · unified data collection operations',
    'Phase 13-4: owner-first order and shipping workspaces',
    'Phase 13-7: diagnosis, approval, validation, and experiment workflow',
    'Phase 17-10: instant workspace paint',
    'Phase 23-4A: dense product costs'
  ]) assert.doesNotMatch(globalCss,new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
});

test('23 hardening loads each extracted style with its owning workbench',()=>{
  const operations=read('app/_operations/harin-operations-v8.css');
  const analysis=read('app/_analysis/harin-analysis-v8.css');
  const execution=read('app/_execution/harin-execution-v8.css');
  const market=read('app/_analysis/harin-market-intelligence.css');
  assert.match(operations,/Phase 11-3: packing and shipping workbench/);
  assert.match(operations,/Phase 23 hardening · owner-maintained Rocket Growth expiry lots/);
  assert.match(analysis,/Phase 23-4B: spreadsheet product costs/);
  assert.match(execution,/Phase 13-7: diagnosis, approval, validation, and experiment workflow/);
  assert.match(market,/Phase 17-10: instant workspace paint/);
  assert.ok(operations.indexOf('Route-scoped legacy styles')<operations.indexOf('Phase 14-4: Orders'));
  assert.ok(analysis.indexOf('Route-scoped legacy styles')<analysis.indexOf('Phase 14-6: separate Insights'));
  assert.ok(execution.indexOf('Route-scoped legacy styles')<execution.indexOf('Phase 14-7: diagnosis'));
  for(const file of [
    'app/unified-orders-center.js',
    'app/unified-customer-service-center.js',
    'app/unified-inventory-operations-center.js',
    'app/unified-product-operations-center.js',
    'app/unified-settlement-operations-center.js',
    'app/unified-collection-operations-center.js'
  ]) assert.match(read(file),/harin-operations-v8\.css/);
  assert.match(read('app/_analysis/harin-analysis-workbench.js'),/harin-analysis-v8\.css/);
  assert.match(read('app/_execution/harin-execution-workbench.js'),/harin-execution-v8\.css/);
  assert.match(read('app/market-intelligence/layout.js'),/harin-market-intelligence\.css/);
});

test('23 hardening materially reduces the global CSS source',()=>{
  assert.ok(fs.statSync(path.join(root,'app','globals.css')).size<350000);
});
