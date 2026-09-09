'use strict';
const {guardBusinessListRequest}=require('./business-list-request.js');
const {assertLegacyHarinWorkspaceOwner}=require('./legacy-harin-workspace-access.js');
const PATH=/^\/api\/moaon\/businesses\/([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\/cs$/;
const HEADERS={'cache-control':'private, no-store',vary:'Cookie','x-content-type-options':'nosniff'};
const failure=(status,code)=>Response.json({ok:false,code},{status,headers:HEADERS});
function guardWorkspaceCsRequest(request){
 const url=new URL(request.url),match=PATH.exec(url.pathname);
 if(!match||url.search)return {response:failure(400,'INVALID_REQUEST')};
 const guarded=guardBusinessListRequest(request);
 return guarded.response?guarded:{...guarded,tenantId:match[1]};
}
function createWorkspaceCsRequest({resolveContext,readCs,timeoutMs=25000}={}){
 if(typeof resolveContext!=='function'||typeof readCs!=='function')throw TypeError('Trusted dependencies required');
 if(!Number.isInteger(timeoutMs)||timeoutMs<1||timeoutMs>30000)throw TypeError('Invalid deadline');
 return async request=>{
  const input=guardWorkspaceCsRequest(request);if(input.response)return input.response;
  let stopped=false,timer;
  const current=()=>{if(stopped||request.signal.aborted)throw Object.assign(Error('Stopped'),{code:'REQUEST_TIMEOUT'});};
  try{return await Promise.race([
   (async()=>{
    current();const before=await resolveContext(input);current();assertLegacyHarinWorkspaceOwner(before,input.tenantId);
    const data=await readCs();current();
    const after=await resolveContext(input);current();assertLegacyHarinWorkspaceOwner(after,input.tenantId);
    if(['tenantId','userId','sessionId','role','membershipVersion'].some(key=>before[key]!==after[key]))return failure(409,'WORKSPACE_CHANGED');
    return Response.json({ok:true,...data},{headers:HEADERS});
   })(),
   new Promise((_,reject)=>{timer=setTimeout(()=>{stopped=true;reject(Object.assign(Error('Deadline'),{code:'REQUEST_TIMEOUT'}));},timeoutMs);})
  ]);}catch(error){
   const codes={AUTH_REQUIRED:401,TENANT_ACCESS_DENIED:403,PERMISSION_DENIED:403,REQUEST_TIMEOUT:504};
   return Object.hasOwn(codes,error?.code)?failure(codes[error.code],error.code):failure(503,'WORKSPACE_UNAVAILABLE');
  }finally{stopped=true;clearTimeout(timer);}
 };
}
module.exports={createWorkspaceCsRequest,guardWorkspaceCsRequest};
