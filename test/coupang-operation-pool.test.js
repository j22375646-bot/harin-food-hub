'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {drainOperations}=require('../lib/coupang/operation-pool');
const job=(id,type='EPOST_LIVE_ISSUE',target=id)=>({id,operation_type:type,target_type:'HUB_ORDER',target_id:target});
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
const tick=()=>new Promise(r=>setImmediate(r));

test('12 invoices use two slots; slow first invoice does not block later orders',async()=>{
 const pending=Array.from({length:12},(_,i)=>job(String(i))),first=deferred(),secondStarted=deferred();
 let active=0,peak=0,claims=0;const completed=[];
 const run=drainOperations({claim:async()=>{claims++;return pending.shift();},process:async request=>{
  active++;peak=Math.max(peak,active);if(request.id==='0')await first.promise;
  else {secondStarted.resolve();await tick();}active--;completed.push(request.id);
 }});
 await secondStarted.promise;
 for(let i=0;i<30&&completed.length<11;i++)await tick();
 assert.equal(completed.length,11);assert.equal(peak,2);assert.equal(active,1);
 first.resolve();assert.equal(await run,12);assert.equal(new Set(completed).size,12);assert.equal(claims,13);
});

test('same order and non-invoice operations remain exclusive',async()=>{
 const pending=[job('1','EPOST_LIVE_ISSUE','A'),job('2','EPOST_LIVE_ISSUE','A'),job('3','UPLOAD_INVOICE'),job('4'),job('5','CS_REPLY')];
 const active=new Set(),events=[];
 assert.equal(await drainOperations({claim:async()=>pending.shift(),process:async r=>{
  assert.ok(!active.has(r.target_id));
  if(r.operation_type!=='EPOST_LIVE_ISSUE')assert.equal(active.size,0);
  active.add(r.target_id);events.push(r.id);await tick();active.delete(r.target_id);
 }}),5);
 assert.deepEqual(events,['1','2','3','4','5']);
});

test('rollback setting caps concurrency at one',async()=>{
 const pending=[job('1'),job('2')];let active=0;
 await drainOperations({concurrency:'1',claim:async()=>pending.shift(),process:async()=>{assert.equal(++active,1);await tick();active--;}});
});

test('unexpected processor error joins in-flight work and never retries a write',async()=>{
 const pending=[job('1'),job('2'),job('3')],gate=deferred();let done=false;const started=[];
 const run=drainOperations({claim:async()=>pending.shift(),process:async r=>{
  started.push(r.id);if(r.id==='1'){await tick();throw Error('db unavailable');}await gate.promise;done=true;
 }});
 let settled=false;const checked=assert.rejects(run,/db unavailable/).then(()=>{settled=true;});
 await tick();await tick();assert.equal(settled,false);gate.resolve();await checked;
 assert.equal(done,true);assert.deepEqual(started,['1','2']);
});

test('claim error also waits for an already running invoice',async()=>{
 const gate=deferred();let claims=0,done=false;
 const run=drainOperations({claim:async()=>{if(claims++)throw Error('claim failed');return job('1');},process:async()=>{await gate.promise;done=true;}});
 const checked=assert.rejects(run,/claim failed/);await tick();assert.equal(done,false);gate.resolve();await checked;assert.equal(done,true);
});
