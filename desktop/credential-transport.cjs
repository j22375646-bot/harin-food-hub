'use strict';
const {performance}=require('node:perf_hooks');
const {HARIN_ORIGIN}=require('./connection-policy.cjs');
const ENDPOINT=HARIN_ORIGIN+'/api/moaon/credentials';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PROVIDERS={CAFE24:['mallId','clientId','clientSecret'],NAVER:['clientId','clientSecret'],COUPANG:['vendorId','accessKey','secretKey'],EPOST:['customerId','apiKey','securityKey','approvalNo','officeSerial','trackingApiKey']};
const exact=(value,keys)=>value&&Object.getPrototypeOf(value)===Object.prototype&&Object.keys(value).length===keys.length&&keys.every(k=>Object.hasOwn(value,k));
const empty=status=>Object.freeze({status});
function validCredentialInput(value,write=false){
 if(!exact(value,write?['tenantId','provider','expectedRevision','fields']:['tenantId','provider'])||typeof value.tenantId!=='string'||!UUID.test(value.tenantId)||typeof value.provider!=='string'||!Object.hasOwn(PROVIDERS,value.provider))return false;
 if(!write)return true;
 if(!Number.isInteger(value.expectedRevision)||value.expectedRevision<0||value.expectedRevision>=2147483647||!exact(value.fields,PROVIDERS[value.provider]))return false;
 return PROVIDERS[value.provider].every(key=>typeof value.fields[key]==='string'&&value.fields[key].length<=2048&&!/[\u0000-\u001f\u007f-\u009f]/u.test(value.fields[key])&&(key==='trackingApiKey'||value.fields[key].trim().length>0))&&(value.provider!=='EPOST'||Buffer.byteLength(value.fields.securityKey,'utf8')===16);
}
function credentialUrl(input,write=false){return write?ENDPOINT:ENDPOINT+'?tenantId='+input.tenantId.toLowerCase()+'&provider='+input.provider;}
function createCredentialTransport({fetch,authorize,permit,blocked=()=>false,timeoutMs=30000}={}){
 if(typeof fetch!=='function'||typeof authorize!=='function'||typeof permit!=='function'||typeof blocked!=='function'||!Number.isInteger(timeoutMs)||timeoutMs<1||timeoutMs>30000)throw TypeError('Invalid credential transport');
 let active=null;
 async function run(value,write){
  if(!validCredentialInput(value,write))return empty('INVALID');
  if(active||blocked())return empty('BUSY');
  // Snapshot secrets synchronously; never retain them in connection state or IPC results.
  const input={tenantId:value.tenantId.toLowerCase(),provider:value.provider,...(write?{expectedRevision:value.expectedRevision,fields:{...value.fields}}:{})};
  const controller=new AbortController(),operation={controller};active=operation;
  const deadline=performance.now()+timeoutMs;let stopped=false,dispatched=false,timer,reader,abortHandler;
  const uncertain=()=>empty(write&&dispatched?'RESULT_UNKNOWN':'UNAVAILABLE');
  const check=()=>{if(stopped||controller.signal.aborted||active!==operation||performance.now()>=deadline||blocked())throw Error('Stopped');};
  async function body(response){
   if(Number(response.headers?.get?.('content-length'))>16384)throw Error('Size');
   reader=response.body?.getReader?.();if(!reader)throw Error('Body');const chunks=[];let size=0;
   while(true){check();const {done,value:part}=await reader.read();check();if(done)break;size+=part.byteLength;if(size>16384)throw Error('Size');chunks.push(part);}
   return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks)));
  }
  const task=async()=>{try{
   check();const proof=await authorize({signal:controller.signal});check();
   if(proof?.status!=='READY')return empty(['LOGIN_REQUIRED','FORBIDDEN','ACCESS_DENIED'].includes(proof?.status)?'ACCESS_DENIED':'UNAVAILABLE');
   if(!Array.isArray(proof.businesses)||!proof.businesses.some(row=>typeof row?.tenantId==='string'&&row.tenantId.toLowerCase()===input.tenantId&&row.role==='OWNER'))return empty('ACCESS_DENIED');
   const url=credentialUrl(input,write),method=write?'POST':'GET';check();permit({url,method});check();
   dispatched=true;
   const response=await fetch(url,{method,credentials:'include',cache:'no-store',redirect:'error',signal:controller.signal,headers:{Origin:HARIN_ORIGIN,...(write?{'Content-Type':'application/json'}:{})},...(write?{body:JSON.stringify(input)}:{})});check();
   if(response.redirected||response.url&&response.url!==url)throw Error('Redirect');
   const known={401:'ACCESS_DENIED',403:'ACCESS_DENIED',404:'SETUP_REQUIRED',429:'RATE_LIMITED',409:'CONFLICT',400:'INVALID',405:'INVALID',415:'INVALID'};
   if(Object.hasOwn(known,response.status))return empty(known[response.status]);
   const payload=await body(response);check();
   if(response.status!==200){if(response.status===503&&payload?.code==='SETUP_REQUIRED')return empty('SETUP_REQUIRED');if(response.status===503&&payload?.code==='CREDENTIAL_ADMISSION_UNAVAILABLE')return empty('UNAVAILABLE');return uncertain();}
   if(payload?.ok!==true||payload.tenantId!==input.tenantId||payload.provider!==input.provider||!Number.isInteger(payload.revision)||payload.revision<0||payload.revision>2147483647||payload.status!==(payload.revision===0?'NOT_SAVED':'SAVED_UNVERIFIED')||write&&payload.revision!==input.expectedRevision+1)throw Error('Metadata');
   return Object.freeze({tenantId:payload.tenantId,provider:payload.provider,revision:payload.revision,status:payload.status});
  }catch{return uncertain();}};
  try{
   const cancelled=new Promise(resolve=>{abortHandler=()=>{stopped=true;resolve(uncertain());};controller.signal.addEventListener('abort',abortHandler,{once:true});});
   const timeout=new Promise(resolve=>{timer=setTimeout(()=>{stopped=true;controller.abort();resolve(uncertain());},timeoutMs);});
   return await Promise.race([task(),cancelled,timeout]);
  }finally{stopped=true;clearTimeout(timer);controller.signal.removeEventListener('abort',abortHandler);controller.abort();try{reader?.cancel().catch(()=>{});}catch{}if(input.fields)for(const key of Object.keys(input.fields))input.fields[key]='';permit(null);if(active===operation)active=null;}
 }
 return Object.freeze({read:value=>run(value,false),save:value=>run(value,true),cancel:()=>active?.controller.abort()});
}
module.exports=Object.freeze({createCredentialTransport,validCredentialInput,credentialUrl});
