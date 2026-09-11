'use strict';
const BID_URL='https://harin-cafe24-sync.vercel.app/api/moaon/businesses/a3452bca-e259-40ed-a93d-b8bcc5c1b9e0/keyword-bids';
function valid(v){
 if(!v||typeof v!=='object'||Array.isArray(v))return false;
 const keys=({READ:['action','keywordId'],PREVIEW:['action','keywordId','currentBid','bid','key'],EXECUTE:['action','requestId','confirm'],STATUS:['action','requestId']})[v.action];
 if(!keys||Object.keys(v).length!==keys.length||!keys.every(k=>Object.hasOwn(v,k)))return false;
 if(v.keywordId!==undefined&&(typeof v.keywordId!=='string'||!/^nkw-[A-Za-z0-9-]{1,115}$/.test(v.keywordId)))return false;
 if(v.action==='PREVIEW'&&(![v.bid,v.currentBid].every(n=>Number.isInteger(n)&&n>=70&&n<=100000&&n%10===0)||typeof v.key!=='string'||!/^\w[\w-]{15,63}$/.test(v.key)))return false;
 return !['EXECUTE','STATUS'].includes(v.action)||(typeof v.requestId==='string'&&/^[0-9a-f-]{36}$/.test(v.requestId)&&(v.action!=='EXECUTE'||v.confirm===true));
}
function project(p,input){
 const bid=n=>Number.isInteger(n)&&n>=70&&n<=100000&&n%10===0;
 if(p?.ok!==true)return {ok:false,code:typeof p?.code==='string'&&/^[A-Z][A-Z0-9_]{1,70}$/.test(p.code)?p.code:'BID_UNAVAILABLE'};
 if(input.action==='READ'){
  if(p.keywordId!==input.keywordId||typeof p.name!=='string'||p.name.length>120||![p.currentBid,p.minBid,p.maxBid].every(bid)||p.minBid>p.currentBid||p.maxBid<p.currentBid||typeof p.writeEnabled!=='boolean'||p.mode!=='DIRECT_LOWER_ONLY'||typeof p.checkedAt!=='string'||!Number.isFinite(Date.parse(p.checkedAt)))throw Error('Bid response');
  return Object.fromEntries(['ok','keywordId','name','currentBid','minBid','maxBid','writeEnabled','mode','checkedAt'].map(k=>[k,p[k]]));
 }
 if(typeof p.requestId!=='string'||!/^[0-9a-f-]{36}$/.test(p.requestId)||input.requestId&&p.requestId!==input.requestId||typeof p.state!=='string'||!/^[A-Z_]{1,32}$/.test(p.state)||![p.bid,p.currentBid].every(bid))throw Error('Bid request response');
 if(input.action==='PREVIEW'&&(p.currentBid!==input.currentBid||p.bid!==input.bid||typeof p.writeEnabled!=='boolean'))throw Error('Bid preview response');
 return {ok:true,requestId:p.requestId,state:p.state,currentBid:p.currentBid,bid:p.bid,...(input.action==='PREVIEW'?{writeEnabled:p.writeEnabled}:{})};
}
async function sendBid(fetch,input,signal,timeoutMs=30000){
 if(!valid(input))return {ok:false,code:'INVALID_REQUEST'};
 const controller=new AbortController(),stop=()=>controller.abort(),timer=setTimeout(stop,timeoutMs);signal?.addEventListener('abort',stop,{once:true});let reader;
 try{
  if(signal?.aborted)throw Error('Cancelled');
  const response=await fetch(BID_URL,{method:'POST',credentials:'include',redirect:'error',cache:'no-store',headers:{'content-type':'application/json',origin:new URL(BID_URL).origin},body:JSON.stringify(input),signal:controller.signal});
  if(response.redirected||response.url&&response.url!==BID_URL||Number(response.headers.get('content-length'))>16384)throw Error('Response');
  reader=response.body?.getReader();if(!reader)throw Error('Body');const parts=[];let size=0;
  for(;;){const r=await reader.read();if(r.done)break;size+=r.value.byteLength;if(size>16384)throw Error('Size');parts.push(r.value);}
  const p=JSON.parse(Buffer.concat(parts).toString('utf8'));
  if(response.status!==200&&p?.ok===true)throw Error('Status');
  return project(p,input);
 }catch{return {ok:false,code:['EXECUTE','PREVIEW'].includes(input.action)?'BID_RESULT_UNKNOWN':'BID_UNAVAILABLE'};}
 finally{clearTimeout(timer);signal?.removeEventListener('abort',stop);controller.abort();try{await reader?.cancel();}catch{}}
}
module.exports={BID_URL,valid,project,sendBid};
