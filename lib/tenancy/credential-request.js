'use strict';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const schemas={NAVER:['clientId','clientSecret'],CAFE24:['mallId','clientId','clientSecret'],COUPANG:['vendorId','accessKey','secretKey'],EPOST:['customerId','apiKey','securityKey','approvalNo','officeSerial','trackingApiKey']};
const exact=(v,keys)=>v&&Object.getPrototypeOf(v)===Object.prototype&&Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k));
const reply=(status,body)=>new Response(JSON.stringify(body),{status,headers:{'cache-control':'no-store','content-type':'application/json; charset=utf-8','x-content-type-options':'nosniff',vary:'Cookie, Origin'}});
const failure=(status,code)=>reply(status,{ok:false,code});
function valid(input){
 if(!exact(input,['tenantId','provider','expectedRevision','fields'])||typeof input.tenantId!=='string'||!UUID.test(input.tenantId)||typeof input.provider!=='string'||!Object.hasOwn(schemas,input.provider)||!Number.isInteger(input.expectedRevision)||input.expectedRevision<0||input.expectedRevision>=2147483647)return false;
 const fields=input.fields,keys=schemas[input.provider];
 return exact(fields,keys)&&keys.every(k=>typeof fields[k]==='string'&&fields[k].length<=2048&&!/[\u0000-\u001f\u007f-\u009f]/u.test(fields[k])&&(k==='trackingApiKey'||fields[k].trim().length>0))&&(input.provider!=='EPOST'||Buffer.byteLength(fields.securityKey,'utf8')===16);
}
async function readBody(request){
 if(!request.body)throw Error('Invalid body');const reader=request.body.getReader();let size=0,timer,onAbort;
 try{
  const chunks=[];const deadline=new Promise((_,reject)=>{timer=setTimeout(()=>{reader.cancel().catch(()=>{});reject(Error('Body timeout'));},5000);});
  const cancelled=new Promise((_,reject)=>{onAbort=()=>{reject(Error('Body aborted'));reader.cancel().catch(()=>{});};request.signal?.addEventListener('abort',onAbort,{once:true});});
  while(true){request.signal?.throwIfAborted();const item=await Promise.race([reader.read(),deadline,cancelled]);if(item.done)break;size+=item.value.byteLength;if(size>16384){reader.cancel().catch(()=>{});throw Error('Body limit');}chunks.push(item.value);}
  return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks)));
 }finally{clearTimeout(timer);request.signal?.removeEventListener('abort',onAbort);reader.releaseLock();}
}
function createCredentialSaveRequest({origin,save=null,maxConcurrent=8}={}){
 if(typeof origin!=='string'||!origin.startsWith('https://')||new URL(origin).origin!==origin||save!==null&&typeof save!=='function')throw TypeError('Trusted origin and store required');
 if(!Number.isInteger(maxConcurrent)||maxConcurrent<1||maxConcurrent>64)throw TypeError('Invalid concurrency bound');
 let active=0;
 return async request=>{
  if(active>=maxConcurrent){request.body?.cancel().catch(()=>{});return failure(429,'CREDENTIAL_BUSY');}
  active++;let writeStarted=false;
  try{
   if(request.method!=='POST')return failure(405,'METHOD_NOT_ALLOWED');
   if(new URL(request.url).origin!==origin||request.headers.get('origin')!==origin||request.headers.get('sec-fetch-site')==='cross-site')return failure(403,'ORIGIN_DENIED');
   if(new URL(request.url).search)return failure(400,'INVALID_REQUEST');
   if(!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(request.headers.get('content-type')||''))return failure(415,'INVALID_CONTENT_TYPE');
   const cookie=request.headers.get('cookie')||'';if(Buffer.byteLength(cookie)>16384)return failure(401,'AUTH_REQUIRED');
   const matches=cookie.split(';').map(x=>x.trim()).filter(x=>x.startsWith('harin_dashboard_session='));
   const credential=matches.length===1?matches[0].slice(24):'';
   if(!credential||credential.length>4096||!/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(credential))return failure(401,'AUTH_REQUIRED');
   let input;try{input=await readBody(request);}catch{return failure(400,'INVALID_REQUEST');}
   if(!valid(input))return failure(400,'CREDENTIAL_INVALID');
   if(!save)return failure(503,'SETUP_REQUIRED');
   request.signal?.throwIfAborted();
   // Do not race an in-flight write against a response timeout: an uncertain write must not invite blind retries.
   writeStarted=true;
   const result=await save(credential,input);
   if(result?.tenantId!==input.tenantId.toLowerCase()||result.provider!==input.provider||result.revision!==input.expectedRevision+1||result.status!=='SAVED_UNVERIFIED')throw Error('Invalid result');
   return reply(200,{ok:true,tenantId:result.tenantId,provider:result.provider,revision:result.revision,status:result.status});
  }catch(error){const codes={CREDENTIAL_ACCESS_DENIED:403,CREDENTIAL_CONFLICT:409,CREDENTIAL_INVALID:400};return Object.hasOwn(codes,error?.code||'')?failure(codes[error.code],error.code):failure(503,writeStarted?'CREDENTIAL_RESULT_UNKNOWN':'CREDENTIAL_STORAGE_UNAVAILABLE');}
  finally{active--;}
 };
}
module.exports={createCredentialSaveRequest};
