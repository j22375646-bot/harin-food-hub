import authModule from '../../../../../lib/dashboard-auth.js';
import apiSafety from '../../../../../lib/api/safety.js';
import supabaseModule from '../../../../../lib/cafe24/supabase.js';
import calendarCenter from '../../../../../lib/calendar/calendar-center.js';

export const runtime='nodejs';
export const dynamic='force-dynamic';

export async function GET(request){
  if(!apiSafety.isAuthorized(request,authModule))return apiSafety.unauthorized();
  try{
    const db=supabaseModule.getSupabase();
    const range=calendarCenter.visibleMonthRange(calendarCenter.seoulDateKey().slice(0,7));
    const result=await db.from('hub_work_items')
      .select('id,updated_at',{count:'exact'})
      .eq('context_href','/calendar')
      .neq('status','ARCHIVED')
      .like('context_label','캘린더 이벤트%')
      .gte('due_at',new Date(`${calendarCenter.addDays(range.start,-366)}T00:00:00+09:00`).toISOString())
      .lt('due_at',new Date(`${range.endExclusive}T00:00:00+09:00`).toISOString())
      .order('updated_at',{ascending:false})
      .limit(1);
    if(result.error)throw result.error;
    return apiSafety.json({
      ok:true,
      revision:result.data?.[0]?.updated_at||null,
      eventCount:Number(result.count||0),
      generatedAt:new Date().toISOString()
    });
  }catch(error){
    console.error('[calendar event revision]',{message:error.message});
    return apiSafety.json({ok:false,error:'캘린더 이벤트 변경 여부를 확인하지 못했습니다.'},{status:502});
  }
}
