'use strict';
const {BASE,encodeTargets,projectFeed}=require('./shipping-progress-contract.cjs');
function createProgressTransport({fetch,permit,blocked=()=>false,timeoutMs=30000}={}){
 if(typeof fetch!=='function'||typeof permit!=='function'||!Number.isInteger(timeoutMs)||timeoutMs<1||timeoutMs>30000)throw TypeError('Transport dependencies');
 let active=null;
 async function read(targets){
  let encoded;try{encoded=encodeTargets(targets);}catch{return {status:'UNAVAILABLE'};}
  if(active||blocked())return {status:'BUSY'};
  const controller=new AbortController();active=controller;let stopped=false,timer,reader;
  const check=()=>{if(stopped||controller.signal.aborted||blocked())throw Error('Stopped');};
  const url=BASE+'?targets='+encodeURIComponent(encoded);
  const operation=(async()=>{try{
   check();permit(url);const response=await fetch(url,{method:'GET',credentials:'include',cache:'no-store',redirect:'error',signal:controller.signal,headers:{Origin:'https://harin-cafe24-sync.vercel.app'}});check();
   if(response.redirected||response.url&&response.url!==url)throw Error('Redirect');
   const codes={401:'LOGIN_REQUIRED',403:'FORBIDDEN',404:'SETUP_REQUIRED',409:'WORKSPACE_CHANGED',429:'RATE_LIMITED',504:'TIMEOUT'};
   if(Object.hasOwn(codes,response.status))return {status:codes[response.status]};
   if(response.status!==200||Number(response.headers.get('content-length'))>65536)throw Error('Response');
   reader=response.body?.getReader();if(!reader)throw Error('Body');let size=0;const chunks=[];
   while(true){check();const {done,value}=await reader.read();check();if(done)break;size+=value.byteLength;if(size>65536)throw Error('Size');chunks.push(value);}
   return {status:'READY',value:projectFeed(JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks))),targets)};
  }catch{return {status:'UNAVAILABLE'};}})();
  try{return await Promise.race([operation,new Promise(resolve=>controller.signal.addEventListener('abort',()=>resolve({status:'CANCELLED'}),{once:true})),new Promise(resolve=>{timer=setTimeout(()=>{stopped=true;resolve({status:'TIMEOUT'});controller.abort();},timeoutMs);})]);}
  finally{stopped=true;clearTimeout(timer);controller.abort();try{reader?.cancel().catch(()=>{});}catch{}permit(null);if(active===controller)active=null;}
 }
 return {read,cancel:()=>active?.abort()};
}
module.exports={createProgressTransport};
