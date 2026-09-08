'use strict';
const fs=require('node:fs/promises');
const path=require('node:path');
const {createHash,randomUUID}=require('node:crypto');
const MAX_BYTES=4096;

// Host-owned private directory; never accept a path or business from renderer IPC.
// One live job/controller per business, protected by Electron's single-instance lock.
// File sync + same-directory rename covers process interruption; this is not a
// guarantee against disk failure or power loss on every Windows filesystem.
function createShipmentJournal({directory,businessId}={}) {
  if(typeof directory!=='string'||!path.isAbsolute(directory)||typeof businessId!=='string'||!businessId||businessId.length>128) throw new TypeError('Invalid journal scope');
  const name=createHash('sha256').update(businessId).digest('hex')+'.json';
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
module.exports=Object.freeze({createShipmentJournal});
