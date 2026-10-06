'use strict';
const CS_URL='https://harin-cafe24-sync.vercel.app/api/moaon/businesses/a3452bca-e259-40ed-a93d-b8bcc5c1b9e0/cs';
const empty=status=>({status,items:[],generatedAt:null,truncated:false});
function details(d){
 if(d===undefined)return null;
 const string=(s,max)=>typeof s==='string'&&s.length<=max;
 const date=s=>s===null||typeof s==='string'&&Number.isFinite(Date.parse(s));
 if(!d||!['AVAILABLE','MISSING','UNAVAILABLE'].includes(d.status)||!string(d.title,200)||!string(d.body,2000)||!Array.isArray(d.history)||d.history.length>5||typeof d.truncated!=='boolean'||!date(d.updatedAt))throw Error('Invalid CS detail');
 const history=d.history.map(e=>{if(!e||!string(e.content,1000)||!date(e.occurredAt))throw Error('Invalid history');return {content:e.content,occurredAt:e.occurredAt};});
 if(d.status!=='AVAILABLE'&&(d.title||d.body||history.length))throw Error('Inconsistent detail');
 const id=v=>v===null||typeof v==='string'&&/^\d{1,20}$/.test(v);let product=null,reply=null;if(d.product){if(!string(d.product.name,200)||!['productId','vendorItemId','sellerProductId'].every(k=>id(d.product[k])))throw Error('Invalid product');product={name:d.product.name,productId:d.product.productId,vendorItemId:d.product.vendorItemId,sellerProductId:d.product.sellerProductId};}if(d.reply){if(typeof d.reply.available!=='boolean'||!date(d.reply.sourceUpdatedAt))throw Error('Invalid reply');reply={available:d.reply.available,sourceUpdatedAt:d.reply.sourceUpdatedAt};}
 return {...(product?{product}:{}),...(reply?{reply}:{}),status:d.status,title:d.title,body:d.body,history,truncated:d.truncated,updatedAt:d.updatedAt};
}
function project(p){
 if(p?.ok!==true||p.status!=='READY'||p.writePolicy!=='READ_ONLY'||typeof p.generatedAt!=='string'||!Number.isFinite(Date.parse(p.generatedAt))||typeof p.truncated!=='boolean'||!Array.isArray(p.items)||p.items.length>200)throw Error('Invalid CS');
 const ids=new Set();return {status:'READY',generatedAt:p.generatedAt,truncated:p.truncated,items:p.items.map(r=>{
 if(typeof r?.id!=='string'||!r.id||r.id.length>240||ids.has(r.id)||!['NAVER','CAFE24','COUPANG'].includes(r.platform)||!r.id.startsWith(r.platform+':')||!['INQUIRY','CANCEL','RETURN','EXCHANGE'].includes(r.kind)||typeof r.status!=='string'||r.status.length>80||!(r.occurredAt===null||typeof r.occurredAt==='string'&&Number.isFinite(Date.parse(r.occurredAt))))throw Error('Invalid CS item');ids.add(r.id);
 return {id:r.id,platform:r.platform,kind:r.kind,status:r.status,occurredAt:r.occurredAt,details:details(r.details)};})};
}
function createCsTransport({fetch,timeoutMs=30000}={}){
 if(typeof fetch!=='function'||!Number.isInteger(timeoutMs)||timeoutMs<1||timeoutMs>30000)throw TypeError('Invalid transport');
 return async({signal}={})=>{
  if(signal?.aborted)return empty('CANCELLED');const controller=new AbortController();let timer,reader,stop;
  const cancelled=new Promise(resolve=>{stop=()=>{controller.abort();resolve(empty('CANCELLED'));};});signal?.addEventListener('abort',stop,{once:true});
  const run=async()=>{try{
   const res=await fetch(CS_URL,{method:'GET',headers:{'x-moaon-cs-details':'1'},credentials:'include',cache:'no-store',redirect:'error',signal:controller.signal});
   if(res.status!==200)return empty(({401:'LOGIN_REQUIRED',403:'FORBIDDEN',504:'TIMEOUT'})[res.status]||'UNAVAILABLE');
   if(res.redirected||res.url&&res.url!==CS_URL||Number(res.headers.get('content-length'))>16777216)throw Error('Response');
   reader=res.body?.getReader();if(!reader)throw Error('Body');let size=0;const chunks=[];
   while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>16777216)throw Error('Size');chunks.push(value);}
   const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
   return project(JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes)));
  }catch{return empty('UNAVAILABLE');}};
  try{return await Promise.race([run(),cancelled,new Promise(resolve=>{timer=setTimeout(()=>{controller.abort();resolve(empty('TIMEOUT'));},timeoutMs);})]);}finally{clearTimeout(timer);signal?.removeEventListener('abort',stop);controller.abort();try{reader?.cancel().catch(()=>{});}catch{}}
 };
}
module.exports={createCsTransport,CS_URL};
