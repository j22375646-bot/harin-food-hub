'use strict';
const INVENTORY_URL='https://harin-cafe24-sync.vercel.app/api/moaon/businesses/a3452bca-e259-40ed-a93d-b8bcc5c1b9e0/inventory';
const empty=status=>({status,items:[],generatedAt:null,truncated:false});
function productDetail(p){
 if(p===undefined||p===null)return null;
 const date=v=>v===null||typeof v==='string'&&Number.isFinite(Date.parse(v));
 if(!(p.name===null||typeof p.name==='string'&&p.name.length<=200)||!['UNKNOWN','REFERENCE','CAFE24_CATALOG','NAVER_COMMERCE','COUPANG_OPTIONS'].includes(p.basis)||!date(p.updatedAt)||typeof p.stale!=='boolean')throw Error('Invalid product detail');
 const empty=p.min===null&&p.max===null,known=typeof p.min==='number'&&typeof p.max==='number'&&Number.isFinite(p.min)&&Number.isFinite(p.max)&&p.min>0&&p.max>=p.min&&p.max<=1e12;
 if(!empty&&!known||['UNKNOWN','REFERENCE'].includes(p.basis)&&!empty)throw Error('Invalid price range');
 return {name:p.name,basis:p.basis,min:p.min,max:p.max,updatedAt:p.updatedAt,stale:p.stale};
}
function mappingDetail(m){
 if(m===undefined||m===null)return null;
 if(!Number.isInteger(m.count)||m.count<2||m.count>5000||!Array.isArray(m.entries)||m.entries.length!==Math.min(20,m.count))throw Error('Invalid mapping');
 const seen=new Set();return {count:m.count,entries:m.entries.map(r=>{
  if(typeof r?.id!=='string'||!r.id||r.id.length>80||seen.has(r.id)||!(r.externalId===null||typeof r.externalId==='string'&&r.externalId.length<=160)||!(r.name===null||typeof r.name==='string'&&r.name.length<=200)||!(r.active===null||typeof r.active==='boolean')||typeof r.reference!=='boolean')throw Error('Invalid connection entry');seen.add(r.id);
  return {id:r.id,externalId:r.externalId,name:r.name,active:r.active,reference:r.reference};
 })};
}
function project(p){
 const date=v=>v===null||typeof v==='string'&&Number.isFinite(Date.parse(v));
 if(p?.ok!==true||p.status!=='READY'||p.writePolicy!=='READ_ONLY'||typeof p.generatedAt!=='string'||!date(p.generatedAt)||p.truncated!==false||!Array.isArray(p.items)||p.items.length>1000)throw Error('Invalid inventory');
 const ids=new Set();return {status:'READY',generatedAt:p.generatedAt,truncated:false,items:p.items.map(r=>{
  if(typeof r?.id!=='string'||!r.id||r.id.length>80||ids.has(r.id)||typeof r.name!=='string'||r.name.length>200||!Array.isArray(r.channels)||r.channels.length!==4)throw Error('Invalid product');ids.add(r.id);
  const keys=new Set();const channels=r.channels.map(c=>{
   const key=c.platform+':'+c.family;
   if(!['CAFE24:STORE','NAVER:STORE','COUPANG:MARKETPLACE','COUPANG:ROCKET_GROWTH'].includes(key)||keys.has(key)||!['HEALTHY','LOW','OUT_OF_STOCK','STALE','UNKNOWN','MISSING','REFERENCE'].includes(c.state)||!(c.quantity===null||typeof c.quantity==='number'&&Number.isFinite(c.quantity)&&c.quantity>=0)||!date(c.updatedAt)||typeof c.stale!=='boolean'||typeof c.stopped!=='boolean'||typeof c.unmanaged!=='boolean'||typeof c.detail!=='string'||c.detail.length>200)throw Error('Invalid stock');if(!(c.externalId===undefined||c.externalId===null||typeof c.externalId==='string'&&c.externalId.length<=160))throw Error('Invalid connection');keys.add(key);
   if(['UNKNOWN','MISSING','REFERENCE'].includes(c.state)&&c.quantity!==null||['HEALTHY','LOW','OUT_OF_STOCK','STALE'].includes(c.state)&&c.quantity===null)throw Error('Invalid stock state');
   const product=productDetail(c.product),mapping=mappingDetail(c.mapping);
   if(mapping&&(c.state!=='UNKNOWN'||c.quantity!==null||c.externalId!=null||product!==null))throw Error('Ambiguous mapping has claimed values');
   if(product&&!['UNKNOWN',...(c.platform==='CAFE24'?['CAFE24_CATALOG']:c.platform==='NAVER'?['NAVER_COMMERCE','REFERENCE']:['COUPANG_OPTIONS'])].includes(product.basis))throw Error('Crossed product source');
   return {mapping,product,externalId:c.externalId??null,platform:c.platform,family:c.family,state:c.state,quantity:c.quantity,updatedAt:c.updatedAt,stale:c.stale,stopped:c.stopped,unmanaged:c.unmanaged,detail:c.detail};
  });return {id:r.id,name:r.name,channels};
 })};
}
function createInventoryTransport({fetch,timeoutMs=30000}={}){
 if(typeof fetch!=='function'||!Number.isInteger(timeoutMs)||timeoutMs<1||timeoutMs>30000)throw TypeError('Invalid transport');
 return async({signal}={})=>{
  if(signal?.aborted)return empty('CANCELLED');const controller=new AbortController();let timer,reader,stop;
  const cancelled=new Promise(resolve=>{stop=()=>{controller.abort();resolve(empty('CANCELLED'));};});signal?.addEventListener('abort',stop,{once:true});
  const run=async()=>{try{
   const res=await fetch(INVENTORY_URL,{method:'GET',credentials:'include',cache:'no-store',redirect:'error',signal:controller.signal});
   if(res.status!==200)return empty(({401:'LOGIN_REQUIRED',403:'FORBIDDEN',404:'NOT_DEPLOYED',503:'SERVER_UNAVAILABLE',504:'TIMEOUT'})[res.status]||'UNAVAILABLE');
   if(res.redirected||res.url&&res.url!==INVENTORY_URL||Number(res.headers.get('content-length'))>8388608)throw Error('Response');
   reader=res.body?.getReader();if(!reader)throw Error('Body');let size=0;const chunks=[];
   while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>8388608)throw Error('Size');chunks.push(value);}
   const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
   return project(JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes)));
  }catch{return empty('UNAVAILABLE');}};
  try{return await Promise.race([run(),cancelled,new Promise(resolve=>{timer=setTimeout(()=>{controller.abort();resolve(empty('TIMEOUT'));},timeoutMs);})]);}finally{clearTimeout(timer);signal?.removeEventListener('abort',stop);controller.abort();try{reader?.cancel().catch(()=>{});}catch{}}
 };
}
module.exports={createInventoryTransport,INVENTORY_URL};
