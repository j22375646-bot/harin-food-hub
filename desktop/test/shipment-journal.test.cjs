'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {createShipmentJournal}=require('../shipment-journal.cjs');
const {createShipmentJob}=require('../shipment-job.cjs');
const order='HR-C24-1234ABCD';
test('actual disk journal recovers unknown submission after app process replacement',async()=>{
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'moaon-journal-test-'));
  try {
    let writes=0;
    const options={businessId:'harin',store:createShipmentJournal({directory,businessId:'harin'}),transport:{submit:async()=>{writes++;throw Error('offline');},poll:async()=>{throw Error('should not poll');}}};
    let job=await createShipmentJob(options);await job.submit({hubOrderId:order,confirm:true});
    job=await createShipmentJob({...options,store:createShipmentJournal({directory,businessId:'harin'})});
    assert.equal(job.snapshot().status,'UNKNOWN');await job.submit({hubOrderId:order,confirm:true});assert.equal(writes,1);
    const files=await fs.readdir(directory);assert.equal(files.length,1);assert.ok(files[0].endsWith('.json'));
    assert.equal((await createShipmentJournal({directory,businessId:'dumor'}).read()),null);
  } finally {await fs.rm(directory,{recursive:true,force:true});}
});
test('corrupt or oversized existing journal blocks rather than starting fresh',async()=>{
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'moaon-journal-test-'));
  try {
    const store=createShipmentJournal({directory,businessId:'harin'});
    await store.write({version:1,businessId:'harin',hubOrderId:order,requestId:null,status:'SUBMITTING'});
    const [name]=await fs.readdir(directory);
    for(const content of ['broken','null','x'.repeat(9000)]) {
      await fs.writeFile(path.join(directory,name),content);
      const job=await createShipmentJob({businessId:'harin',store,transport:{submit:async()=>assert.fail('must not submit'),poll:async()=>assert.fail('must not poll')}});
      assert.equal(job.snapshot().status,'STORAGE_ERROR');await job.submit({hubOrderId:order,confirm:true});
    }
  } finally {await fs.rm(directory,{recursive:true,force:true});}
});
test('business input cannot escape trusted journal directory and oversized writes preserve prior record',async()=>{
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'moaon-journal-test-'));
  try {
    const store=createShipmentJournal({directory,businessId:'../business/name'});
    await store.write({status:'before'});
    await assert.rejects(()=>store.write(null));
    await assert.rejects(()=>store.write({data:'x'.repeat(9000)}));
    assert.deepEqual(await store.read(),{status:'before'});
    const files=await fs.readdir(directory);assert.equal(files.length,1);assert.match(files[0],/^[a-f0-9]{64}\.json$/);
  } finally {await fs.rm(directory,{recursive:true,force:true});}
});
