'use strict';
const fs=require('node:fs/promises');
const path=require('node:path');
const {createHash,randomUUID}=require('node:crypto');
const {isShipmentRecord}=require('./shipment-job.cjs');
const MAX_BYTES=4096;

// Host-owned private directory; never accept a path or business from renderer IPC.
// The host must own one registry, protected by Electron's single-instance lock.
// File sync + same-directory rename covers process interruption; this is not a
// guarantee against disk failure or power loss on every Windows filesystem.
function createShipmentJournal({directory,businessId}={}) {
  if(typeof directory!=='string'||!path.isAbsolute(directory)||typeof businessId!=='string'||!businessId||businessId.length>128) throw new TypeError('Invalid journal scope');
  const name=createHash('sha256').update(businessId).digest('hex')+'.json';
  return fileJournal(directory,name);
}

function createOrderShipmentJournal({directory,businessId,hubOrderId}={}) {
  const legacy=createShipmentJournal({directory,businessId});
  if(typeof hubOrderId!=='string'||!/^HR-(?:C24|CP)-[A-F0-9]{8}$/.test(hubOrderId))throw new TypeError('Invalid journal order');
  const name='order-'+createHash('sha256').update(JSON.stringify([businessId,hubOrderId])).digest('hex')+'.json';
  const current=fileJournal(directory,name);
  const matches=row=>isShipmentRecord(row,businessId)&&row.hubOrderId===hubOrderId;
  return Object.freeze({
    async read() {
      const row=await current.read();
      if(row!==null) {if(!matches(row))throw Error('Shipment journal scope mismatch');return row;}
      const prior=await legacy.read();
      if(prior===null)return null;
      if(!isShipmentRecord(prior,businessId))throw Error('Legacy shipment journal unavailable');
      // Keep the original file. Recovery never turns an uncertain old job into
      // a fresh order. A subsequent state save writes only the order file.
      return prior.hubOrderId===hubOrderId ? prior : null;
    },
    async write(row) {
      if(!matches(row))throw Error('Shipment journal scope mismatch');
      await current.write(row);
    },
  });
}

function fileJournal(directory,name) {
  const filename=path.join(directory,name);
  async function read() {
    let handle;
    try {
      handle=await fs.open(filename,'r');
      const bytes=Buffer.alloc(MAX_BYTES+1);
      let used=0;
      while(used<bytes.length) {
        const result=await handle.read(bytes,used,bytes.length-used,null);
        if(!result.bytesRead)break;
        used+=result.bytesRead;
      }
      if(used>MAX_BYTES)throw Error('Journal exceeds limit');
      const record=JSON.parse(bytes.subarray(0,used).toString('utf8'));
      if(record===null)throw Error('Invalid existing journal');
      return record;
    } catch(error) {if(error.code==='ENOENT')return null;throw Error('Shipment journal unavailable');}
    finally {await handle?.close();}
  }
  async function write(record) {
    const encoded=JSON.stringify(record);
    if(typeof encoded!=='string'||encoded==='null'||Buffer.byteLength(encoded)>MAX_BYTES)throw Error('Invalid shipment journal');
    await fs.mkdir(directory,{recursive:true});
    const temporary=path.join(directory,`${name}.${randomUUID()}.tmp`);
    let handle;
    try {
      handle=await fs.open(temporary,'wx',0o600);
      await handle.writeFile(encoded,'utf8');
      await handle.sync();
      await handle.close();handle=null;
      await fs.rename(temporary,filename);
    } catch {throw Error('Shipment journal unavailable');}
    finally {await handle?.close();await fs.unlink(temporary).catch(()=>{});}
  }
  return Object.freeze({read,write});
}
module.exports=Object.freeze({createShipmentJournal,createOrderShipmentJournal});
