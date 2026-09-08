'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {mayApplyResult,createSwitchState}=require('../lib/tenancy/switch-state.js');

test('different business and earlier visit results cannot enter the current screen',()=>{
 assert.equal(mayApplyResult({activeTenantId:'b',requestGeneration:2},{tenantId:'a',requestGeneration:1}),false);
 assert.equal(mayApplyResult({activeTenantId:'a',requestGeneration:3},{tenantId:'a',requestGeneration:1}),false);
 assert.equal(mayApplyResult({activeTenantId:'a',requestGeneration:3},{tenantId:'a',requestGeneration:3}),true);
});
test('missing or malformed context never counts as matching',()=>{
 for(const id of [null,undefined,'',' a','a ',2]){
  assert.equal(mayApplyResult({activeTenantId:id,requestGeneration:1},{tenantId:id,requestGeneration:1}),false);
 }
 for(const generation of [undefined,null,0,-1,1.5,NaN,Infinity,Number.MAX_SAFE_INTEGER+1,'1']){
  assert.equal(mayApplyResult({activeTenantId:'a',requestGeneration:generation},{tenantId:'a',requestGeneration:generation}),false);
 }
 assert.equal(mayApplyResult(null,null),false);
});
test('A to B to A invalidates old requests even when abort is ignored',()=>{
 const state=createSwitchState();
 assert.throws(()=>state.capture(),/NO_ACTIVE_TENANT/);
 state.select('a');const old=state.capture();
 state.select('b');const other=state.capture();
 state.select('a');const current=state.capture();
 assert.equal(old.signal.aborted,true);assert.equal(other.signal.aborted,true);
 assert.equal(state.accepts(old),false);assert.equal(state.accepts(other),false);
 assert.equal(state.accepts(current),true);assert.equal(current.signal.aborted,false);
});
test('logout invalidates in-flight requests and clears active tenant',()=>{
 const state=createSwitchState();state.select('a');const request=state.capture();state.clear();
 assert.equal(request.signal.aborted,true);assert.equal(state.accepts(request),false);
 assert.throws(()=>state.capture(),/NO_ACTIVE_TENANT/);
 state.select('a');assert.equal(state.accepts(request),false);
});
test('same tenant reselection invalidates earlier visit; invalid selection preserves current state',()=>{
 const state=createSwitchState();state.select('a');const old=state.capture();
 assert.throws(()=>state.select(' '),/INVALID_TENANT/);assert.equal(state.accepts(old),true);
 state.select('a');assert.equal(state.accepts(old),false);
 const current=state.capture();assert.equal(Object.isFrozen(current),true);
 assert.equal(state.accepts({...current,tenantId:'b'}),false);
});
test('late async data cannot overwrite the new business result',async()=>{
 const state=createSwitchState();let displayed=null,resolveOld;
 state.select('a');const old=state.capture();
 const pending=new Promise(resolve=>{resolveOld=resolve;}).then(data=>{if(state.accepts(old))displayed=data;});
 state.select('b');const current=state.capture();
 if(state.accepts(current))displayed={business:'b',orders:['b-order']};
 resolveOld({business:'a',orders:['a-order']});await pending;
 assert.deepEqual(displayed,{business:'b',orders:['b-order']});
});
test('abort listeners see old requests invalidated before they execute',()=>{
 const state=createSwitchState();state.select('a');const old=state.capture();let accepted;
 old.signal.addEventListener('abort',()=>{accepted=state.accepts(old);});
 state.select('b');assert.equal(accepted,false);
});
