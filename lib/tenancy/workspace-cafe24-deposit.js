'use strict';

const {createBusinessListRuntime}=require('./business-list-runtime.js');
const {guardBusinessListRequest}=require('./business-list-request.js');
const {createDashboardIdentityVerifier}=require('./dashboard-identity.js');
const {createFinanceContextResolver}=require('./workspace-finance-runtime.js');
const {LEGACY_HARIN_TENANT,assertLegacyHarinWorkspaceOwner}=require('./legacy-harin-workspace-access.js');
const {readJson}=require('../api/safety.js');
const {getSupabase}=require('../cafe24/supabase.js');
const cafe24=require('../cafe24/client.js');
const {getConfig}=require('../cafe24/config.js');
const {depositState,confirmDeposit,depositStorage}=require('../cafe24/deposit-confirmation.js');
const {hubOrderId}=require('../orders/unified-orders.js');

const ORDER=/^\d{8}-\d{7}$/;
const HUB=/^HR-C24-[A-F0-9]{8}$/;
const path=`/api/moaon/businesses/${LEGACY_HARIN_TENANT}/cafe24-deposit`;
function reply(status,value){
  return Response.json(value,{status,headers:{'cache-control':'private, no-store',vary:'Cookie','x-content-type-options':'nosniff'}});
}
const fail=(status,code)=>reply(status,{status:code});

function guard(request){
  const url=new URL(request.url);
  if(url.pathname!==path)return {response:fail(404,'UNAVAILABLE')};
  const read=request.method==='GET';
  if(!read&&(request.method!=='POST'||url.search||request.headers.get('origin')!==url.origin
    ||request.headers.get('content-type')?.split(';')[0].trim()!=='application/json'))return {response:fail(403,'FORBIDDEN')};
  if(read&&[...url.searchParams.keys()].join(',')!=='orderId,hubOrderId')return {response:fail(400,'INVALID')};
  const query=read?Object.fromEntries(url.searchParams):null;
  url.search='';
  const allowed=guardBusinessListRequest(new Request(url,{headers:request.headers}));
  return {...allowed,query};
}

function createDepositRequest({resolveContext,getDb=getSupabase,config=getConfig,client=cafe24}){
  return async request=>{
    const input=guard(request);
    if(input.response)return input.response;
    try{
      const identity={sessionCredential:input.sessionCredential,tenantId:LEGACY_HARIN_TENANT};
      const actor=await resolveContext(identity);
      assertLegacyHarinWorkspaceOwner(actor,LEGACY_HARIN_TENANT);
      const preview=request.method==='GET';
      const data=preview?input.query:await readJson(request,{maxBytes:1024});
      if(!data||typeof data.orderId!=='string'||!ORDER.test(data.orderId)||!HUB.test(data.hubOrderId)
        ||hubOrderId('CAFE24',data.orderId)!==data.hubOrderId)return fail(400,'INVALID');
      if(!preview&&data.refreshOnly!==true&&(data.confirm!==true||!Number.isSafeInteger(data.amount)||data.amount<=0))return fail(400,'INVALID');
      const db=getDb();
      const stored=await db.from('cafe24_orders').select('order_id').eq('order_id',data.orderId).maybeSingle();
      if(stored.error)throw stored.error;
      if(!stored.data)return fail(404,'UNAVAILABLE');
      const signal=AbortSignal.any([request.signal,AbortSignal.timeout(28000)]);
      const settings=config();
      const storage=depositStorage(db);
      const read=async orderId=>(await client.adminGet(settings,`/orders/${encodeURIComponent(orderId)}`,{embed:'items'},{signal})).payload?.order;
      if(preview){
        const value=depositState(await read(data.orderId),data.orderId);
        if(value.status==='READY'){
          const ongoing=await db.from('cafe24_deposit_confirmations').select('order_id').eq('order_id',data.orderId).maybeSingle();
          if(ongoing.error)throw ongoing.error;
          if(ongoing.data)return reply(200,{status:'CHECK_REQUIRED'});
        }
        return reply(200,value);
      }
      const reauthorize=async()=>{
        const current=await resolveContext(identity);
        assertLegacyHarinWorkspaceOwner(current,LEGACY_HARIN_TENANT);
        if(['userId','sessionId','membershipVersion'].some(key=>actor[key]!==current[key]))throw Object.assign(Error('Access changed'),{code:'TENANT_ACCESS_DENIED'});
      };
      if(data.refreshOnly===true){
        const live=await read(data.orderId);
        if(depositState(live,data.orderId).status!=='PAID')return reply(200,{status:'CHECK_REQUIRED'});
        await reauthorize();
        await storage.save(live);
        return reply(200,{status:'PAID'});
      }
      return reply(200,await confirmDeposit({orderId:data.orderId,amount:data.amount,actorId:actor.userId,read,...storage,
        reauthorize,signal,write:orderId=>client.markBankDepositPaid(settings,orderId,signal)}));
    }catch(error){
      if(error?.code==='AUTH_REQUIRED')return fail(401,'LOGIN_REQUIRED');
      if(['TENANT_ACCESS_DENIED','PERMISSION_DENIED'].includes(error?.code))return fail(403,'FORBIDDEN');
      if(error?.status===400||error?.status===413||error?.status===415)return fail(400,'INVALID');
      return fail(503,request.method==='POST'?'CHECK_REQUIRED':'UNAVAILABLE');
    }
  };
}

function createWorkspaceCafe24Deposit(){
  return createBusinessListRuntime({guardRequest:guard,createService:({database,identityDb,authAdmin})=>createDepositRequest({
    resolveContext:createFinanceContextResolver({database,verifySession:createDashboardIdentityVerifier({db:identityDb,authAdmin,timeoutMs:10000})})
  })});
}
module.exports={createDepositRequest,createWorkspaceCafe24Deposit};
