'use strict';
const fs=require('node:fs/promises'),path=require('node:path');
const {createHash,randomUUID}=require('node:crypto');
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
// Main-owned Harin storage. Intent is durable before any action POST. There is
// deliberately no reset/retry operation for unknown or failed transmissions.
function createShippingActionJournal({directory,hubOrderId,action,fingerprint}){
 if(typeof directory!=='string'||!path.isAbsolute(directory)||!/^HR-(?:C24|CP)-[A-F0-9]{8}$/.test(hubOrderId)||!['PREPARE','ISSUE','UPLOAD_INVOICE'].includes(action)||typeof fingerprint!=='string'||!/^[a-f0-9]{64}$/.test(fingerprint))throw Error('Invalid action journal');
 const folder=path.join(directory,'automatic-actions');
 const filename=path.join(folder,createHash('sha256').update(JSON.stringify(['harin',hubOrderId,action])).digest('hex')+'.json');
 const matches=row=>row&&Object.keys(row).sort().join(',')==='action,businessId,fingerprint,hubOrderId,requestId,status,version'&&row.version===1&&row.businessId==='harin'&&row.hubOrderId===hubOrderId&&row.action===action&&row.fingerprint===fingerprint&&['INTENT','PENDING','RUNNING','SUCCESS','FAILED','UNKNOWN'].includes(row.status)&&(row.requestId===null||typeof row.requestId==='string'&&UUID.test(row.requestId));
 return Object.freeze({
  async read(){
   let handle;
   try{handle=await fs.open(filename,'r');const bytes=Buffer.alloc(4097);let used=0;while(used<bytes.length){const item=await handle.read(bytes,used,bytes.length-used,null);if(!item.bytesRead)break;used+=item.bytesRead;}if(used>4096)throw Error();const row=JSON.parse(bytes.subarray(0,used).toString('utf8'));if(!matches(row))throw Error();return row;}
   catch(error){if(error.code==='ENOENT')return null;throw Error('Action journal unavailable');}finally{await handle?.close();}
  },
  async write({status,requestId=null}){
   const row={version:1,businessId:'harin',hubOrderId,action,fingerprint,status,requestId};if(!matches(row))throw Error('Invalid action record');
   await fs.mkdir(folder,{recursive:true});const temporary=filename+'.'+randomUUID()+'.tmp';let handle;
   try{handle=await fs.open(temporary,'wx',0o600);await handle.writeFile(JSON.stringify(row),'utf8');await handle.sync();await handle.close();handle=null;await fs.rename(temporary,filename);}
   finally{await handle?.close();await fs.unlink(temporary).catch(()=>{});}
   return row;
  },
 });
}
module.exports={createShippingActionJournal};
