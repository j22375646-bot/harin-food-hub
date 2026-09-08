'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const {createShippingActionJournal,readShippingHistory}=require('../shipping-action-journal.cjs');
test('history survives reopening and never returns fingerprints or request identifiers',async()=>{
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'moaon-history-'));
 try{
  const args={directory,hubOrderId:'HR-CP-1234ABCD',action:'ISSUE',fingerprint:'a'.repeat(64)};
  await createShippingActionJournal(args).write({status:'PENDING',requestId:'12345678-1234-4123-8123-123456789abc'});
  const result=await readShippingHistory(directory);
  assert.deepEqual(result,{status:'READY',orders:[{hubOrderId:args.hubOrderId,status:'CHECK_REQUIRED'}]});
  await createShippingActionJournal({...args,action:'UPLOAD_INVOICE'}).write({status:'SUCCESS'});
  assert.deepEqual(await readShippingHistory(directory),{status:'READY',orders:[]});
 }finally{await fs.rm(directory,{recursive:true,force:true});}
});
test('missing history is empty but corrupt history requires attention',async()=>{
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'moaon-history-'));
 try{
  assert.deepEqual(await readShippingHistory(directory),{status:'READY',orders:[]});
  await fs.mkdir(path.join(directory,'automatic-actions'));
  await fs.writeFile(path.join(directory,'automatic-actions','a'.repeat(64)+'.json'),'{}');
  assert.deepEqual(await readShippingHistory(directory),{status:'CHECK_REQUIRED',orders:[]});
 }finally{await fs.rm(directory,{recursive:true,force:true});}
});
