'use strict';
const {HARIN_ORIGIN}=require('./connection-policy.cjs');
const ENDPOINT=HARIN_ORIGIN+'/api/moaon/businesses';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const LIMIT=262144;
const result=(status,businesses=[])=>Object.freeze({status,businesses:Object.freeze(businesses)});
function createBusinessTransport({fetch,timeoutMs=15000}={}){
 if(typeof fetch!=='function'||!Number.isInteger(timeoutMs)||timeoutMs<1||timeoutMs>30000)throw TypeError('Invalid business transport');
 return async function read({signal}={}){
  if(signal?.aborted)return result('CANCELLED');
  const controller=new AbortController();let timer,reader,stop;
  const cancelled=new Promise(resolve=>{stop=()=>{controller.abort();resolve(result('CANCELLED'));};});
  signal?.addEventListener('abort',stop,{once:true});
  async function run(){
   try{
    const response=await fetch(ENDPOINT,{method:'GET',credentials:'include',cache:'no-store',redirect:'error',signal:controller.signal});
    if(response.status!==200)return result(({401:'LOGIN_REQUIRED',403:'FORBIDDEN',504:'TIMEOUT'})[response.status]||'UNAVAILABLE');
    if(response.redirected||(response.url&&response.url!==ENDPOINT))throw Error('Redirect');
    if(Number(response.headers.get('content-length'))>LIMIT)throw Error('Size');
    reader=response.body?.getReader();if(!reader)throw Error('Body');
    let size=0;const chunks=[];
    while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>LIMIT)throw Error('Size');chunks.push(value);}
    const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
    const payload=JSON.parse(new TextDecoder().decode(bytes));
    if(payload?.ok!==true||!Array.isArray(payload.businesses)||payload.businesses.length>200)throw Error('Payload');
    const seen=new Set();
    const businesses=payload.businesses.map(row=>{
     if(!row||!UUID.test(row.tenantId)||seen.has(row.tenantId.toLowerCase())||typeof row.displayName!=='string'||!row.displayName.trim()||row.displayName.length>256||!['OWNER','OPERATOR','VIEWER'].includes(row.role)||!Number.isSafeInteger(row.membershipVersion)||row.membershipVersion<1)throw Error('Row');
     seen.add(row.tenantId.toLowerCase());
     return Object.freeze({tenantId:row.tenantId,displayName:row.displayName,role:row.role,membershipVersion:row.membershipVersion});
    });
    return result('READY',businesses);
   }catch{return result('UNAVAILABLE');}
  }
  try{return await Promise.race([run(),cancelled,new Promise(resolve=>{timer=setTimeout(()=>{resolve(result('TIMEOUT'));controller.abort();},timeoutMs);})]);}
  finally{clearTimeout(timer);signal?.removeEventListener('abort',stop);controller.abort();try{reader?.cancel().catch(()=>{});}catch{}}
 };
}
module.exports=Object.freeze({createBusinessTransport});
