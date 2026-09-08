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
async function readShippingHistory(directory){
 const empty=status=>({status,orders:[]});
 if(typeof directory!=='string'||!path.isAbsolute(directory))return empty('CHECK_REQUIRED');
 const folder=path.join(directory,'automatic-actions'),groups=new Map();let count=0,opened=false;
 try{
  if(!(await fs.lstat(folder)).isDirectory())return empty('CHECK_REQUIRED');
  opened=true;
  const entries=await fs.opendir(folder);
  for await(const entry of entries){
   if(++count>500)return empty('CHECK_REQUIRED');
   if(!entry.name.endsWith('.json'))continue;
   if(!entry.isFile()||! /^[a-f0-9]{64}\.json$/.test(entry.name))return empty('CHECK_REQUIRED');
   const file=path.join(folder,entry.name);let handle;
   let row;
   try{handle=await fs.open(file,'r');const bytes=Buffer.alloc(4097);const {bytesRead}=await handle.read(bytes,0,bytes.length,0);if(bytesRead>4096)throw Error();row=JSON.parse(bytes.subarray(0,bytesRead).toString('utf8'));}
   finally{await handle?.close();}
   const expected=createHash('sha256').update(JSON.stringify(['harin',row.hubOrderId,row.action])).digest('hex')+'.json';
   if(expected!==entry.name)return empty('CHECK_REQUIRED');
   const verified=await createShippingActionJournal({directory,hubOrderId:row.hubOrderId,action:row.action,fingerprint:row.fingerprint}).read();
   if(!verified)return empty('CHECK_REQUIRED');
   const group=groups.get(row.hubOrderId)||new Map();group.set(verified.action,verified.status);groups.set(row.hubOrderId,group);
  }
  return {status:'READY',orders:[...groups].filter(([,group])=>group.get('UPLOAD_INVOICE')!=='SUCCESS').map(([hubOrderId])=>({hubOrderId,status:'CHECK_REQUIRED'})).sort((a,b)=>a.hubOrderId.localeCompare(b.hubOrderId))};
 }catch(error){return empty(error.code==='ENOENT'&&!opened?'READY':'CHECK_REQUIRED');}
}
module.exports={createShippingActionJournal,readShippingHistory};
