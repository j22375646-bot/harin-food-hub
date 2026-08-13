import authModule from '../../../../lib/dashboard-auth.js';
import apiSafety from '../../../../lib/api/safety.js';
import supabaseModule from '../../../../lib/cafe24/supabase.js';
import unifiedOrdersModule from '../../../../lib/orders/unified-orders.js';
import trackingQueue from '../../../../lib/shipping/tracking-queue.js';

export const runtime='nodejs';
export const dynamic='force-dynamic';

const HUB_ORDER=/^HR-(?:C24|CP|NV)-[A-F0-9]{8}$/;

function summary(states=[]) {
  return {
    total:states.length,
    waiting:states.filter(item=>item.status==='QUEUED').length,
    inTransit:states.filter(item=>item.statusCode==='IN_TRANSIT').length,
    delivered:states.filter(item=>item.statusCode==='DELIVERED').length,
    failed:states.filter(item=>item.status==='FAILED').length
  };
}

export async function GET(request) {
  if(!apiSafety.isAuthorized(request,authModule))return apiSafety.unauthorized();
  try{
    const latest=await trackingQueue.latestTrackingByOrder(supabaseModule.getSupabase());
    const states=Object.values(latest);
    return apiSafety.json({ok:true,states,summary:summary(states)},{headers:{'Cache-Control':'no-store'}});
  }catch(error){
    console.error('[epost tracking history]',{message:error.message});
    return apiSafety.json({ok:false,error:'우체국 배송추적 기록을 불러오지 못했습니다.'},{status:500,headers:{'Cache-Control':'no-store'}});
  }
}

export async function POST(request) {
  if(!apiSafety.isAuthorized(request,authModule))return apiSafety.unauthorized();
  try{
    const body=await apiSafety.readJson(request,{maxBytes:16*1024});
    const requested=new Set((Array.isArray(body.orderIds)?body.orderIds:[]).map(value=>String(value||'').trim().toUpperCase()).filter(value=>HUB_ORDER.test(value)).slice(0,100));
    const db=supabaseModule.getSupabase();
    const center=await unifiedOrdersModule.loadUnifiedOrders({db});
    const candidates=center.orders.filter(order=>/^\d{13}$/.test(String(order.invoiceNumber||''))&&order.fulfillment!=='ROCKET_GROWTH'&&(!requested.size||requested.has(order.hubOrderId)));
    if(!candidates.length)return apiSafety.json({ok:false,error:requested.size?'선택 주문에 확인할 우체국 송장이 없습니다.':'배송상태를 확인할 진행중 우체국 송장이 없습니다.'},{status:409});
    const queued=await trackingQueue.queueTrackingForOrders(db,candidates,{kind:'manual'});
    return apiSafety.json({ok:true,pending:queued.some(item=>['PENDING','RUNNING'].includes(item.status)),queued},{status:queued.some(item=>['PENDING','RUNNING'].includes(item.status))?202:200,headers:{'Cache-Control':'no-store'}});
  }catch(error){
    console.error('[epost tracking queue]',{message:error.message});
    return apiSafety.inputErrorResponse(error)||apiSafety.json({ok:false,error:'우체국 배송상태 확인을 시작하지 못했습니다.'},{status:error.status||500});
  }
}
