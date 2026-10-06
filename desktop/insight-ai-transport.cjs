'use strict';
const {validCommand,projectResponse,empty}=require('./insight-ai-contract.cjs');
const INSIGHT_AI_URL='https://harin-cafe24-sync.vercel.app/api/moaon/businesses/a3452bca-e259-40ed-a93d-b8bcc5c1b9e0/insights/ai';
const METHODS={LIST:'GET',GENERATE:'POST',DELETE:'DELETE'};
function createInsightAiTransport({fetch,timeoutMs=28000}={}){
 if(typeof fetch!=='function'||!Number.isInteger(timeoutMs)||timeoutMs<1||timeoutMs>28000)throw TypeError('Invalid transport');
 return async(command,{signal}={})=>{
  if(!validCommand(command))return empty('INVALID_REQUEST');if(signal?.aborted)return empty('CANCELLED');
  const controller=new AbortController();let timer,reader,stop;
  const cancelled=new Promise(resolve=>{stop=()=>{controller.abort();resolve(empty('CANCELLED'));};});signal?.addEventListener('abort',stop,{once:true});
  const run=async()=>{try{
   const method=METHODS[command.operation],body=method==='GET'?undefined:JSON.stringify(command.operation==='GENERATE'?command.input:{runId:command.runId});
   const res=await fetch(INSIGHT_AI_URL,{method,credentials:'include',cache:'no-store',redirect:'error',signal:controller.signal,headers:{Accept:'application/json',...(body?{'Content-Type':'application/json','Origin':'https://harin-cafe24-sync.vercel.app'}:{})},...(body?{body}:{})});
   if(res.redirected||res.url&&res.url!==INSIGHT_AI_URL||Number(res.headers.get('content-length'))>131072)throw Error('Response');
   reader=res.body?.getReader();if(!reader)throw Error('Body');const chunks=[];let size=0;while(true){const {value,done}=await reader.read();if(done)break;size+=value.byteLength;if(size>131072)throw Error('Size');chunks.push(value);}
   const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
   const payload=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
   if(!res.ok)return empty(payload?.status||payload?.code||({401:'LOGIN_REQUIRED',403:'FORBIDDEN',504:'TIMEOUT'})[res.status]);
   return projectResponse(payload,command.operation);
  }catch{return empty('UNAVAILABLE');}};
  try{return await Promise.race([run(),cancelled,new Promise(resolve=>{timer=setTimeout(()=>{controller.abort();resolve(empty('TIMEOUT'));},timeoutMs);})]);}finally{clearTimeout(timer);signal?.removeEventListener('abort',stop);controller.abort();try{reader?.cancel().catch(()=>{});}catch{}}
 };
}
module.exports={INSIGHT_AI_URL,METHODS,createInsightAiTransport};
