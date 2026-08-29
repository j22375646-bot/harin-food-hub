'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const flags=require('../lib/ui/feature-flags.js');
const {PHASE28_ROUTE_IDS}=require('../lib/ui/phase28-route-registry.js');

const allPages=PHASE28_ROUTE_IDS.join(',');

test('production renders full V106 only with complete pages and READY cutover',()=>{
  const runtime=flags.phase28RuntimeConfig({
    NODE_ENV:'production',HARIN_PHASE28_ENABLED:'true',HARIN_PHASE28_PAGES:allPages
  },{readiness:{cutover:'READY'},routeId:'home'});
  assert.equal(runtime.coverage,'COMPLETE');
  assert.equal(runtime.renderMode,'full');
  assert.deepEqual(runtime.activePages,PHASE28_ROUTE_IDS);
});

test('partial production configuration never activates an overlay page',()=>{
  const runtime=flags.phase28RuntimeConfig({
    NODE_ENV:'production',HARIN_PHASE28_ENABLED:'true',HARIN_PHASE28_PAGES:'home,orders'
  },{readiness:{cutover:'BLOCKED'},routeId:'home'});
  assert.equal(runtime.coverage,'PARTIAL');
  assert.equal(runtime.renderMode,'legacy');
  assert.deepEqual(runtime.activePages,[]);
});

test('local preview may render the V106 shell for an allowlisted route',()=>{
  const runtime=flags.phase28RuntimeConfig({
    NODE_ENV:'development',HARIN_PHASE28_PREVIEW:'true',HARIN_PHASE28_PAGES:'home'
  },{readiness:{cutover:'BLOCKED'},routeId:'home'});
  assert.equal(runtime.renderMode,'preview');
  assert.deepEqual(runtime.activePages,['home']);
});

test('preview flag is ignored in production',()=>{
  const runtime=flags.phase28RuntimeConfig({
    NODE_ENV:'production',HARIN_PHASE28_PREVIEW:'true',HARIN_PHASE28_PAGES:'home'
  },{readiness:{cutover:'BLOCKED'},routeId:'home'});
  assert.equal(runtime.renderMode,'legacy');
  assert.deepEqual(runtime.activePages,[]);
});
