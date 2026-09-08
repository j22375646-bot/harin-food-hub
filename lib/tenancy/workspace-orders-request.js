'use strict';
const {guardBusinessListRequest}=require('./business-list-request.js');
const {authorizeAction}=require('./permissions.js');
// Existing order storage has no tenant column. This binding is NOT configurable
// by request, membership display name or the currently selected business.
const LEGACY_HARIN_TENANT='a3452bca-e259-40ed-a93d-b8bcc5c1b9e0';
const PATH=/^\/api\/moaon\/businesses\/([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\/orders$/;
const QUERY=new Set(['stage','platform','offset','snapshot','delayOnly','giftOnly']);
function failure(status,code){return Response.json({ok:false,code},{status,headers:{'cache-control':'no-store',vary:'Cookie','x-content-type-options':'nosniff'}});}
function guardWorkspaceOrdersRequest(request){
 const url=new URL(request.url),match=PATH.exec(url.pathname);
 if(!match)return {response:failure(400,'INVALID_REQUEST')};
 const seen=new Set();
 for(const [key,value] of url.searchParams){
  if(!QUERY.has(key)||seen.has(key)||value.length>128)return {response:failure(400,'INVALID_REQUEST')};
  seen.add(key);
 }
 url.search='';
 const guarded=guardBusinessListRequest(new Request(url,{method:request.method,headers:request.headers}));
 return guarded.response?guarded:{...guarded,tenantId:match[1]};
}
function createWorkspaceOrdersRequest({resolveContext,readOrders,timeoutMs=15000}={}){
 if(typeof resolveContext!=='function'||typeof readOrders!=='function')throw TypeError('Trusted dependencies required');
 if(!Number.isFinite(timeoutMs)||timeoutMs<1||timeoutMs>30000)throw TypeError('Invalid deadline');
 return async request=>{
  const input=guardWorkspaceOrdersRequest(request);if(input.response)return input.response;
  let stopped=false,timer;
  function current(){if(stopped||request.signal.aborted)throw Object.assign(Error('Stopped'),{code:'REQUEST_TIMEOUT'});}
  function allowed(context){
   authorizeAction(context,'workspace.read');
   // Preserve current OWNER-only operational access until other roles and
   // legacy storage are migrated. Membership alone never grants legacy data.
   if(context.tenantId!==input.tenantId||context.tenantId!==LEGACY_HARIN_TENANT||context.role!=='OWNER')throw Object.assign(Error('Denied'),{code:'TENANT_ACCESS_DENIED'});
  }
  try{
   return await Promise.race([
    (async()=>{
     current();const before=await resolveContext(input);current();allowed(before);
     const result=await readOrders(request);current();
     const after=await resolveContext(input);current();allowed(after);
     if(['tenantId','userId','sessionId','role','membershipVersion'].some(key=>before[key]!==after[key]))return failure(409,'WORKSPACE_CHANGED');
     if(!(result instanceof Response)||result.status>=300&&result.status<400)throw Error('Invalid read response');
     const headers=new Headers(result.headers);headers.set('cache-control','private, no-store');headers.set('vary','Cookie');
     return new Response(result.body,{status:result.status,headers});
    })(),
    new Promise((_,reject)=>{timer=setTimeout(()=>{stopped=true;reject(Object.assign(Error('Deadline'),{code:'REQUEST_TIMEOUT'}));},timeoutMs);}),
   ]);
  }catch(error){
   const codes={AUTH_REQUIRED:401,TENANT_ACCESS_DENIED:403,PERMISSION_DENIED:403,REQUEST_TIMEOUT:504};
   return Object.hasOwn(codes,error?.code)?failure(codes[error.code],error.code):failure(503,'WORKSPACE_UNAVAILABLE');
  }finally{stopped=true;clearTimeout(timer);}
 };
}
module.exports={createWorkspaceOrdersRequest,guardWorkspaceOrdersRequest};
