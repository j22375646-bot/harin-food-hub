import authModule from '../../../../../lib/dashboard-auth.js';
import apiSafety from '../../../../../lib/api/safety.js';
import supabaseModule from '../../../../../lib/cafe24/supabase.js';
import calendarCenter from '../../../../../lib/calendar/calendar-center.js';
import orderEvents from '../../../../../lib/calendar/order-events.js';

export const runtime='nodejs';
export const dynamic='force-dynamic';

export async function GET(request){
  if(!apiSafety.isAuthorized(request,authModule))return apiSafety.unauthorized();
  try{
    const db=supabaseModule.getSupabase();
    const result=await orderEvents.loadOrderEvents(db);
    if(result.error)throw result.error;
    return apiSafety.json({
      ok:true,
      revision:calendarCenter.eventRevision(result.data||[]),
      eventCount:result.data.length,
      generatedAt:new Date().toISOString()
    });
  }catch(error){
    console.error('[calendar event revision]',{message:error.message});
    return apiSafety.json({ok:false,error:'캘린더 이벤트 변경 여부를 확인하지 못했습니다.'},{status:502});
  }
}
