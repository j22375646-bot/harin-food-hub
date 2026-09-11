'use strict';
const {projectMarketing}=require('./marketing-contract.cjs');
const INSIGHTS_URL='https://harin-cafe24-sync.vercel.app/api/moaon/businesses/a3452bca-e259-40ed-a93d-b8bcc5c1b9e0/insights';
const empty=status=>({status,channel:null,reports:[],caveats:[],generatedAt:null});
const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const text=v=>typeof v==='string'&&v.length<=500;
const number=v=>v===null||typeof v==='number'&&Number.isFinite(v);
function date(v){return v===null||typeof v==='string'&&/^\d{4}-\d{2}-\d{2}T/.test(v)&&Number.isFinite(Date.parse(v))&&new Date(v.slice(0,10)).toISOString().slice(0,10)===v.slice(0,10);}
function detail(value){
 if(value==null)return null;
 if(!object(value)||typeof value.truncated!=='boolean'||!Array.isArray(value.sections)||value.sections.length>6)throw Error('Detail');
 return {truncated:value.truncated,sections:value.sections.map(section=>{
  if(!object(section)||!text(section.title)||!Array.isArray(section.items)||section.items.length>8)throw Error('Section');
  return {title:section.title,items:section.items.map(item=>{
   if(!object(item)||!text(item.title)||!text(item.body))throw Error('Item');
   return {title:item.title,body:item.body};
  })};
 })};
}
function project(p){
 const c=p?.channel;
 if(p?.ok!==true||p.writePolicy!=='READ_ONLY'||!date(p.generatedAt)||!object(c)||c.platform!=='NAVER'||!text(c.name)||!Number.isInteger(c.reportCount)||c.reportCount<0||c.reportCount>20||!['revenue','profit','changeRate'].every(k=>number(c[k]))||!['cause','causeNote','action','actionNote'].every(k=>text(c[k]))||!(c.currentPeriod===null||object(c.currentPeriod)&&['start','end','createdAt'].every(k=>date(c.currentPeriod[k]))))throw Error('Channel');
 if(!Array.isArray(p.reports)||p.reports.length>20||p.reports.length!==c.reportCount||!Array.isArray(p.caveats)||p.caveats.length>20||!p.caveats.every(text))throw Error('Reports');
 const ids=new Set();for(const row of p.reports){if(!object(row)||typeof row.id!=='string'||!row.id||row.id.length>128||ids.has(row.id)||!text(row.title)||!['periodStart','periodEnd','createdAt'].every(k=>date(row[k])))throw Error('Report');ids.add(row.id);}
return {status:'READY',marketing:projectMarketing(p.marketing),writePolicy:'READ_ONLY',generatedAt:p.generatedAt,channel:{...Object.fromEntries(['platform','name','reportCount','revenue','profit','changeRate','cause','causeNote','action','actionNote'].map(k=>[k,c[k]])),currentPeriod:c.currentPeriod===null?null:Object.fromEntries(['start','end','createdAt'].map(k=>[k,c.currentPeriod[k]]))},reports:p.reports.map(row=>({...Object.fromEntries(['id','title','periodStart','periodEnd','createdAt'].map(k=>[k,row[k]])),detail:detail(row.detail)})),caveats:[...p.caveats]};
}
function createInsightsTransport({fetch,timeoutMs=30000}={}){
 if(typeof fetch!=='function'||!Number.isInteger(timeoutMs)||timeoutMs<1||timeoutMs>30000)throw TypeError('Invalid transport');
 return async({signal}={})=>{
  if(signal?.aborted)return empty('CANCELLED');const controller=new AbortController();let timer,reader,stop;
  const cancelled=new Promise(resolve=>{stop=()=>{controller.abort();resolve(empty('CANCELLED'));};});signal?.addEventListener('abort',stop,{once:true});
  const run=async()=>{try{
   const res=await fetch(INSIGHTS_URL,{method:'GET',credentials:'include',cache:'no-store',redirect:'error',signal:controller.signal});
   if(res.status!==200)return empty(({401:'LOGIN_REQUIRED',403:'FORBIDDEN',504:'TIMEOUT'})[res.status]||'UNAVAILABLE');
   if(res.redirected||res.url&&res.url!==INSIGHTS_URL||Number(res.headers.get('content-length'))>262144)throw Error('Response');
   reader=res.body?.getReader();if(!reader)throw Error('Body');let size=0;const chunks=[];
   while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>262144)throw Error('Size');chunks.push(value);}
   const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
   return project(JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes)));
  }catch{return empty('UNAVAILABLE');}};
  try{return await Promise.race([run(),cancelled,new Promise(resolve=>{timer=setTimeout(()=>{controller.abort();resolve(empty('TIMEOUT'));},timeoutMs);})]);}finally{clearTimeout(timer);signal?.removeEventListener('abort',stop);controller.abort();try{reader?.cancel().catch(()=>{});}catch{}}
 };
}
module.exports={createInsightsTransport,INSIGHTS_URL};
