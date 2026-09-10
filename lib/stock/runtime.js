'use strict';
const {createBusinessListRuntime}=require('../tenancy/business-list-runtime.js');
const {guardBusinessListRequest}=require('../tenancy/business-list-request.js');
const {createDashboardIdentityVerifier}=require('../tenancy/dashboard-identity.js');
const {createFinanceContextResolver}=require('../tenancy/workspace-finance-runtime.js');
const {authorizeAction}=require('../tenancy/permissions.js');
const {validate}=require('./validation.js');
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const reply=(status,body)=>Response.json(body,{status,headers:{'cache-control':'private, no-store',vary:'Cookie'}});
function guard(request){const url=new URL(request.url),id=/^\/api\/moaon\/businesses\/([^/]+)\/stock$/.exec(url.pathname)?.[1];if(!UUID.test(id||'')||!['GET','POST'].includes(request.method)||url.search)return {response:reply(400,{ok:false,code:'INVALID_REQUEST'})};
if(request.method==='POST'&&(request.headers.get('origin')!==url.origin||!request.headers.get('content-type')?.startsWith('application/json')))return {response:reply(403,{ok:false,code:'ORIGIN_DENIED'})};const auth=guardBusinessListRequest(new Request(request.url,{headers:request.headers}));return auth.response?auth:{...auth,tenantId:id};}
async function body(request){const reader=request.body?.getReader();if(!reader)throw Error('INPUT');let text='',size=0;const decoder=new TextDecoder();try{while(true){const r=await reader.read();if(r.done)break;size+=r.value.length;if(size>16384)throw Error('INPUT');text+=decoder.decode(r.value,{stream:true});}text+=decoder.decode();return JSON.parse(text);}finally{reader.cancel().catch(()=>{});}}
function createStockHandler({resolveContext,db}){return async request=>{const input=guard(request);if(input.response)return input.response;try{const context=await resolveContext(input);authorizeAction(context,request.method==='GET'?'workspace.read':'stock.write');if(context.tenantId!==input.tenantId)return reply(403,{ok:false,code:'TENANT_ACCESS_DENIED'});
if(request.method==='GET'){const result=await db.from('moaon_stock_lots').select('id,revision,data,updated_at').eq('tenant_id',context.tenantId).order('updated_at',{ascending:false}).limit(5001);if(result.error||!Array.isArray(result.data)||result.data.length>5000)throw Error('DB');const after=await resolveContext(input);if(['userId','tenantId','membershipVersion','sessionId','role'].some(k=>context[k]!==after[k]))return reply(409,{ok:false,code:'WORKSPACE_CHANGED'});return reply(200,{ok:true,value:result.data.map(r=>({...r.data,id:r.id,revision:r.revision,updatedAt:r.updated_at}))});}
let value,fields;try{value=await body(request);fields=validate(value);if(!UUID.test(value.id)||!Number.isSafeInteger(value.revision)||value.revision<0)throw Error('INPUT');}catch{return reply(400,{ok:false,code:'INVALID_INPUT'});}
const current=await resolveContext(input);authorizeAction(current,'stock.write');if(['userId','tenantId','membershipVersion','sessionId','role'].some(k=>context[k]!==current[k]))return reply(409,{ok:false,code:'WORKSPACE_CHANGED'});
const result=await db.rpc('moaon_save_stock_lot',{p_tenant:context.tenantId,p_id:value.id,p_revision:value.revision,p_data:fields,p_actor:context.userId});if(result.error){if(result.error.message?.includes('STOCK_CONFLICT'))return reply(409,{ok:false,code:'STOCK_CONFLICT'});throw Error('DB');}return reply(200,{ok:true,value:result.data});
}catch(e){const codes={AUTH_REQUIRED:401,TENANT_ACCESS_DENIED:403,PERMISSION_DENIED:403};return reply(codes[e.code]||503,{ok:false,code:codes[e.code]?e.code:'STOCK_UNAVAILABLE'});}};}
function createStockRuntime({db}){return createBusinessListRuntime({guardRequest:guard,createService:({database,identityDb,authAdmin})=>createStockHandler({db,resolveContext:createFinanceContextResolver({database,verifySession:createDashboardIdentityVerifier({db:identityDb,authAdmin,timeoutMs:10000})})})});}
module.exports={createStockRuntime,createStockHandler,guard};
