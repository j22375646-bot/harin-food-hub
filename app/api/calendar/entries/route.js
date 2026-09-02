import authModule from '../../../../lib/dashboard-auth.js';
import apiSafety from '../../../../lib/api/safety.js';
import supabaseModule from '../../../../lib/cafe24/supabase.js';
import ownerWorkspace from '../../../../lib/owner-workspace.js';
import calendarCenter from '../../../../lib/calendar/calendar-center.js';
import {revalidatePath} from 'next/cache';

export const runtime='nodejs';
export const dynamic='force-dynamic';

const ENTRY_FIELDS='id,item_type,title,body,status,priority,due_at,page_key,context_label,context_href,completed_at,created_at,updated_at';

async function calendarItem(db,id){
  const result=await db.from('hub_work_items').select(ENTRY_FIELDS).eq('id',String(id||'')).eq('context_href','/calendar').maybeSingle();
  if(result.error)throw result.error;
  if(!result.data)throw new calendarCenter.CalendarInputError('캘린더 항목을 다시 선택해주세요.');
  return result.data;
}

export async function GET(request){
  if(!apiSafety.isAuthorized(request,authModule))return apiSafety.unauthorized();
  try{
    const url=new URL(request.url);
    const from=calendarCenter.validDateKey(url.searchParams.get('from'));
    const to=calendarCenter.validDateKey(url.searchParams.get('to'));
    if(!from||!to||from>to)throw new calendarCenter.CalendarInputError('조회할 날짜 범위를 확인해주세요.');
    const db=supabaseModule.getSupabase();
    const years=Array.from({length:Number(to.slice(0,4))-Number(from.slice(0,4))+1},(_,index)=>Number(from.slice(0,4))+index);
    const [result,holidayResult]=await Promise.all([
      db.from('hub_work_items').select(ENTRY_FIELDS)
      .eq('context_href','/calendar').neq('status','ARCHIVED')
      .gte('due_at',new Date(`${calendarCenter.addDays(from,-366)}T00:00:00+09:00`).toISOString())
      .lt('due_at',new Date(`${calendarCenter.addDays(to,1)}T00:00:00+09:00`).toISOString())
      .order('due_at',{ascending:true}).limit(500),
      db.from('shipping_reference_snapshots')
        .select('provider,status,reference_year,source_data,fetched_at')
        .eq('provider','HOLIDAY_CALENDAR').eq('status','SUCCESS').in('reference_year',years)
        .order('fetched_at',{ascending:false}).limit(Math.max(10,years.length*5))
    ]);
    if(result.error)throw result.error;
    if(holidayResult.error)console.error('[calendar holiday read]',holidayResult.error);
    const entries=(result.data||[]).map(calendarCenter.decorateEntry)
      .filter(item=>item.date<=to&&(item.endDate||item.date)>=from);
    const holidayCalendar=calendarCenter.buildHolidayCalendar({snapshots:holidayResult.error?[]:(holidayResult.data||[]),from,to});
    return apiSafety.json({ok:true,entries,holidays:holidayCalendar.holidays,holidayReady:holidayCalendar.ready,holidayMissingYears:holidayCalendar.missingYears,range:{from,to},generatedAt:new Date().toISOString()});
  }catch(error){
    const status=error instanceof calendarCenter.CalendarInputError?error.status:500;
    if(status===500)console.error('[calendar read]',error);
    return apiSafety.json({ok:false,error:status===500?'캘린더를 불러오지 못했습니다.':error.message},{status});
  }
}

export async function POST(request){
  if(!apiSafety.isAuthorized(request,authModule))return apiSafety.unauthorized();
  try{
    const body=await apiSafety.readJson(request,{maxBytes:16*1024});
    const action=String(body.action||'').toUpperCase();
    const db=supabaseModule.getSupabase();
    let result;
    if(action==='CREATE_ENTRY'||action==='UPDATE_ENTRY'){
      const entry=calendarCenter.normalizeEntryInput(body);
      if(action==='UPDATE_ENTRY')await calendarItem(db,body.id);
      result=await ownerWorkspace.mutateWorkspace(db,{
        action:action==='CREATE_ENTRY'?'CREATE_ITEM':'UPDATE_ITEM',id:body.id,
        itemType:entry.type==='MEMO'?'NOTE':'TASK',title:entry.title,body:entry.type==='EVENT'?calendarCenter.encodeEventBody(entry):entry.body,priority:entry.priority,
        pageKey:'main',contextLabel:entry.contextLabel,contextHref:'/calendar',dueAt:entry.dueAt
      });
    }else if(action==='TOGGLE_ENTRY'||action==='ARCHIVE_ENTRY'){
      await calendarItem(db,body.id);
      result=await ownerWorkspace.mutateWorkspace(db,{action:action==='TOGGLE_ENTRY'?'TOGGLE_ITEM':'ARCHIVE_ITEM',id:body.id,done:Boolean(body.done)});
    }else throw new calendarCenter.CalendarInputError('지원하지 않는 캘린더 요청입니다.');
    revalidatePath('/calendar');
    revalidatePath('/');
    revalidatePath('/orders');
    return apiSafety.json({ok:true,entry:result.item?calendarCenter.decorateEntry(result.item):null,message:action==='ARCHIVE_ENTRY'?'캘린더에서 삭제했습니다.':'캘린더·메인·주문에 반영했습니다.'});
  }catch(error){
    const input=apiSafety.inputErrorResponse(error);if(input)return input;
    const status=error instanceof calendarCenter.CalendarInputError||error instanceof ownerWorkspace.OwnerWorkspaceInputError?error.status:500;
    if(status===500)console.error('[calendar write]',error);
    return apiSafety.json({ok:false,error:status===500?'캘린더에 저장하지 못했습니다.':error.message},{status});
  }
}
