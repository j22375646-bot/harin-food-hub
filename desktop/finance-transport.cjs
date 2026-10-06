'use strict';
const {FINANCE_URL}=require('./connection-policy.cjs');
const LIMIT=262144,METRICS=Object.freeze(['sales','profit','balance']),STATUSES=new Set(['READY','PARTIAL','BLOCKED']);
const blockedMetrics=()=>Object.freeze(Object.fromEntries(METRICS.map(key=>[key,Object.freeze({value:null,status:'BLOCKED'})])));
const empty=status=>Object.freeze({status,month:null,generatedAt:null,metrics:blockedMetrics()});
function validMonth(value){if(!/^\d{4}-\d{2}$/.test(value))return false;const month=Number(value.slice(5));return month>=1&&month<=12;}
function project(payload){
 if(payload?.ok!==true||!validMonth(payload.month)||typeof payload.generatedAt!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(payload.generatedAt)||!Number.isFinite(Date.parse(payload.generatedAt))||!payload.metrics||typeof payload.metrics!=='object'||Array.isArray(payload.metrics))throw Error('Payload');
 const metrics={};for(const key of METRICS){const metric=payload.metrics[key];if(!metric||typeof metric!=='object'||Array.isArray(metric)||!STATUSES.has(metric.status)||!(metric.value===null||typeof metric.value==='number'&&Number.isFinite(metric.value))||metric.status==='BLOCKED'&&metric.value!==null)throw Error('Metric');metrics[key]=Object.freeze({value:metric.value,status:metric.status});}
 return Object.freeze({status:'READY',month:payload.month,generatedAt:new Date(payload.generatedAt).toISOString(),metrics:Object.freeze(metrics)});
}
function createFinanceTransport({fetch,timeoutMs=30000}={}){
 if(typeof fetch!=='function'||!Number.isInteger(timeoutMs)||timeoutMs<1||timeoutMs>30000)throw TypeError('Invalid finance transport');
 return async function read({signal}={}){if(signal?.aborted)return empty('CANCELLED');const controller=new AbortController();let timer,reader,stop;const cancelled=new Promise(resolve=>{stop=()=>{controller.abort();resolve(empty('CANCELLED'));};});signal?.addEventListener('abort',stop,{once:true});
  async function run(){try{const response=await fetch(FINANCE_URL,{method:'GET',credentials:'include',cache:'no-store',redirect:'error',signal:controller.signal});if(response.status!==200)return empty(({401:'LOGIN_REQUIRED',403:'FORBIDDEN',504:'TIMEOUT'})[response.status]||'UNAVAILABLE');if(response.redirected||(response.url&&response.url!==FINANCE_URL)||Number(response.headers.get('content-length'))>LIMIT)throw Error('Response');reader=response.body?.getReader();if(!reader)throw Error('Body');let size=0;const chunks=[];while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>LIMIT)throw Error('Size');chunks.push(value);}const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}return project(JSON.parse(new TextDecoder().decode(bytes)));}catch{return empty('UNAVAILABLE');}}
  try{return await Promise.race([run(),cancelled,new Promise(resolve=>{timer=setTimeout(()=>{controller.abort();resolve(empty('TIMEOUT'));},timeoutMs);})]);}finally{clearTimeout(timer);signal?.removeEventListener('abort',stop);controller.abort();try{reader?.cancel().catch(()=>{});}catch{}}
 };}
module.exports=Object.freeze({createFinanceTransport});
