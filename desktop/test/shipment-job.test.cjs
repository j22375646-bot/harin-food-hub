'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {createShipmentJob} = require('../shipment-job.cjs');
const order = 'HR-C24-1234ABCD';
const requestId = '12345678-1234-4123-8123-123456789abc';
function fixture() {
  let saved = null;
  const calls = [];
  return {
    calls, saved:()=>saved,
    options:{businessId:'harin',timeoutMs:30,
      store:{read:async()=>saved,write:async value=>{saved=structuredClone(value);}},
      transport:{submit:async body=>{calls.push(['POST',body]); return {status:202,body:{ok:true,results:[{hubOrderId:order,ok:true,request:{id:requestId,status:'PENDING'}}]}};},
        poll:async id=>{calls.push(['GET',id]); return {status:202,body:{ok:true,request:{id:requestId,hubOrderId:order,status:'RUNNING'}}};}}},
  };
}

test('disconnect during intent persistence prevents later dispatch and hides order state',async()=>{
  const f=fixture();let release,started;
  const entered=new Promise(resolve=>{started=resolve;});
  const write=f.options.store.write;
  f.options.store.write=async value=>{started();await new Promise(resolve=>{release=resolve;});await write(value);};
  const job=await createShipmentJob(f.options);
  const pending=job.submit({hubOrderId:order,confirm:true});await entered;
  job.suspend();release();await pending;
  assert.deepEqual(job.snapshot(),{status:'DISCONNECTED',hubOrderId:null,requestId:null});
  await job.submit({hubOrderId:order,confirm:true});await job.poll();
  assert.equal(f.calls.length,0);
});

test('disconnect aborts an in-flight request without retry or late state disclosure',async()=>{
  const f=fixture();let finish,signal,started;
  const entered=new Promise(resolve=>{started=resolve;});
  f.options.transport.submit=async (_body,options)=>{f.calls.push(['POST']);signal=options.signal;started();return new Promise(resolve=>{finish=resolve;});};
  const job=await createShipmentJob(f.options);
  const pending=job.submit({hubOrderId:order,confirm:true});await entered;job.suspend();
  assert.equal(signal.aborted,true);
  await pending;
  finish({status:202,body:{ok:true,results:[{hubOrderId:order,ok:true,request:{id:requestId,status:'PENDING'}}]}});
  await Promise.resolve();
  assert.deepEqual(job.snapshot(),{status:'DISCONNECTED',hubOrderId:null,requestId:null});
  const restored=await createShipmentJob(f.options);
  assert.equal(restored.snapshot().status,'UNKNOWN');
  await restored.submit({hubOrderId:order,confirm:true});assert.equal(f.calls.length,1);
});

