const fs=require('node:fs/promises');
const path=require('node:path');
const {randomUUID}=require('node:crypto');

const PROVIDERS=Object.freeze({CAFE24:['mallId','clientId','clientSecret'],NAVER:['clientId','clientSecret'],COUPANG:['vendorId','accessKey','secretKey'],EPOST:['customerId','apiKey']});
const MAX_BYTES=1024*1024;
const unavailable=()=>new Error('API_DRAFT_UNAVAILABLE');
function exact(value,keys){return value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).length===keys.length&&keys.every(key=>Object.hasOwn(value,key));}
function text(value,max){return typeof value==='string'&&value.trim().length>0&&value.length<=max&&!/[\u0000-\u001f\u007f-\u009f]/u.test(value);}
function validate(value){
 if(!exact(value,['business','provider','fields'])||!text(value.business,80)||typeof value.provider!=='string'||!Object.hasOwn(PROVIDERS,value.provider))throw unavailable();
 const keys=PROVIDERS[value.provider];
 if(!exact(value.fields,keys)||!keys.every(key=>text(value.fields[key],2048)))throw unavailable();
 return {business:value.business,provider:value.provider,fields:Object.fromEntries(keys.map(key=>[key,value.fields[key]]))};
}
function metadata(row){return {business:row.business,provider:row.provider,status:'SAVED_UNVERIFIED'};}

// Local labels identify drafts only. They never grant access to a server tenant.
function createDraftStore({directory,safeStorage,platform='win32'}){
 const target=path.join(directory,'api-drafts.encrypted');
 let pending=Promise.resolve();
 function available(){if(platform!=='win32'||!safeStorage?.isEncryptionAvailable())throw unavailable();}
 function serialize(operation){const next=pending.then(operation).catch(()=>{throw unavailable();});pending=next.catch(()=>{});return next;}
 async function read(){
  available();
  let info;try{info=await fs.lstat(target);}catch(error){if(error.code==='ENOENT')return [];throw error;}
  if(!info.isFile()||info.isSymbolicLink()||info.size===0||info.size>MAX_BYTES)throw unavailable();
  const handle=await fs.open(target,'r');let data;
  try{const buffer=Buffer.alloc(MAX_BYTES+1);let used=0;while(used<buffer.length){const {bytesRead}=await handle.read(buffer,used,buffer.length-used,null);if(!bytesRead)break;used+=bytesRead;}if(used===0||used>MAX_BYTES)throw unavailable();data=buffer.subarray(0,used);}finally{await handle.close();}
  const decoded=safeStorage.decryptString(data);
  if(typeof decoded!=='string'||Buffer.byteLength(decoded)>MAX_BYTES)throw unavailable();
  const document=JSON.parse(decoded);
  if(!exact(document,['version','records'])||document.version!==1||!Array.isArray(document.records)||document.records.length>50)throw unavailable();
  const rows=document.records.map(validate),keys=new Set(rows.map(row=>JSON.stringify([row.business,row.provider])));
  if(keys.size!==rows.length)throw unavailable();
  return rows;
 }
 async function write(rows){
  const encrypted=safeStorage.encryptString(JSON.stringify({version:1,records:rows}));
  if(!Buffer.isBuffer(encrypted)||!encrypted.length||encrypted.length>MAX_BYTES)throw unavailable();
  await fs.mkdir(directory,{recursive:true});
  const temporary=path.join(directory,`api-drafts-${randomUUID()}.tmp`);
  try{const handle=await fs.open(temporary,'wx',0o600);try{await handle.writeFile(encrypted);await handle.sync();}finally{await handle.close();}await fs.rename(temporary,target);}finally{await fs.unlink(temporary).catch(()=>{});}
 }
 return {
  list(){return serialize(async()=>(await read()).map(metadata));},
  remove(value){
   let business,provider;
   try{if(!exact(value,['business','provider'])||!text(value.business,80)||typeof value.provider!=='string'||!Object.hasOwn(PROVIDERS,value.provider))throw unavailable();({business,provider}=value);}catch{return Promise.reject(unavailable());}
   return serialize(async()=>{const rows=await read(),remaining=rows.filter(row=>row.business!==business||row.provider!==provider);if(remaining.length!==rows.length)await write(remaining);return remaining.map(metadata);});
  },
  save(value){
   let row;try{row=validate(value);}catch{return Promise.reject(unavailable());}
   return serialize(async()=>{
    const rows=await read(),index=rows.findIndex(item=>item.business===row.business&&item.provider===row.provider);
    if(index<0){if(rows.length>=50)throw unavailable();rows.push(row);}else rows[index]=row;
    await write(rows);
    return metadata(row);
   });
  }
 };
}

function registerApiDrafts({ipcMain,getMainWindow,isTrustedRenderer,store}){
 for(const [channel,count,operation] of [['moaon-hub:save-api-draft',1,value=>store.save(value)],['moaon-hub:list-api-drafts',0,()=>store.list()],['moaon-hub:remove-api-draft',1,value=>store.remove(value)]]){
  ipcMain.handle(channel,async(event,...args)=>{
   try{if(args.length!==count||!isTrustedRenderer(event,getMainWindow()))throw unavailable();return await operation(...args);}catch{throw unavailable();}
  });
 }
}
module.exports={createDraftStore,registerApiDrafts};
