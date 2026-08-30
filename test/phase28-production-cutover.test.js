'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {PHASE28_ROUTE_IDS}=require('../lib/ui/phase28-route-registry.js');
const productionRuntime=require('../lib/ui/phase28-production-runtime.js');

const root=path.resolve(__dirname,'..');

test('production defaults to the complete Phase 28 application after final cutover',()=>{
  const runtime=productionRuntime.phase28RuntimeConfig({NODE_ENV:'production'},{routeId:'home'});
  assert.equal(runtime.renderMode,'full');
  assert.equal(runtime.coverage,'COMPLETE');
  assert.deepEqual(runtime.activePages,PHASE28_ROUTE_IDS);
});

test('the retired UI flag cannot put the live hub back on the legacy frontend',()=>{
  const runtime=productionRuntime.phase28RuntimeConfig({
    NODE_ENV:'production',
    HARIN_PHASE28_ENABLED:'false'
  },{routeId:'home'});
  assert.equal(runtime.renderMode,'full');
  assert.equal(runtime.coverage,'COMPLETE');
  assert.deepEqual(runtime.activePages,PHASE28_ROUTE_IDS);
});

test('every server route that selects Phase 28 uses the production readiness runtime',()=>{
  const appRoot=path.join(root,'app');
  const pending=[appRoot];
  const selectors=[];
  while(pending.length){
    const current=pending.pop();
    for(const entry of fs.readdirSync(current,{withFileTypes:true})){
      const absolute=path.join(current,entry.name);
      if(entry.isDirectory())pending.push(absolute);
      else if(entry.isFile()&&entry.name.endsWith('.js')){
        const text=fs.readFileSync(absolute,'utf8');
        if(/phase28Runtime(?:Config|ForState)\(process\.env/.test(text))selectors.push({absolute,text});
      }
    }
  }
  assert.ok(selectors.length>=17);
  for(const item of selectors){
    assert.match(
      item.text,
      /phase28-production-runtime\.js/,
      path.relative(root,item.absolute)
    );
  }
});
