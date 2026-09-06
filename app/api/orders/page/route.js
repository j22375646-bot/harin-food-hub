import authModule from '../../../../lib/dashboard-auth.js';
import apiSafety from '../../../../lib/api/safety.js';
import supabaseModule from '../../../../lib/cafe24/supabase.js';
import unified from '../../../../lib/orders/unified-orders.js';
import adapter from '../../../../lib/ui/phase28-adapters/orders.js';
import calendar from '../../../../lib/calendar/calendar-center.js';
import orderEvents from '../../../../lib/calendar/order-events.js';

export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET(request){
  if(!apiSafety.isAuthorized(request,authModule))return apiSafety.unauthorized();
  try{
    const params=new URL(request.url).searchParams;
    const db=supabaseModule.getSupabase();
    const [center,eventResult]=await Promise.all([unified.loadUnifiedOrders({db}),orderEvents.loadOrderEvents(db)]);
    if(eventResult.error)throw eventResult.error;
    const failedChannels=(center.channels||[]).filter(channel=>channel.status==='FAILED');
    // Stored-row access is not evidence of upstream authentication/readiness.
    // Connector capabilities remain owned by the dashboard shell loader.
    const orderReadStates=(center.channels||[]).map(channel=>({platform:channel.platform,status:channel.status==='FAILED'?'FAILED':'READY',source:'STORED_ORDER_QUERY'}));
    const selectedPlatform=params.get('platform')||'ALL';
    if(failedChannels.some(channel=>channel.platform===selectedPlatform)||failedChannels.length===3){
      return apiSafety.json({ok:false,code:'CHANNEL_ORDERS_UNAVAILABLE',orderReadStates,error:'선택한 채널을 불러오지 못했습니다. 이전 자료를 유지하며 다시 확인합니다.'},{status:502});
    }
    const events=eventResult.data.map(calendar.decorateEntry);
    const page=adapter.buildOrderPage(center.orders,events,{stage:params.get('stage'),platform:params.get('platform'),offset:params.get('offset'),snapshot:params.get('snapshot'),delayOnly:params.get('delayOnly')==='true',giftOnly:params.get('giftOnly')==='true'});
    const summary=adapter.buildPhase28OrdersModel({unifiedOrders:center,calendarEntries:eventResult.data,generatedAt:new Date().toISOString()});
    return apiSafety.json({ok:true,...page,orderReadStates,partial:failedChannels.length>0,warning:failedChannels.length?`${failedChannels.map(channel=>channel.platform).join(', ')} 주문 불러오기 실패 · 정상 채널의 주문은 계속 확인할 수 있습니다.`:null,workspaces:summary.workspaces,hero:summary.hero},{headers:{'Cache-Control':'private, no-store'}});
  }catch(error){
    return apiSafety.json({ok:false,code:error.code,error:error.status===409?error.message:'주문 목록을 불러오지 못했습니다.'},{status:error.status||502,headers:{'Cache-Control':'no-store'}});
  }
}
