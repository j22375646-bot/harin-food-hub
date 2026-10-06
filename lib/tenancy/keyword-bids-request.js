'use strict';
const {guardBusinessListRequest}=require('./business-list-request.js');
const {assertLegacyHarinWorkspaceOwner}=require('./legacy-harin-workspace-access.js');
const {readJson}=require('../api/safety.js');
const PATH=/^\/api\/moaon\/businesses\/([0-9a-f-]{36})\/keyword-bids$/;
const reply=(status,body)=>Response.json(body,{status,headers:{'cache-control':'private, no-store',vary:'Cookie, Origin','x-content-type-options':'nosniff'}});
function guardKeywordBids(request){
 const url=new URL(request.url),match=PATH.exec(url.pathname);
 if(request.method!=='POST')return {response:reply(405,{ok:false,code:'METHOD_NOT_ALLOWED'})};
 if(!match||url.search)return {response:reply(400,{ok:false,code:'INVALID_REQUEST'})};
 if(request.headers.get('origin')!==url.origin||request.headers.get('sec-fetch-site')==='cross-site')return {response:reply(403,{ok:false,code:'ORIGIN_DENIED'})};
 if(!/^application\/json(?:;\s*charset=utf-8)?$/i.test(request.headers.get('content-type')||''))return {response:reply(415,{ok:false,code:'INVALID_CONTENT_TYPE'})};
 const auth=guardBusinessListRequest(new Request(url,{headers:request.headers}));
 return auth.response?auth:{...auth,tenantId:match[1]};
}
const validBidInput=require('../../desktop/keyword-bids.cjs').valid;
function createKeywordBidsRequest({resolveContext,operate}){
 return async request=>{
  const access=guardKeywordBids(request);if(access.response)return access.response;
  try{
   const before=await resolveContext(access);assertLegacyHarinWorkspaceOwner(before,access.tenantId);
   const input=await readJson(request,{maxBytes:4096});if(!validBidInput(input))return reply(400,{ok:false,code:'INVALID_REQUEST'});
   const check=async()=>{request.signal.throwIfAborted();const after=await resolveContext(access);assertLegacyHarinWorkspaceOwner(after,access.tenantId);if(['tenantId','userId','sessionId','role','membershipVersion'].some(k=>before[k]!==after[k]))throw Object.assign(Error('Workspace changed'),{code:'WORKSPACE_CHANGED'});};
   await check();
   const result=await operate(input,{actor:`moaon:${before.tenantId}:${before.userId}`,check});
   return reply(200,{ok:true,...result});
  }catch(error){
   const code=typeof error?.code==='string'&&/^[A-Z][A-Z0-9_]{1,70}$/.test(error.code)?error.code:'BID_UNAVAILABLE';
   return reply(({AUTH_REQUIRED:401,TENANT_ACCESS_DENIED:403,PERMISSION_DENIED:403,WORKSPACE_CHANGED:409})[code]||409,{ok:false,code});
  }
 };
}
module.exports={guardKeywordBids,createKeywordBidsRequest,validBidInput};
