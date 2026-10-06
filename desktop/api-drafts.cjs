const fs=require('node:fs/promises');
const path=require('node:path');
const {randomUUID}=require('node:crypto');

const PROVIDERS=Object.freeze({CAFE24:['mallId','clientId','clientSecret'],NAVER:['clientId','clientSecret'],COUPANG:['vendorId','accessKey','secretKey'],EPOST:['customerId','apiKey','securityKey','approvalNo','officeSerial','trackingApiKey']});
const MAX_BYTES=1024*1024;
const unavailable=()=>new Error('API_DRAFT_UNAVAILABLE');
const validTenant=value=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
const identity=row=>JSON.stringify([row.tenantId?'tenant':'local',row.tenantId||row.business,row.provider]);
function exact(value,keys){return value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).length===keys.length&&keys.every(key=>Object.hasOwn(value,key));}
function text(value,max){return typeof value==='string'&&value.trim().length>0&&value.length<=max&&!/[\u0000-\u001f\u007f-\u009f]/u.test(value);}
function validate(value,{allowLegacy=false}={}){
 const bound=value&&Object.hasOwn(value,'tenantId');
 if(!exact(value,bound?['business','provider','fields','tenantId']:['business','provider','fields'])||(bound&&!validTenant(value.tenantId))||!text(value.business,bound?256:80)||typeof value.provider!=='string'||!Object.hasOwn(PROVIDERS,value.provider))throw unavailable();
 const legacy=allowLegacy&&value.provider==='EPOST'&&exact(value.fields,['customerId','apiKey']);
 const keys=legacy?['customerId','apiKey']:PROVIDERS[value.provider];
 if(!exact(value.fields,keys)||!keys.every(key=>key==='trackingApiKey'&&value.fields[key]===''||text(value.fields[key],2048)))throw unavailable();
 if(value.provider==='EPOST'&&!legacy&&Buffer.byteLength(value.fields.securityKey,'utf8')!==16)throw unavailable();
 return {business:value.business,provider:value.provider,fields:Object.fromEntries(keys.map(key=>[key,value.fields[key]])),...(bound?{tenantId:value.tenantId.toLowerCase()}:{})};
}
function metadata(row){return {business:row.business,provider:row.provider,status:row.provider==='EPOST'&&!row.fields.securityKey?'CONFIGURATION_REQUIRED':'SAVED_UNVERIFIED',...(row.tenantId?{tenantId:row.tenantId}:{})};}

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
  const rows=document.records.map(row=>validate(row,{allowLegacy:true})),keys=new Set(rows.map(identity));
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
   let key;
   try{const bound=value&&Object.hasOwn(value,'tenantId');if(!exact(value,bound?['business','provider','tenantId']:['business','provider'])||(bound&&!validTenant(value.tenantId))||!text(value.business,bound?256:80)||typeof value.provider!=='string'||!Object.hasOwn(PROVIDERS,value.provider))throw unavailable();key=identity({...value,...(bound?{tenantId:value.tenantId.toLowerCase()}:{})});}catch{return Promise.reject(unavailable());}
   return serialize(async()=>{const rows=await read(),remaining=rows.filter(row=>identity(row)!==key);if(remaining.length!==rows.length)await write(remaining);return remaining.map(metadata);});
  },
  save(value){
   let row;try{row=validate(value);}catch{return Promise.reject(unavailable());}
   return serialize(async()=>{
    const rows=await read(),index=rows.findIndex(item=>identity(item)===identity(row));
    if(index<0){if(rows.length>=50)throw unavailable();rows.push(row);}else rows[index]=row;
    await write(rows);
    return metadata(row);
   });
  }
 };
}

function registerApiDrafts({ipcMain,getMainWindow,isTrustedRenderer,store,listBusinesses}){
 async function saveOwned(value){
  if(!exact(value,['tenantId','provider','fields'])||!validTenant(value.tenantId))throw unavailable();
  const input=validate({business:'pending',...value});
  const result=await listBusinesses();
  const business=result?.status==='READY'&&result.businesses.find(row=>row.tenantId.toLowerCase()===input.tenantId&&row.role==='OWNER');
  if(!business)throw unavailable();
  // This binds only a local draft, not a reusable server authorization grant.
  return store.save({...input,business:business.displayName});
 }
 for(const [channel,count,operation] of [['moaon-hub:save-owned-api-draft',1,saveOwned],['moaon-hub:save-api-draft',1,value=>{if(!exact(value,['business','provider','fields']))throw unavailable();return store.save(value);}],['moaon-hub:list-api-drafts',0,()=>store.list()],['moaon-hub:remove-api-draft',1,value=>store.remove(value)]]){
  ipcMain.handle(channel,async(event,...args)=>{
   try{if(args.length!==count||!isTrustedRenderer(event,getMainWindow()))throw unavailable();return await operation(...args);}catch{throw unavailable();}
  });
 }
}
module.exports={createDraftStore,registerApiDrafts};
