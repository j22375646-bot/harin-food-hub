'use strict';
const {createBusinessListRuntime}=require('../tenancy/business-list-runtime.js');
const {guardBusinessListRequest}=require('../tenancy/business-list-request.js');
const {createDashboardIdentityVerifier}=require('../tenancy/dashboard-identity.js');
const {createFinanceContextResolver}=require('../tenancy/workspace-finance-runtime.js');
const {authorizeAction}=require('../tenancy/permissions.js');
const {validate}=require('./validation.js');
const {HARIN,loadStockProducts}=require('./products.js');
const {loadRocket}=require('./rocket.js');
const {saveProductChoice}=require('./product-choice.js');
const {loadSalesWorkspace,seedSalesRules,saveSalesRule,retrySalesOrders}=require('./sales.js');
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const reply=(status,body)=>Response.json(body,{status,headers:{'cache-control':'private, no-store',vary:'Cookie'}});
function guard(request){const url=new URL(request.url),id=/^\/api\/moaon\/businesses\/([^/]+)\/stock$/.exec(url.pathname)?.[1];if(!UUID.test(id||'')||!['GET','POST'].includes(request.method)||url.search)return {response:reply(400,{ok:false,code:'INVALID_REQUEST'})};
if(request.method==='POST'&&(request.headers.get('origin')!==url.origin||!request.headers.get('content-type')?.startsWith('application/json')))return {response:reply(403,{ok:false,code:'ORIGIN_DENIED'})};const auth=guardBusinessListRequest(new Request(request.url,{headers:request.headers}));return auth.response?auth:{...auth,tenantId:id};}
async function body(request){const reader=request.body?.getReader();if(!reader)throw Error('INPUT');let text='',size=0;const decoder=new TextDecoder();try{while(true){const r=await reader.read();if(r.done)break;size+=r.value.length;if(size>16384)throw Error('INPUT');text+=decoder.decode(r.value,{stream:true});}text+=decoder.decode();return JSON.parse(text);}finally{reader.cancel().catch(()=>{});}}
function createStockHandler({resolveContext,db,readProducts=()=>loadStockProducts({db})}){return async request=>{const input=guard(request);if(input.response)return input.response;try{const context=await resolveContext(input);authorizeAction(context,request.method==='GET'?'workspace.read':'stock.write');if(context.tenantId!==input.tenantId)return reply(403,{ok:false,code:'TENANT_ACCESS_DENIED'});
if(request.method==='GET'){const result=await db.from('moaon_stock_lots').select('id,revision,data,updated_at').eq('tenant_id',context.tenantId).order('updated_at',{ascending:false}).limit(5001);if(result.error||!Array.isArray(result.data)||result.data.length>5000)throw Error('DB');const [sales,rocket,catalog]=await Promise.all([
context.tenantId===HARIN?loadSalesWorkspace({db}).then(sales=>({sales,salesStatus:'READY'})).catch(()=>({sales:null,salesStatus:'UNAVAILABLE'})):Promise.resolve({sales:null,salesStatus:'UNAVAILABLE'}),
context.tenantId===HARIN?loadRocket({db}).then(rocket=>({rocket,rocketStatus:'READY'})).catch(()=>({rocket:[],rocketStatus:'UNAVAILABLE'})):Promise.resolve({rocket:[],rocketStatus:'UNAVAILABLE'}),
context.tenantId===HARIN?Promise.resolve().then(readProducts).then(products=>({products,productsStatus:'READY'})).catch(()=>({products:[],productsStatus:'UNAVAILABLE'})):Promise.resolve({products:[],productsStatus:'UNAVAILABLE'})]);const after=await resolveContext(input);if(['userId','tenantId','membershipVersion','sessionId','role'].some(k=>context[k]!==after[k]))return reply(409,{ok:false,code:'WORKSPACE_CHANGED'});return reply(200,{ok:true,...catalog,...rocket,...sales,value:result.data.map(r=>({...r.data,id:r.id,revision:r.revision,updatedAt:r.updated_at}))});}
let value,fields;try{value=await body(request);}catch{return reply(400,{ok:false,code:'INVALID_INPUT'});}
if(['CHOOSE_PRODUCT','REFRESH_ROCKET','SAVE_SALES_RULE','RETRY_SALES_ORDERS','INIT_SALES_RULES'].includes(value.action)){
 if(context.tenantId!==HARIN)return reply(403,{ok:false,code:'TENANT_ACCESS_DENIED'});
 const current=await resolveContext(input);authorizeAction(current,'stock.write');if(['userId','tenantId','membershipVersion','sessionId','role'].some(k=>context[k]!==current[k]))return reply(409,{ok:false,code:'WORKSPACE_CHANGED'});
 try{if(value.action==='SAVE_SALES_RULE'){await saveSalesRule({db,value,actor:context.userId});return reply(200,{ok:true,value:{saved:true}});}
 if(value.action==='RETRY_SALES_ORDERS'){await retrySalesOrders({db});return reply(200,{ok:true,value:{saved:true}});}
 if(value.action==='INIT_SALES_RULES'){const lots=await db.from('moaon_stock_lots').select('data').eq('tenant_id',HARIN).limit(5001);if(lots.error||lots.data.length>5000)throw Error('DB');const seen=new Set();for(const l of lots.data){if(l.data.productNo&&!seen.has(l.data.productNo)){seen.add(l.data.productNo);await seedSalesRules({db,productNo:l.data.productNo,unit:l.data.unit,actor:context.userId});}}return reply(200,{ok:true,value:{saved:true}});}
 if(value.action==='REFRESH_ROCKET'){const queued=await db.rpc('moaon_queue_rocket_refresh');if(queued.error)throw Error('DB');return reply(200,{ok:true,value:queued.data});}await saveProductChoice({db,tenantId:context.tenantId,value});}catch(e){if(['INVALID_CHOICE','INVALID_RULE'].includes(e.message))return reply(400,{ok:false,code:'INVALID_INPUT'});throw e;}
 return reply(200,{ok:true,value:{saved:true}});
}
try{fields=validate(value);if(!UUID.test(value.id)||!Number.isSafeInteger(value.revision)||value.revision<0)throw Error('INPUT');}catch{return reply(400,{ok:false,code:'INVALID_INPUT'});}
const current=await resolveContext(input);authorizeAction(current,'stock.write');if(['userId','tenantId','membershipVersion','sessionId','role'].some(k=>context[k]!==current[k]))return reply(409,{ok:false,code:'WORKSPACE_CHANGED'});
let previous={};
if(value.revision>0){const prior=await db.from('moaon_stock_lots').select('data,revision').eq('tenant_id',context.tenantId).eq('id',value.id).maybeSingle();if(prior.error)throw Error('DB');if(!prior.data||prior.data.revision!==value.revision)return reply(409,{ok:false,code:'STOCK_CONFLICT'});previous=prior.data.data||{};}
if(!Object.hasOwn(fields,'specialNotes'))fields.specialNotes=previous.specialNotes||'';
if(!Object.hasOwn(fields,'packLabel'))fields.packLabel=previous.packLabel||'개';
if(!Object.hasOwn(fields,'portionSize'))fields.portionSize=previous.unit===fields.unit?previous.portionSize??null:null;
if(!Object.hasOwn(fields,'productNo'))fields.productNo=previous.productNo||null;
fields.productName=null;
if(fields.productNo){
 if(context.tenantId!==HARIN)return reply(403,{ok:false,code:'TENANT_ACCESS_DENIED'});
 const product=(await readProducts()).find(p=>p.productNo===fields.productNo);
 if(!product&&fields.productNo!==previous.productNo)return reply(409,{ok:false,code:'PRODUCT_NOT_SELLING'});
 fields.productName=product?.name||previous.productName||null;
}
const finalContext=await resolveContext(input);authorizeAction(finalContext,'stock.write');if(['userId','tenantId','membershipVersion','sessionId','role'].some(k=>context[k]!==finalContext[k]))return reply(409,{ok:false,code:'WORKSPACE_CHANGED'});
const result=await db.rpc('moaon_save_stock_lot',{p_tenant:context.tenantId,p_id:value.id,p_revision:value.revision,p_data:fields,p_actor:context.userId});if(result.error){if(result.error.message?.includes('STOCK_CONFLICT'))return reply(409,{ok:false,code:'STOCK_CONFLICT'});throw Error('DB');}let salesWarning=false;if(context.tenantId===HARIN&&fields.productNo){try{await seedSalesRules({db,productNo:fields.productNo,unit:fields.unit,actor:context.userId});}catch{salesWarning=true;}}return reply(200,{ok:true,value:result.data,salesWarning});
}catch(e){const codes={AUTH_REQUIRED:401,TENANT_ACCESS_DENIED:403,PERMISSION_DENIED:403};return reply(codes[e.code]||503,{ok:false,code:codes[e.code]?e.code:'STOCK_UNAVAILABLE'});}};}
function createStockRuntime({db}){return createBusinessListRuntime({guardRequest:guard,createService:({database,identityDb,authAdmin})=>createStockHandler({db,resolveContext:createFinanceContextResolver({database,verifySession:createDashboardIdentityVerifier({db:identityDb,authAdmin,timeoutMs:10000})})})});}
module.exports={createStockRuntime,createStockHandler,guard};
