'use strict';

const HEADERS={'cache-control':'no-store','content-type':'application/json; charset=utf-8','x-content-type-options':'nosniff',vary:'Cookie'};
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function reply(status,payload){return new Response(JSON.stringify(payload),{status,headers:HEADERS});}
function failure(status,code){return reply(status,{ok:false,code});}
function credential(request){
 const header=request.headers.get('cookie')||'';
 if(Buffer.byteLength(header)>16384)return null;
 const matches=header.split(';').map(part=>part.trim()).filter(part=>part.startsWith('harin_dashboard_session='));
 if(matches.length!==1)return null;
 const value=matches[0].slice('harin_dashboard_session='.length);
 return value.length<=4096&&/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(value)?value:null;
}
function project(rows){
 if(!Array.isArray(rows)||rows.length>200)throw Error('Invalid data');
 const seen=new Set();
 return rows.map(row=>{
  if(!row||!UUID.test(row.tenantId)||seen.has(row.tenantId.toLowerCase())
   ||typeof row.displayName!=='string'||!row.displayName.trim()||row.displayName.length>256
   ||!['OWNER','OPERATOR','VIEWER'].includes(row.role)
   ||!Number.isSafeInteger(row.membershipVersion)||row.membershipVersion<1)throw Error('Invalid data');
  seen.add(row.tenantId.toLowerCase());
  return {tenantId:row.tenantId,displayName:row.displayName,role:row.role,membershipVersion:row.membershipVersion};
 });
}
// Inject only the server-composed control store method. No environment flag alone
// may enable legacy-owner access to multiple businesses.
function createBusinessListRequest({listBusinesses=null,timeoutMs=10000}={}){
 if(listBusinesses!==null&&typeof listBusinesses!=='function')throw TypeError('Invalid store');
 if(!Number.isFinite(timeoutMs)||timeoutMs<1||timeoutMs>30000)throw TypeError('Invalid deadline');
 return async request=>{
  let timer;
  try{
   if(request.method!=='GET')return failure(405,'METHOD_NOT_ALLOWED');
   const url=new URL(request.url),origin=request.headers.get('origin');
   if((origin&&origin!==url.origin)||request.headers.get('sec-fetch-site')==='cross-site')return failure(403,'ORIGIN_DENIED');
   if(url.search)return failure(400,'INVALID_REQUEST');
   const sessionCredential=credential(request);
   if(!sessionCredential)return failure(401,'AUTH_REQUIRED');
   if(!listBusinesses)return failure(503,'SETUP_REQUIRED');
   const rows=await Promise.race([
    Promise.resolve().then(()=>listBusinesses({sessionCredential})),
    new Promise((_,reject)=>{timer=setTimeout(()=>reject(Object.assign(Error('Deadline'),{code:'REQUEST_TIMEOUT'})),timeoutMs);}),
   ]);
   return reply(200,{ok:true,businesses:project(rows)});
  }catch(error){
   const statuses={AUTH_REQUIRED:401,BUSINESS_LIST_LIMIT:409,REQUEST_TIMEOUT:504};
   const status=Object.hasOwn(statuses,error?.code)?statuses[error.code]:null;
   return failure(status||503,status?error.code:'BUSINESS_LIST_UNAVAILABLE');
  }finally{clearTimeout(timer);}
 };
}
module.exports={createBusinessListRequest};
