'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {createShipmentRegistry}=require('../shipment-registry.cjs');
const first='HR-C24-1234ABCD',second='HR-CP-87654321';
const requestId='a2345678-1234-4234-8234-123456789012';
const {createShipmentJournal}=require('../shipment-journal.cjs');

test('concurrent clicks send each order once; restart never resubmits uncertain orders',async()=>{
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'moaon-registry-test-'));
  try {
    const sent=[];
    const options={directory,businessId:'harin',createTransport:hubOrderId=>({
      submit:async()=>{sent.push(hubOrderId);throw Error('response lost');},
      poll:async()=>assert.fail('no request ID'),
    })};
    let registry=createShipmentRegistry(options);
    await Promise.all([registry.submit(first,{confirm:true}),registry.submit(first,{confirm:true}),registry.submit(second,{confirm:true})]);
    assert.deepEqual(sent.sort(),[first,second].sort());
    assert.equal((await registry.snapshot(first)).status,'UNKNOWN');
    await registry.suspend();
    registry=createShipmentRegistry(options);
    await registry.submit(first,{confirm:true});
    await registry.submit(second,{confirm:true});
    assert.equal(sent.length,2);
    await registry.suspend();
  } finally {await fs.rm(directory,{recursive:true,force:true});}
});

test('completed order remains terminal while another order can be submitted and polled',async()=>{
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'moaon-registry-test-'));
  try {
    const sent=[];
    const registry=createShipmentRegistry({directory,businessId:'harin',createTransport:hubOrderId=>({
      submit:async()=>{sent.push(hubOrderId);return {status:202,body:{ok:true,results:[{ok:true,hubOrderId,request:{id:requestId,status:'PENDING'}}]}};},
      poll:async()=>({status:200,body:{ok:true,request:{id:requestId,hubOrderId,status:'SUCCESS'},result:{trackingNo:'1234567890123'}}}),
    })});
    assert.equal((await registry.submit(first,{confirm:true})).status,'PENDING');
    assert.equal((await registry.poll(first)).status,'SUCCEEDED');
    assert.equal((await registry.submit(second,{confirm:true})).status,'PENDING');
    assert.equal((await registry.poll(second)).status,'SUCCEEDED');
    await registry.submit(first,{confirm:true});
    assert.equal(sent.length,2);
    await registry.suspend();
  } finally {await fs.rm(directory,{recursive:true,force:true});}
});

test('suspend fences pending initialization and aborted network work before replacement',async()=>{
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'moaon-registry-test-'));
  try {
    let sent=0,started;
    const began=new Promise(resolve=>{started=resolve;});
    const options={directory,businessId:'harin',createTransport:()=>({
      submit:async(_input,{signal})=>{sent++;started(signal);return new Promise(()=>{});},
      poll:async()=>assert.fail('no poll'),
    })};
    let registry=createShipmentRegistry(options);
    const early=registry.submit(first,{confirm:true});
    await registry.suspend();
    assert.equal((await early).status,'DISCONNECTED');
    assert.equal(sent,0);
    registry=createShipmentRegistry(options);
    const sending=registry.submit(first,{confirm:true});
    const signal=await began;
    await registry.suspend();
    assert.equal(signal.aborted,true);
    assert.deepEqual(await sending,{status:'DISCONNECTED',hubOrderId:null,requestId:null});
    assert.equal((await registry.submit(second,{confirm:true})).status,'DISCONNECTED');
    registry=createShipmentRegistry(options);
    assert.equal((await registry.snapshot(first)).status,'UNKNOWN');
    await registry.submit(first,{confirm:true});
    assert.equal(sent,1);
    await registry.suspend();
  } finally {await fs.rm(directory,{recursive:true,force:true});}
});

test('invalid identifiers and corrupt legacy records never reach transport',async()=>{
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'moaon-registry-test-'));
  try {
    const registry=createShipmentRegistry({directory,businessId:'harin',createTransport:()=>({submit:async()=>assert.fail('blocked'),poll:async()=>assert.fail('blocked')})});
    for(const id of [null,{},'../../other','HR-NV-1234ABCD'])await assert.rejects(()=>registry.submit(id,{confirm:true}));
    await createShipmentJournal({directory,businessId:'harin'}).write({status:'corrupt'});
    assert.equal((await registry.submit(first,{confirm:true})).status,'STORAGE_ERROR');
    await registry.suspend();
  } finally {await fs.rm(directory,{recursive:true,force:true});}
});
