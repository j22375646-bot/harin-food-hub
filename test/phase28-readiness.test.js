'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const routes=require('../lib/ui/phase28-route-registry.js');
const hub=require('../lib/navigation/hub-routes.js');
const {buildPhase28Readiness}=require('../lib/ui/phase28-readiness.js');
const {PHASE28_AVAILABLE_ADAPTERS}=require('../lib/ui/phase28-adapters/index.js');

test('readiness reports the foundation as safe but not cut over by default',()=>{
  const report=buildPhase28Readiness({routes:routes.PHASE28_ROUTES,hubNav:hub.HUB_NAV,hubWorkspaces:hub.HUB_WORKSPACES,env:{},availableAdapters:[]});
  assert.equal(report.foundation,'READY');
  assert.equal(report.cutover,'BLOCKED');
  assert.equal(report.flags.enabled,false);
  assert.ok(report.blockers.some(item=>item.code==='MISSING_PRODUCTION_ROUTE'&&item.page==='product-analysis'));
  assert.ok(report.blockers.some(item=>item.code==='MISSING_ADAPTER'&&item.page==='home'));
});

test('readiness refuses an invalid flag instead of activating a partial screen set',()=>{
  const report=buildPhase28Readiness({routes:routes.PHASE28_ROUTES,hubNav:hub.HUB_NAV,hubWorkspaces:hub.HUB_WORKSPACES,env:{HARIN_PHASE28_ENABLED:'true',HARIN_PHASE28_PAGES:'home,admin'},availableAdapters:['main']});
  assert.equal(report.cutover,'BLOCKED');
  assert.ok(report.blockers.some(item=>item.code==='INVALID_FLAG_PAGE'&&item.page==='admin'));
});

test('readiness recognizes the implemented Main adapter only',()=>{
  const report=buildPhase28Readiness({routes:routes.PHASE28_ROUTES,hubNav:hub.HUB_NAV,hubWorkspaces:hub.HUB_WORKSPACES,env:{},availableAdapters:PHASE28_AVAILABLE_ADAPTERS});
  assert.equal(report.blockers.some(item=>item.code==='MISSING_ADAPTER'&&item.page==='home'),false);
  assert.equal(report.blockers.some(item=>item.code==='MISSING_ADAPTER'&&item.page==='orders'),true);
});