test('disconnected known job retains its journal for a new authenticated controller to poll',async()=>{
  const f=fixture();const job=await createShipmentJob(f.options);
  await job.submit({hubOrderId:order,confirm:true});job.suspend();
  await job.poll();assert.equal(f.calls.length,1);
  const restored=await createShipmentJob(f.options);
  assert.equal((await restored.poll()).status,'RUNNING');
  assert.deepEqual(f.calls.map(row=>row[0]),['POST','GET']);
});
test('confirmation and canonical supported channel are required before any write', async()=>{
  const f=fixture(), job=await createShipmentJob(f.options);
  for (const input of [{hubOrderId:order,confirm:false},{hubOrderId:'HR-NV-1234ABCD',confirm:true},{hubOrderId:'HR-C24-1234abcd',confirm:true}]) {
    await assert.rejects(()=>job.submit(input));
  }
  assert.equal(f.calls.length,0); assert.equal(f.saved(),null);
});
test('durable intent precedes POST and repeated submit never issues again',async()=>{
  const f=fixture(); const submit=f.options.transport.submit;
  f.options.transport.submit=async body=>{assert.equal(f.saved().status,'SUBMITTING');return submit(body);};
  const job=await createShipmentJob(f.options);
  await Promise.all([job.submit({hubOrderId:order,confirm:true}),job.submit({hubOrderId:order,confirm:true})]);
  assert.equal(job.snapshot().status,'PENDING');
  await job.submit({hubOrderId:order,confirm:true});
  assert.deepEqual(f.calls,[['POST',{confirm:true,orderIds:[order]}]]);
  assert.equal(f.saved().requestId,requestId);
});
test('restore resumes by known request id using GET only',async()=>{
  const f=fixture(); let job=await createShipmentJob(f.options);
  await job.submit({hubOrderId:order,confirm:true}); job=await createShipmentJob(f.options);
  assert.equal((await job.poll()).status,'RUNNING');
  assert.deepEqual(f.calls.map(c=>c[0]),['POST','GET']);
});
test('lost POST response remains unknown across restart and cannot resubmit',async()=>{
  const f=fixture(); f.options.transport.submit=async()=>{f.calls.push(['POST']);throw Error('PRIVATE');};
  let job=await createShipmentJob(f.options);
  assert.equal((await job.submit({hubOrderId:order,confirm:true})).status,'UNKNOWN');
  job=await createShipmentJob(f.options);
  await job.submit({hubOrderId:order,confirm:true}); await job.poll();
  assert.equal(f.calls.length,1); assert.equal(job.snapshot().status,'UNKNOWN');
  assert.equal(JSON.stringify(f.saved()).includes('PRIVATE'),false);
});
test('timeout after submission does not accept a late successful response or retry',async()=>{
  const f=fixture(); let finish;
  f.options.transport.submit=()=>{f.calls.push(['POST']);return new Promise(resolve=>{finish=resolve;});};
  const job=await createShipmentJob(f.options);
  assert.equal((await job.submit({hubOrderId:order,confirm:true})).status,'UNKNOWN');
  finish({status:202,body:{ok:true,results:[{hubOrderId:order,ok:true,request:{id:requestId,status:'PENDING'}}]}});
  await Promise.resolve(); await job.submit({hubOrderId:order,confirm:true});
  assert.equal(job.snapshot().status,'UNKNOWN'); assert.equal(f.calls.length,1);
});
test('failure to persist intent stops network dispatch',async()=>{
  const f=fixture();f.options.store.write=async()=>{throw Error('DISK');};
  const job=await createShipmentJob(f.options);
  assert.equal((await job.submit({hubOrderId:order,confirm:true})).status,'STORAGE_ERROR');
  assert.equal(f.calls.length,0);
});
test('successful acceptance with failed persistence locks further actions',async()=>{
  const f=fixture();let writes=0;const write=f.options.store.write;
  f.options.store.write=async value=>{if(++writes===2)throw Error('DISK');await write(value);};
  const job=await createShipmentJob(f.options);
  assert.equal((await job.submit({hubOrderId:order,confirm:true})).status,'STORAGE_ERROR');
  await job.submit({hubOrderId:order,confirm:true});assert.equal(f.calls.length,1);
  const restarted=await createShipmentJob(f.options);assert.equal(restarted.snapshot().status,'UNKNOWN');
});
test('foreign business or corrupt journal fails closed without requests',async()=>{
  for(const saved of [{version:1,businessId:'other',hubOrderId:order,status:'PENDING',requestId}, {}, 'broken',
    {version:1,businessId:'harin',hubOrderId:[order],status:'PENDING',requestId},
    {version:1,businessId:'harin',hubOrderId:order,status:'PENDING',requestId:[requestId]}]) {
    const f=fixture();f.options.store.read=async()=>saved;
    const job=await createShipmentJob(f.options);
    assert.equal(job.snapshot().status,'STORAGE_ERROR');
    await job.submit({hubOrderId:order,confirm:true});await job.poll();assert.equal(f.calls.length,0);
  }
});
test('unmatched or malformed POST acknowledgement is not trusted and cannot resubmit',async()=>{
  for(const body of [{ok:false},{ok:true,results:[]},
    {ok:true,results:[{ok:true,hubOrderId:'HR-CP-1234ABCD',request:{id:requestId,status:'PENDING'}}]},
    {ok:true,results:[{ok:true,hubOrderId:order,request:{id:[requestId],status:'PENDING'}}]}]) {
    const f=fixture();f.options.transport.submit=async()=>{f.calls.push(['POST']);return {status:202,body};};
    const job=await createShipmentJob(f.options);
    assert.equal((await job.submit({hubOrderId:order,confirm:true})).status,'UNKNOWN');
    await job.submit({hubOrderId:order,confirm:true});assert.equal(f.calls.length,1);
  }
});
test('concurrent poll is single-flight and cannot dispatch another GET',async()=>{
  const f=fixture(),job=await createShipmentJob(f.options);await job.submit({hubOrderId:order,confirm:true});
  let finish;f.options.transport.poll=()=>{f.calls.push(['GET']);return new Promise(resolve=>{finish=resolve;});};
  const first=job.poll();await Promise.resolve();await job.poll();
  finish({status:202,body:{ok:true,request:{id:requestId,hubOrderId:order,status:'RUNNING'}}});
  assert.equal((await first).status,'RUNNING');assert.deepEqual(f.calls.map(c=>c[0]),['POST','GET']);
});
test('poll requires matching request and order plus valid invoice before success',async()=>{
  for(const change of [{request:{id:requestId,hubOrderId:'HR-CP-1234ABCD',status:'SUCCESS'}},{result:{trackingNo:'bad'}},{request:{id:'wrong',hubOrderId:order,status:'SUCCESS'}}]) {
    const f=fixture(),job=await createShipmentJob(f.options);await job.submit({hubOrderId:order,confirm:true});
    f.options.transport.poll=async()=>({status:200,body:{ok:true,request:{id:requestId,hubOrderId:order,status:'SUCCESS'},result:{trackingNo:'1234567890123'},...change}});
    assert.equal((await job.poll()).status,'UNKNOWN');
    await job.submit({hubOrderId:order,confirm:true});assert.equal(f.calls.length,1);
  }
});
test('confirmed success is terminal and raw carrier data is not persisted',async()=>{
  const f=fixture(),job=await createShipmentJob(f.options);await job.submit({hubOrderId:order,confirm:true});
  f.options.transport.poll=async()=>({status:200,body:{ok:true,request:{id:requestId,hubOrderId:order,status:'SUCCESS'},result:{trackingNo:'1234567890123',receiver:'PRIVATE'}}});
  assert.equal((await job.poll()).status,'SUCCEEDED');
  const stored=JSON.stringify(f.saved());assert.equal(stored.includes('PRIVATE'),false);assert.equal(stored.includes('1234567890123'),false);
  await job.poll();await job.submit({hubOrderId:order,confirm:true});assert.equal(f.calls.length,1);
});
test('failed and cancelled jobs never automatically restart',async()=>{
  for(const status of ['FAILED','CANCELLED']) {
    const f=fixture(),job=await createShipmentJob(f.options);await job.submit({hubOrderId:order,confirm:true});
    f.options.transport.poll=async()=>({status:409,body:{ok:false,request:{id:requestId,hubOrderId:order,status}}});
    assert.equal((await job.poll()).status,status);await job.submit({hubOrderId:order,confirm:true});assert.equal(f.calls.length,1);
  }
});
test('a denied poll can be checked again but never triggers POST',async()=>{
  const f=fixture(),job=await createShipmentJob(f.options);await job.submit({hubOrderId:order,confirm:true});
  const poll=f.options.transport.poll;
  f.options.transport.poll=async()=>({status:401,body:{ok:false}});
  assert.equal((await job.poll()).status,'UNKNOWN');assert.equal(job.snapshot().requestId,requestId);
  f.options.transport.poll=poll;assert.equal((await job.poll()).status,'RUNNING');
  assert.deepEqual(f.calls.map(c=>c[0]),['POST','GET']);
});
