'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const flags=require('../lib/ui/feature-flags.js');

test('Phase 28 is disabled with no active pages by default',()=>{
  const config=flags.phase28UiConfig({});
  assert.equal(config.enabled,false);
  assert.deepEqual(config.pages,[]);
  assert.equal(config.active('home'),false);
  assert.equal(flags.harinUiConfig({}).phase28.enabled,false);
});

test('Phase 28 activates only allowlisted pages when the master flag is on',()=>{
  const config=flags.phase28UiConfig({HARIN_PHASE28_ENABLED:'true',HARIN_PHASE28_PAGES:'home, orders,home'});
  assert.equal(config.valid,true);
  assert.deepEqual(config.pages,['home','orders']);
  assert.equal(config.active('home'),true);
  assert.equal(config.active('cs'),false);
});

test('Phase 28 refuses all activation when any configured page is unknown',()=>{
  const config=flags.phase28UiConfig({HARIN_PHASE28_ENABLED:'true',HARIN_PHASE28_PAGES:'home,admin'});
  assert.equal(config.valid,false);
  assert.deepEqual(config.invalidPages,['admin']);
  assert.equal(config.active('home'),false);
});

test('Phase 28 runtime config exposes only serializable active pages',()=>{
  const runtime=flags.phase28RuntimeConfig({HARIN_PHASE28_ENABLED:'true',HARIN_PHASE28_PAGES:'home'});
  assert.deepEqual(runtime.activePages,['home']);
  assert.deepEqual(JSON.parse(JSON.stringify(runtime)),{
    enabled:true,
    valid:true,
    pages:['home'],
    activePages:['home'],
    invalidPages:[]
  });
});

test('Phase 28 runtime config fail-closes invalid page lists',()=>{
  const runtime=flags.phase28RuntimeConfig({HARIN_PHASE28_ENABLED:'true',HARIN_PHASE28_PAGES:'home,admin'});
  assert.deepEqual(runtime.activePages,[]);
  assert.deepEqual(runtime.invalidPages,['admin']);
});
