'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const {
  PHASE28_ROUTES,
  PHASE28_ROUTE_IDS,
  phase28Route,
  phase28RouteForLegacyState,
  phase28RouteForPath,
  validatePhase28Registry
}=require('../lib/ui/phase28-route-registry.js');

test('Phase 28 registry maps all eighteen V106 screens to stable production addresses',()=>{
  assert.equal(PHASE28_ROUTES.length,18);
  assert.equal(new Set(PHASE28_ROUTE_IDS).size,18);
  assert.equal(new Set(PHASE28_ROUTES.map(item=>item.href)).size,18);
  assert.equal(phase28Route('home').href,'/');
  assert.equal(phase28Route('calendar').href,'/calendar');
  assert.equal(phase28Route('keywords').href,'/keywords/registered');
  assert.equal(phase28Route('product-analysis').href,'/product-analysis');
  assert.equal(phase28Route('analysis').href,'/insights/overview');
  assert.equal(phase28RouteForPath('/products/catalog').id,'products');
});

test('Phase 28 registry keeps workspaces and channel writes explicit',()=>{
  assert.equal(phase28Route('system').preserveWorkspaces,true);
  assert.equal(phase28Route('development').preserveWorkspaces,true);
  assert.equal(phase28Route('orders').writePolicy,'GUARDED');
  assert.equal(phase28Route('product-analysis').writePolicy,'GUARDED');
  assert.equal(phase28Route('analysis').writePolicy,'READ_ONLY');
});

test('low-frequency operational records are declared click-only',()=>{
  const clickOnly=PHASE28_ROUTES.filter(route=>route.loadPolicy==='ON_DEMAND').map(route=>route.id);
  assert.deepEqual(clickOnly,['diagnoses','changes','validation','experiments','knowledge']);
});

test('legacy state resolves to one stable Phase 28 route',()=>{
  assert.equal(phase28RouteForLegacyState({view:'main',workspace:null}).id,'home');
  assert.equal(phase28RouteForLegacyState({view:'product',workspace:'catalog'}).id,'products');
  assert.equal(phase28RouteForLegacyState({view:'product-analysis',workspace:null}).id,'product-analysis');
  assert.equal(phase28RouteForLegacyState({view:'unknown',workspace:null}),null);
});

test('Phase 28 registry rejects duplicates and incomplete entries',()=>{
  const duplicate=[...PHASE28_ROUTES,{...PHASE28_ROUTES[0]}];
  assert.deepEqual(validatePhase28Registry(PHASE28_ROUTES),[]);
  assert.ok(validatePhase28Registry(duplicate).some(issue=>issue.code==='DUPLICATE_ID'));
  assert.ok(validatePhase28Registry([{id:'broken',href:'relative'}]).some(issue=>issue.code==='INVALID_HREF'));
});
