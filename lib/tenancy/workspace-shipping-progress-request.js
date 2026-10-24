'use strict';
const {createHash}=require('node:crypto');
const {guardBusinessListRequest}=require('./business-list-request.js');
const {assertLegacyHarinWorkspaceOwner}=require('./legacy-harin-workspace-access.js');
const {parseTargets,projectFeed}=require('../../desktop/shipping-progress-contract.cjs');
const PATH=/^\/api\/moaon\/businesses\/([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\/shipping-progress$/;
const HEADERS={'cache-control':'private, no-store',vary:'Cookie','x-content-type-options':'nosniff'};
const failure=(status,code)=>Response.json({ok:false,code},{status,headers:HEADERS});
function guardWorkspaceShippingProgressRequest(request){
 const url=new URL(request.url),match=PATH.exec(url.pathname);let targets;
 try{if(!match||[...url.searchParams.keys()].join(',')!=='targets')throw Error();targets=parseTargets(url.searchParams.get('targets'));}catch{return {response:failure(400,'INVALID_REQUEST')};}
 url.search='';const guarded=guardBusinessListRequest(new Request(url,{method:request.method,headers:request.headers}));
 return guarded.response?guarded:{...guarded,tenantId:match[1],targets};
}
function createWorkspaceShippingProgressRequest({resolveContext,readProgress,timeoutMs=25000}={}){
 if(typeof resolveContext!=='function'||typeof readProgress!=='function'||!Number.isInteger(timeoutMs)||timeoutMs<1||timeoutMs>30000)throw TypeError('Trusted dependencies required');
 return async request=>{
  const input=guardWorkspaceShippingProgressRequest(request);if(input.response)return input.response;
  let stopped=false,timer;const controller=new AbortController(),stop=()=>controller.abort();request.signal.addEventListener('abort',stop,{once:true});
  const current=()=>{if(stopped||request.signal.aborted)throw Object.assign(Error('Stopped'),{code:'REQUEST_TIMEOUT'});};
  try{return await Promise.race([
   (async()=>{
    current();const before=await resolveContext(input);current();assertLegacyHarinWorkspaceOwner(before,input.tenantId);
    const items=await readProgress(input.targets,{signal:controller.signal});current();
    const after=await resolveContext(input);current();assertLegacyHarinWorkspaceOwner(after,input.tenantId);
    const keys=['tenantId','userId','sessionId','role','membershipVersion'];if(keys.some(k=>before[k]!==after[k]))return failure(409,'WORKSPACE_CHANGED');
    const scopeKey=createHash('sha256').update(JSON.stringify(keys.map(k=>after[k]))).digest('hex');
    return Response.json({ok:true,...projectFeed({ok:true,contract:1,tenantId:input.tenantId,scopeKey,checkedAt:new Date().toISOString(),partial:false,items},input.targets)},{headers:HEADERS});
   })(),
   new Promise((_,reject)=>{timer=setTimeout(()=>{stopped=true;controller.abort();reject(Object.assign(Error('Deadline'),{code:'REQUEST_TIMEOUT'}));},timeoutMs);})
  ]);}catch(error){const codes={AUTH_REQUIRED:401,TENANT_ACCESS_DENIED:403,PERMISSION_DENIED:403,REQUEST_TIMEOUT:504};return Object.hasOwn(codes,error?.code)?failure(codes[error.code],error.code):failure(503,'WORKSPACE_UNAVAILABLE');}
  finally{stopped=true;clearTimeout(timer);controller.abort();request.signal.removeEventListener('abort',stop);}
 };
}
module.exports={createWorkspaceShippingProgressRequest,guardWorkspaceShippingProgressRequest};
