'use strict';
const CS_URL='https://harin-cafe24-sync.vercel.app/api/moaon/businesses/a3452bca-e259-40ed-a93d-b8bcc5c1b9e0/cs';
const empty=status=>({status,items:[],generatedAt:null,truncated:false});
function project(p){
 if(p?.ok!==true||p.status!=='READY'||p.writePolicy!=='READ_ONLY'||typeof p.generatedAt!=='string'||!Number.isFinite(Date.parse(p.generatedAt))||typeof p.truncated!=='boolean'||!Array.isArray(p.items)||p.items.length>200)throw Error('Invalid CS');
 const ids=new Set();return {status:'READY',generatedAt:p.generatedAt,truncated:p.truncated,items:p.items.map(r=>{
 if(typeof r?.id!=='string'||!r.id||r.id.length>240||ids.has(r.id)||!['NAVER','CAFE24','COUPANG'].includes(r.platform)||!r.id.startsWith(r.platform+':')||!['INQUIRY','CANCEL','RETURN','EXCHANGE'].includes(r.kind)||typeof r.status!=='string'||r.status.length>80||!(r.occurredAt===null||typeof r.occurredAt==='string'&&Number.isFinite(Date.parse(r.occurredAt))))throw Error('Invalid CS item');ids.add(r.id);
 return {id:r.id,platform:r.platform,kind:r.kind,status:r.status,occurredAt:r.occurredAt};})};
}
function createCsTransport({fetch,timeoutMs=30000}={}){
 if(typeof fetch!=='function'||!Number.isInteger(timeoutMs)||timeoutMs<1||timeoutMs>30000)throw TypeError('Invalid transport');
 return async({signal}={})=>{
  if(signal?.aborted)return empty('CANCELLED');const controller=new AbortController();let timer,reader,stop;
  const cancelled=new Promise(resolve=>{stop=()=>{controller.abort();resolve(empty('CANCELLED'));};});signal?.addEventListener('abort',stop,{once:true});
  const run=async()=>{try{
   const res=await fetch(CS_URL,{method:'GET',credentials:'include',cache:'no-store',redirect:'error',signal:controller.signal});
   if(res.status!==200)return empty(({401:'LOGIN_REQUIRED',403:'FORBIDDEN',504:'TIMEOUT'})[res.status]||'UNAVAILABLE');
   if(res.redirected||res.url&&res.url!==CS_URL||Number(res.headers.get('content-length'))>262144)throw Error('Response');
   reader=res.body?.getReader();if(!reader)throw Error('Body');let size=0;const chunks=[];
   while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>262144)throw Error('Size');chunks.push(value);}
   const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
   return project(JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes)));
  }catch{return empty('UNAVAILABLE');}};
  try{return await Promise.race([run(),cancelled,new Promise(resolve=>{timer=setTimeout(()=>{controller.abort();resolve(empty('TIMEOUT'));},timeoutMs);})]);}finally{clearTimeout(timer);signal?.removeEventListener('abort',stop);controller.abort();try{reader?.cancel().catch(()=>{});}catch{}}
 };
}
module.exports={createCsTransport,CS_URL};
